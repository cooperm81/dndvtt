import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import fastifyStatic from '@fastify/static';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import 'dotenv/config';
import { registerLiveKitRoutes } from './livekit.js';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { Server } from 'socket.io';
import { randomUUID, randomInt } from 'node:crypto';
import { z } from 'zod';
import { moveSchema, rollSchema, initiativeSchema, type GameState, type Token } from '@tabletop/shared';

const app=Fastify({logger:true});
const origin=process.env.CLIENT_ORIGIN || 'http://localhost:5173';
await app.register(cors,{origin});
// PRIVATE_GAME_ACCESS_V1: shared family password; set GAME_ACCESS_PASSWORD on Railway.
const gamePassword = process.env.GAME_ACCESS_PASSWORD || '';
if (process.env.RAILWAY_ENVIRONMENT && !gamePassword) throw new Error('Set GAME_ACCESS_PASSWORD in Railway Variables before deploying');
const cookieName = 'dndvtt_access';
const signingKey = createHash('sha256').update('dndvtt-session:' + gamePassword).digest();
const equal = (a: string, b: string) => {
 const x = Buffer.from(a); const y = Buffer.from(b);
 return x.length === y.length && timingSafeEqual(x,y);
};
const sign = (data: string) => createHmac('sha256', signingKey).update(data).digest('hex');
const cookieValue = (header: string | undefined) => (header || '').split(';').map(v=>v.trim()).find(v=>v.startsWith(cookieName+'='))?.slice(cookieName.length+1) || '';
function authorized(header: string | undefined) {
 if (!gamePassword) return true; // Local development only
 const [expiry,signature,extra] = cookieValue(header).split('.');
 if (!expiry || !signature || extra || !/^\d+$/.test(expiry) || Number(expiry) < Date.now()) return false;
 return equal(signature, sign(expiry));
}
app.get('/api/auth/status', async (request) => ({authenticated:authorized(request.headers.cookie), required:!!gamePassword}));
const attempts = new Map<string,{count:number;until:number}>();
app.post('/api/auth/login', async (request,reply) => {
 const ip=request.ip; const now=Date.now(); const current=attempts.get(ip);
 if(current && current.until>now && current.count>=10) return reply.code(429).send({error:'Too many attempts. Try again in 15 minutes.'});
 const body=request.body as {password?:unknown}|null;
 const supplied=typeof body?.password==='string'?body.password:'';
 if(gamePassword && !equal(createHash('sha256').update(supplied).digest('hex'),createHash('sha256').update(gamePassword).digest('hex'))){
  const count=current && current.until>now?current.count+1:1;
  attempts.set(ip,{count,until:now+15*60*1000});
  return reply.code(401).send({error:'Incorrect access password'});
 }
 attempts.delete(ip);
 const expiry=String(Date.now()+7*24*60*60*1000);
 const secure=process.env.RAILWAY_ENVIRONMENT?' Secure;':'';
 reply.header('Set-Cookie',`${cookieName}=${expiry}.${sign(expiry)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800;${secure}`);
 return {ok:true};
});
app.addHook('onRequest',async(request,reply)=>{
 if(request.url.startsWith('/api/') && !request.url.startsWith('/api/auth/') && request.url!=='/api/health' && !authorized(request.headers.cookie))
  return reply.code(401).send({error:'Access password required'});
});
const io=new Server(app.server,{cors:{origin}});
io.use((socket,next)=>authorized(socket.handshake.headers.cookie)?next():next(new Error('Access password required')));
type Member={id:string;name:string;isDm:boolean};
type Room={state:GameState;dmSecret:string;members:Map<string,Member>};
const rooms=new Map<string,Room>();
registerLiveKitRoutes(app, (roomId, socketId) => rooms.get(roomId)?.members.get(socketId)?.name ?? null);
const shortId=()=>randomUUID().slice(0,8);
function publicRoom(room:Room){return {state:room.state,members:[...room.members.values()]};}
function send(room:Room){io.to(room.state.roomId).emit('room:state',publicRoom(room));}
app.get('/api/health',async()=>({ok:true,version:'0.1.0'}));
app.post('/api/rooms',async()=>{
 const id=shortId(),secret=randomUUID();
 const state:GameState={roomId:id,tokens:[],initiative:[],turnIndex:0,round:1,revision:0};
 rooms.set(id,{state,dmSecret:secret,members:new Map()});
 return {roomId:id,dmSecret:secret};
});
const joinSchema=z.object({roomId:z.string().min(1),name:z.string().trim().min(1).max(40),dmSecret:z.string().optional()});
io.on('connection',socket=>{
 let roomId:string|undefined;
 let member:Member|undefined;
 socket.on('room:join',(raw,reply)=>{
  if(typeof reply!=='function')return;
  const parsed=joinSchema.safeParse(raw);
  if(!parsed.success)return reply({error:'Invalid room or name'});
  const room=rooms.get(parsed.data.roomId);
  if(!room)return reply({error:'Room not found'});
  if(roomId){socket.leave(roomId);const previous=rooms.get(roomId);previous?.members.delete(socket.id);if(previous)send(previous);}
  roomId=parsed.data.roomId;
  member={id:socket.id,name:parsed.data.name,isDm:parsed.data.dmSecret===room.dmSecret};
  room.members.set(socket.id,member);socket.join(roomId);
  reply({ok:true,member});send(room);
 });
 function current(){if(!roomId||!member)return null;const room=rooms.get(roomId);return room?.members.has(socket.id)?room:null;}
 socket.on('token:add',(raw,reply)=>{
  const room=current();if(!room||!member?.isDm)return reply?.({error:'DM only'});
  const parsed=z.object({name:z.string().trim().min(1).max(40),color:z.string().regex(/^#[0-9a-fA-F]{6}$/),ownerId:z.string().nullable()}).safeParse(raw);
  if(!parsed.success)return reply?.({error:'Invalid token'});
  if(parsed.data.ownerId!==null&&!room.members.has(parsed.data.ownerId))return reply?.({error:'Unknown player'});
  const token:Token={id:randomUUID(),name:parsed.data.name,x:2,y:2,ownerId:parsed.data.ownerId,color:parsed.data.color};
  room.state.tokens.push(token);room.state.revision++;send(room);reply?.({ok:true});
 });
 socket.on('token:move',(raw,reply)=>{
  const room=current();if(!room||!member)return reply?.({error:'Not joined'});
  const parsed=moveSchema.safeParse(raw);if(!parsed.success)return reply?.({error:'Invalid move'});
  const token=room.state.tokens.find(t=>t.id===parsed.data.tokenId);
  if(!token)return reply?.({error:'Token not found'});
  if(!member.isDm&&token.ownerId!==member.id)return reply?.({error:'Not your token'});
  token.x=parsed.data.x;token.y=parsed.data.y;room.state.revision++;send(room);reply?.({ok:true});
 });
 socket.on('initiative:add',(raw,reply)=>{
  const room=current();if(!room||!member?.isDm)return reply?.({error:'DM only'});
  const parsed=z.object({name:z.string().trim().min(1).max(40),score:z.number().int().min(-100).max(100)}).safeParse(raw);
  if(!parsed.success)return reply?.({error:'Invalid initiative'});
  const item={id:randomUUID(),...parsed.data};initiativeSchema.parse(item);
  room.state.initiative.push(item);room.state.initiative.sort((a,b)=>b.score-a.score);room.state.turnIndex=0;room.state.round=1;room.state.revision++;send(room);reply?.({ok:true});
 });
 socket.on('initiative:next',(_,reply)=>{
  const room=current();if(!room||!member?.isDm)return reply?.({error:'DM only'});
  if(room.state.initiative.length){room.state.turnIndex++;if(room.state.turnIndex>=room.state.initiative.length){room.state.turnIndex=0;room.state.round++;}room.state.revision++;send(room);}reply?.({ok:true});
 });
 socket.on('dice:roll',(raw,reply)=>{
  const room=current();if(!room||!member)return reply?.({error:'Not joined'});
  const parsed=rollSchema.safeParse(raw);if(!parsed.success)return reply?.({error:'Invalid dice'});
  const {count,sides,modifier}=parsed.data;const dice=Array.from({length:count},()=>randomInt(1,sides+1));
  const result={by:member.name,dice,modifier,total:dice.reduce((a,b)=>a+b,modifier),sides,at:new Date().toISOString()};
  io.to(room.state.roomId).emit('dice:result',result);reply?.({ok:true});
 });
 socket.on('disconnect',()=>{if(roomId){const room=rooms.get(roomId);room?.members.delete(socket.id);if(room)send(room);}});
});
// Serve the compiled React frontend and game API on one Railway service.
const frontendDist = resolve(dirname(fileURLToPath(import.meta.url)), '../../web/dist');
await app.register(fastifyStatic, { root: frontendDist, prefix: '/' });
app.setNotFoundHandler((request, reply) => {
  if (request.method === 'GET' && !request.url.startsWith('/api/') && !request.url.startsWith('/socket.io/')) {
    return reply.sendFile('index.html');
  }
  return reply.code(404).send({ error: 'Not found' });
});
const port=Number(process.env.PORT||3001);
await app.listen({port,host:'0.0.0.0'});
