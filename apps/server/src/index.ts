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
import { moveSchema, rollSchema, initiativeSchema, type GameState, type Token, creatureSizeSchema, tokenFootprint } from '@tabletop/shared';

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
const io=new Server(app.server,{cors:{origin},maxHttpBufferSize:18_000_000});
io.use((socket,next)=>authorized(socket.handshake.headers.cookie)?next():next(new Error('Access password required')));
type Member={id:string;name:string;isDm:boolean;playerId:string}; // CHARACTER_PHASE3_V05
// PRESENCE_V05: membership is authoritative at room join, independent of LiveKit media.
// CAMPAIGN_PHASE1_V05: campaign assets and scenes remain server-side and DM-only.
type Scene={id:string;name:string;state:Omit<GameState,'roomId'|'revision'>};
type Character={sheet?:z.infer<typeof sheetSchema>;format:'dndvtt-character';formatVersion:1;id:string;playerId:string|null;name:string;ancestry:string;characterClass:string;level:number;size:'Small'|'Medium'|'Large'|'Huge'|'Gargantuan';armorClass:number;hitPoints:{current:number;maximum:number};speed:number};
// CHARACTER_SHEET_V06: optional, backward-compatible 2014 5e sheet fields.
const ability=z.number().int().min(1).max(30);
const sheetSchema=z.object({abilities:z.object({str:ability,dex:ability,con:ability,int:ability,wis:ability,cha:ability}).strict(),proficiencies:z.object({savingThrows:z.array(z.enum(['str','dex','con','int','wis','cha'])).max(6),skills:z.array(z.enum(['Acrobatics','Animal Handling','Arcana','Athletics','Deception','History','Insight','Intimidation','Investigation','Medicine','Nature','Perception','Performance','Persuasion','Religion','Sleight of Hand','Stealth','Survival'])).max(18)}).strict(),hitDice:z.object({total:z.number().int().min(0).max(20),remaining:z.number().int().min(0).max(20),die:z.number().int().min(4).max(20)}).strict(),temporaryHitPoints:z.number().int().min(0).max(9999),deathSaves:z.object({successes:z.number().int().min(0).max(3),failures:z.number().int().min(0).max(3)}).strict(),conditions:z.array(z.enum(['Blinded','Charmed','Deafened','Exhaustion','Frightened','Grappled','Incapacitated','Invisible','Paralyzed','Petrified','Poisoned','Prone','Restrained','Stunned','Unconscious'])).max(15),notes:z.string().max(4000)}).strict();
const characterSchema=z.object({format:z.literal('dndvtt-character'),formatVersion:z.literal(1),id:z.string().uuid(),playerId:z.string().uuid().nullable(),name:z.string().trim().min(1).max(80),ancestry:z.string().max(80),characterClass:z.string().max(80),level:z.number().int().min(1).max(20),size:creatureSizeSchema,armorClass:z.number().int().min(0).max(50),hitPoints:z.object({current:z.number().int().min(0).max(9999),maximum:z.number().int().min(1).max(9999)}).strict(),speed:z.number().int().min(0).max(500),sheet:sheetSchema.optional()}).strict();
type Campaign={format:'dndvtt-campaign';formatVersion:1;id:string;name:string;activeSceneId:string;scenes:Scene[];characters:Character[]};
type Room={state:GameState;dmSecret:string;members:Map<string,Member>;campaign:Campaign};
const sceneState=(state:GameState):Scene['state']=>({tokens:structuredClone(state.tokens),initiative:structuredClone(state.initiative),turnIndex:state.turnIndex,round:state.round,encounterMode:state.encounterMode,playerMovementEnabled:state.playerMovementEnabled,battleMap:state.battleMap?structuredClone(state.battleMap):undefined});
const makeCampaign=(state:GameState):Campaign=>{const id=randomUUID();return {format:'dndvtt-campaign',formatVersion:1,id:randomUUID(),name:'Untitled Campaign',activeSceneId:id,scenes:[{id,name:'Scene 1',state:sceneState(state)}],characters:[]};};
const sceneSchema=z.object({id:z.string().uuid(),name:z.string().trim().min(1).max(80),state:z.object({
 tokens:z.array(z.object({id:z.string().uuid(),name:z.string().min(1).max(40),x:z.number().finite().min(0).max(10000),y:z.number().finite().min(0).max(10000),ownerId:z.string().nullable(),color:z.string().regex(/^#[0-9a-fA-F]{6}$/),size:creatureSizeSchema.optional(),staged:z.boolean().optional(),prepared:z.boolean().optional(),defeated:z.boolean().optional()})).max(500),
 initiative:z.array(initiativeSchema).max(500),turnIndex:z.number().int().min(0).max(500),round:z.number().int().min(1).max(1000000),encounterMode:z.enum(['exploration','combat']).optional(),playerMovementEnabled:z.boolean().optional(),battleMap:z.object({image:z.string().max(2800000).refine(v=>v===''||/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(v)),width:z.number().int().min(200).max(4000),height:z.number().int().min(200).max(4000),cellSize:z.number().int().min(16).max(200),offsetX:z.number().int().min(-2000).max(2000),offsetY:z.number().int().min(-2000).max(2000),showGrid:z.boolean()}).optional()
 }).strict()}).strict();
const campaignSchema=z.object({format:z.literal('dndvtt-campaign'),formatVersion:z.literal(1),id:z.string().uuid(),name:z.string().trim().min(1).max(100),activeSceneId:z.string().uuid(),scenes:z.array(sceneSchema).min(1).max(30),characters:z.array(characterSchema).max(100).default([])}).strict().refine(c=>c.scenes.some(sc=>sc.id===c.activeSceneId),'Active scene missing').refine(c=>new Set(c.scenes.map(sc=>sc.id)).size===c.scenes.length,'Duplicate scene IDs');
function saveActive(room:Room){const sc=room.campaign.scenes.find(x=>x.id===room.campaign.activeSceneId);if(sc)sc.state=sceneState(room.state);}
function activateScene(room:Room,id:string){const scene=room.campaign.scenes.find(x=>x.id===id);if(!scene)return false;room.campaign.activeSceneId=id;room.state={...structuredClone(scene.state),roomId:room.state.roomId,revision:room.state.revision+1};return true;}
function campaignSummary(room:Room){return {id:room.campaign.id,name:room.campaign.name,activeSceneId:room.campaign.activeSceneId,scenes:room.campaign.scenes.map(sc=>({id:sc.id,name:sc.name})),characters:room.campaign.characters.map(c=>({id:c.id,name:c.name,playerId:c.playerId,characterClass:c.characterClass,level:c.level}))};}
function sendCampaign(room:Room){for(const m of room.members.values())if(m.isDm)io.to(m.id).emit('campaign:summary',campaignSummary(room));}

const rooms=new Map<string,Room>();
registerLiveKitRoutes(app, (roomId, socketId) => rooms.get(roomId)?.members.get(socketId)?.name ?? null);
const shortId=()=>randomUUID().slice(0,8);
// AMBUSH_TRAY_032: never transmit hidden tokens to a non-DM socket.
function publicRoom(room:Room,viewer:Member){
 const state={...room.state,tokens:viewer.isDm?room.state.tokens:room.state.tokens.filter(t=>!t.staged)};
 return {state,members:[...room.members.values()]};
}
function send(room:Room){
 for(const m of room.members.values())io.to(m.id).emit('room:state',publicRoom(room,m));
}
app.get('/api/health',async()=>({ok:true,version:'0.7.0'}));
app.post('/api/rooms',async()=>{
 const id=shortId(),secret=randomUUID();
 const state:GameState={roomId:id,tokens:[],initiative:[],turnIndex:0,round:1,revision:0,encounterMode:'exploration',playerMovementEnabled:true};
 rooms.set(id,{state,dmSecret:secret,members:new Map(),campaign:makeCampaign(state)});
 return {roomId:id,dmSecret:secret};
});
const mapSchema=z.object({
 image:z.string().max(2800000).refine(v=>v===''||/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(v),'Invalid image'),
 width:z.number().int().min(200).max(4000),height:z.number().int().min(200).max(4000),
 cellSize:z.number().int().min(16).max(200),offsetX:z.number().int().min(-2000).max(2000),offsetY:z.number().int().min(-2000).max(2000),showGrid:z.boolean()
});
const tokenEditSchema=z.object({tokenId:z.string().uuid(),name:z.string().trim().min(1).max(40),color:z.string().regex(/^#[0-9a-fA-F]{6}$/),ownerId:z.string().nullable(),size:creatureSizeSchema});
const joinSchema=z.object({roomId:z.string().min(1),name:z.string().trim().min(1).max(40),dmSecret:z.string().optional(),playerId:z.string().uuid()});
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
  member={id:socket.id,name:parsed.data.name,isDm:parsed.data.dmSecret===room.dmSecret,playerId:parsed.data.playerId};
  if([...room.members.values()].some(m=>m.playerId===member!.playerId))return reply({error:'This player identity is already connected. Close the other tab first.'});
  if([...room.members.values()].some(m=>m.name.trim().toLocaleLowerCase()===member!.name.trim().toLocaleLowerCase()))return reply({error:'That player name is already in use in this room.'});
  room.members.set(socket.id,member);socket.join(roomId);
  reply({ok:true,member});send(room);if(member.isDm)sendCampaign(room);
  socket.to(roomId).emit('presence:event',{kind:'joined',name:member.name,at:Date.now()});
 });
 function current(){if(!roomId||!member)return null;const room=rooms.get(roomId);return room?.members.has(socket.id)?room:null;}
 socket.on('character:save',(raw,reply)=>{
  const room=current();if(!room||!member)return reply?.({error:'Not joined'});
  const parsed=characterSchema.safeParse(raw);if(!parsed.success)return reply?.({error:'Invalid character file'});
  const c=parsed.data;const characters=room.campaign.characters;
  const index=characters.findIndex(x=>x.id===c.id);
  if(!member.isDm&&(index<0||characters[index].playerId!==member.playerId||c.playerId!==member.playerId))return reply?.({error:'Not your character'});
  if(index<0&&characters.length>=100)return reply?.({error:'Maximum 100 characters'});
  if(c.playerId&&characters.some(x=>x.id!==c.id&&x.playerId===c.playerId))return reply?.({error:'Player already has a character'});
  if(index<0)characters.push(c);else characters[index]=c;
  room.state.revision++;send(room);sendCampaign(room);reply?.({ok:true});
 });
 socket.on('character:get',(raw,reply)=>{const room=current();if(!room||!member)return reply?.({error:'Not joined'});const p=z.object({id:z.string().uuid()}).safeParse(raw);if(!p.success)return reply?.({error:'Invalid ID'});const c=room.campaign.characters.find(x=>x.id===p.data.id);if(!c||(!member.isDm&&c.playerId!==member.playerId))return reply?.({error:'Character unavailable'});reply?.({ok:true,character:structuredClone(c)});});
 socket.on('character:mine',(_,reply)=>{const room=current();if(!room||!member)return reply?.({error:'Not joined'});reply?.({ok:true,characters:room.campaign.characters.filter(c=>c.playerId===member!.playerId).map(c=>({id:c.id,name:c.name}))});});
 socket.on('character:export',(raw,reply)=>{
  const room=current();if(!room||!member)return reply?.({error:'Not joined'});
  const parsed=z.object({id:z.string().uuid()}).safeParse(raw);if(!parsed.success)return reply?.({error:'Invalid character'});
  const c=room.campaign.characters.find(x=>x.id===parsed.data.id);
  if(!c||(!member.isDm&&c.playerId!==member.playerId))return reply?.({error:'Character unavailable'});
  reply?.({ok:true,character:structuredClone(c)});
 });
 socket.on('campaign:export',(_,reply)=>{
  const room=current();if(!room||!member?.isDm)return reply?.({error:'DM only'});
  saveActive(room);reply?.({ok:true,campaign:structuredClone(room.campaign),revision:room.state.revision});
 });
 socket.on('campaign:import',(raw,reply)=>{
  const room=current();if(!room||!member?.isDm)return reply?.({error:'DM only'});
  const parsed=campaignSchema.safeParse(raw);
  if(!parsed.success)return reply?.({error:'Invalid or unsupported campaign file'});
  const next=structuredClone(parsed.data);
  // Legacy socket-based owners cannot be trusted across sessions.
  next.characters??=[];
  for(const scene of next.scenes)for(const token of scene.state.tokens)if(token.ownerId&&!z.string().uuid().safeParse(token.ownerId).success)token.ownerId=null;
  room.campaign=next;activateScene(room,next.activeSceneId);send(room);sendCampaign(room);reply?.({ok:true});
 });
 socket.on('campaign:rename',(raw,reply)=>{
  const room=current();if(!room||!member?.isDm)return reply?.({error:'DM only'});
  const p=z.string().trim().min(1).max(100).safeParse(raw?.name);if(!p.success)return reply?.({error:'Invalid name'});
  room.campaign.name=p.data;room.state.revision++;send(room);sendCampaign(room);reply?.({ok:true});
 });
 socket.on('campaign:scene:add',(raw,reply)=>{
  const room=current();if(!room||!member?.isDm)return reply?.({error:'DM only'});
  const p=z.string().trim().min(1).max(80).safeParse(raw?.name);if(!p.success)return reply?.({error:'Invalid scene name'});
  if(room.campaign.scenes.length>=30)return reply?.({error:'Maximum 30 scenes'});
  saveActive(room);const id=randomUUID();room.campaign.scenes.push({id,name:p.data,state:{tokens:[],initiative:[],turnIndex:0,round:1,encounterMode:'exploration',playerMovementEnabled:true}});
  activateScene(room,id);send(room);sendCampaign(room);reply?.({ok:true});
 });
 // CAMPAIGN_PHASE2_V05: scene renames preserve IDs and all scene data.
 socket.on('campaign:scene:rename',(raw,reply)=>{
  const room=current();if(!room||!member?.isDm)return reply?.({error:'DM only'});
  const p=z.object({id:z.string().uuid(),name:z.string().trim().min(1).max(80)}).safeParse(raw);
  if(!p.success)return reply?.({error:'Invalid scene name'});
  const scene=room.campaign.scenes.find(sc=>sc.id===p.data.id);
  if(!scene)return reply?.({error:'Unknown scene'});
  scene.name=p.data.name;room.state.revision++;send(room);sendCampaign(room);reply?.({ok:true});
 });
 socket.on('campaign:scene:switch',(raw,reply)=>{
  const room=current();if(!room||!member?.isDm)return reply?.({error:'DM only'});
  const p=z.string().uuid().safeParse(raw?.id);if(!p.success||!room.campaign.scenes.some(sc=>sc.id===p.data))return reply?.({error:'Unknown scene'});
  saveActive(room);activateScene(room,p.data);send(room);sendCampaign(room);reply?.({ok:true});
 });
 socket.on('encounter:mode',(raw,reply)=>{
  const room=current();if(!room||!member?.isDm)return reply?.({error:'DM only'});
  const parsed=z.enum(['exploration','combat']).safeParse(raw?.mode);
  if(!parsed.success)return reply?.({error:'Invalid encounter mode'});
  room.state.encounterMode=parsed.data;room.state.revision++;send(room);reply?.({ok:true});
 });
 socket.on('settings:movement',(raw,reply)=>{
  const room=current();if(!room||!member?.isDm)return reply?.({error:'DM only'});
  const parsed=z.boolean().safeParse(raw?.enabled);
  if(!parsed.success)return reply?.({error:'Invalid movement setting'});
  room.state.playerMovementEnabled=parsed.data;room.state.revision++;send(room);reply?.({ok:true});
 });
 socket.on('map:update',(raw,reply)=>{
  const room=current();if(!room||!member?.isDm)return reply?.({error:'DM only'});
  const parsed=mapSchema.safeParse(raw);if(!parsed.success)return reply?.({error:'Invalid map or image too large (max ~2 MB)'});
  room.state.battleMap=parsed.data;room.state.revision++;send(room);reply?.({ok:true});
 });
 socket.on('token:edit',(raw,reply)=>{
  const room=current();if(!room||!member?.isDm)return reply?.({error:'DM only'});
  const parsed=tokenEditSchema.safeParse(raw);if(!parsed.success)return reply?.({error:'Invalid token edit'});
  const token=room.state.tokens.find(t=>t.id===parsed.data.tokenId);
  if(!token)return reply?.({error:'Token not found'});
  if(parsed.data.ownerId!==null&&!room.members.has(parsed.data.ownerId)&&![...room.members.values()].some(m=>m.playerId===parsed.data.ownerId)&&!room.campaign.characters.some(c=>c.playerId===parsed.data.ownerId))return reply?.({error:'Unknown owner'});
  const newFootprint=tokenFootprint(parsed.data.size);
  if((!token.staged||token.prepared)&&room.state.tokens.some(other=>other.id!==token.id&&(!other.staged||other.prepared)&&parsed.data.size!==token.size&&token.x<other.x+tokenFootprint(other.size)&&token.x+newFootprint>other.x&&token.y<other.y+tokenFootprint(other.size)&&token.y+newFootprint>other.y))return reply?.({error:'Size would overlap another token'});
  Object.assign(token,{name:parsed.data.name,color:parsed.data.color,ownerId:room.members.get(parsed.data.ownerId||'')?.playerId??parsed.data.ownerId,size:parsed.data.size});room.state.revision++;send(room);reply?.({ok:true});
 });
 // V07_PHASE42: token/initiative identity, preserving turn order when a combatant leaves.
 const linkedInitiative=(room:Room,token:Token)=>{
  const explicit=room.state.initiative.filter(i=>i.tokenId===token.id);
  if(explicit.length)return explicit.map(i=>i.id);
  // Legacy initiative entries have no tokenId. Only match unambiguous names.
  const matchingTokens=room.state.tokens.filter(t=>t.name===token.name);
  const matchingEntries=room.state.initiative.filter(i=>i.name===token.name&&!i.tokenId);
  return matchingTokens.length===1&&matchingEntries.length===1?[matchingEntries[0].id]:[];
 };
 const removeInitiative=(room:Room,ids:string[])=>{
  const removed=new Set(ids);
  const before=room.state.initiative;
  const current=before[room.state.turnIndex]?.id;
  const next=before.filter(i=>!removed.has(i.id));
  if(next.length===before.length)return;
  room.state.initiative=next;
  if(!next.length){room.state.turnIndex=0;return;}
  const same=next.findIndex(i=>i.id===current);
  if(same>=0){room.state.turnIndex=same;return;}
  const previousIndex=room.state.turnIndex;
  const forward=before.slice(previousIndex+1).concat(before.slice(0,previousIndex)).find(i=>!removed.has(i.id));
  room.state.turnIndex=Math.max(0,next.findIndex(i=>i.id===forward?.id));
 };
 socket.on('token:defeated',(raw,reply)=>{
  const room=current();if(!room||!member?.isDm)return reply?.({error:'DM only'});
  const parsed=z.object({tokenId:z.string().uuid(),defeated:z.boolean()}).safeParse(raw);
  if(!parsed.success)return reply?.({error:'Invalid token state'});
  const token=room.state.tokens.find(t=>t.id===parsed.data.tokenId);
  if(!token)return reply?.({error:'Token not found'});
  token.defeated=parsed.data.defeated;
  if(token.defeated)removeInitiative(room,linkedInitiative(room,token));
  room.state.revision++;send(room);reply?.({ok:true});
 });
 socket.on('initiative:remove-token',(raw,reply)=>{
  const room=current();if(!room||!member?.isDm)return reply?.({error:'DM only'});
  const parsed=z.object({tokenId:z.string().uuid()}).safeParse(raw);
  if(!parsed.success)return reply?.({error:'Invalid token'});
  const token=room.state.tokens.find(t=>t.id===parsed.data.tokenId);
  if(!token)return reply?.({error:'Token not found'});
  const ids=linkedInitiative(room,token);
  if(!ids.length)return reply?.({error:'No unambiguous initiative entry linked to this token'});
  removeInitiative(room,ids);room.state.revision++;send(room);reply?.({ok:true});
 });
 socket.on('token:delete',(raw,reply)=>{
  const room=current();if(!room||!member?.isDm)return reply?.({error:'DM only'});
  const parsed=z.object({tokenId:z.string().uuid()}).safeParse(raw);if(!parsed.success)return reply?.({error:'Invalid token'});
  const deleted=room.state.tokens.find(t=>t.id===parsed.data.tokenId);if(deleted)removeInitiative(room,linkedInitiative(room,deleted));room.state.tokens=room.state.tokens.filter(t=>t.id!==parsed.data.tokenId);room.state.revision++;send(room);reply?.({ok:true});
 });
 socket.on('token:add',(raw,reply)=>{
  const room=current();if(!room||!member?.isDm)return reply?.({error:'DM only'});
  const parsed=z.object({name:z.string().trim().min(1).max(40),color:z.string().regex(/^#[0-9a-fA-F]{6}$/),ownerId:z.string().nullable(),size:creatureSizeSchema.optional(),x:z.number().int().min(0).max(10000).optional(),y:z.number().int().min(0).max(10000).optional()}).safeParse(raw);
  if(!parsed.success)return reply?.({error:'Invalid token'});
  if(parsed.data.ownerId!==null&&!room.members.has(parsed.data.ownerId)&&![...room.members.values()].some(m=>m.playerId===parsed.data.ownerId))return reply?.({error:'Unknown player'});
  const placed=parsed.data.x!==undefined&&parsed.data.y!==undefined;
  if((parsed.data.x===undefined)!==(parsed.data.y===undefined))return reply?.({error:'Both coordinates are required'});
  if(placed){
   const map=room.state.battleMap??{width:1200,height:800,cellSize:50,offsetX:0,offsetY:0};
   const size=tokenFootprint(parsed.data.size??'Medium');
   const x=parsed.data.x!,y=parsed.data.y!;
   if(map.offsetX+x*map.cellSize<0||map.offsetY+y*map.cellSize<0||map.offsetX+(x+size)*map.cellSize>map.width||map.offsetY+(y+size)*map.cellSize>map.height)return reply?.({error:'Token is outside map bounds'});
   if(room.state.tokens.some(t=>(!t.staged||t.prepared)&&x<t.x+tokenFootprint(t.size)&&x+size>t.x&&y<t.y+tokenFootprint(t.size)&&y+size>t.y))return reply?.({error:'Square occupied. Choose an empty location'});
  }
  const token:Token={id:randomUUID(),name:parsed.data.name,x:placed?parsed.data.x!:2,y:placed?parsed.data.y!:2,ownerId:room.members.get(parsed.data.ownerId||'')?.playerId??parsed.data.ownerId,color:parsed.data.color,size:parsed.data.size??'Medium',staged:!placed,prepared:false};
  room.state.tokens.push(token);room.state.revision++;send(room);reply?.({ok:true});
 });
 socket.on('token:move',(raw,reply)=>{
  const traceServer=(detail:Record<string,unknown>)=>{const r=current();if(r)for(const m of r.members.values())if(m.isDm)io.to(m.id).emit('debug:server',detail);};
  const room=current();if(!room||!member)return reply?.({error:'Not joined'});
  const parsed=moveSchema.safeParse(raw);if(!parsed.success)return reply?.({error:'Invalid move'});
  const token=room.state.tokens.find(t=>t.id===parsed.data.tokenId);
  if(!token)return reply?.({error:'Token not found'});
  if(!member.isDm&&(!room.state.playerMovementEnabled||token.staged||token.ownerId!==member.playerId))return reply?.({error:'DM controls token movement'});
  // Authoritative bounds check: stacking privileges never permit leaving the map.
  const moveMap=room.state.battleMap??{width:1200,height:800,cellSize:50,offsetX:0,offsetY:0};
  const moveSize=tokenFootprint(token.size);
  if(moveMap.offsetX+parsed.data.x*moveMap.cellSize<0||moveMap.offsetY+parsed.data.y*moveMap.cellSize<0||moveMap.offsetX+(parsed.data.x+moveSize)*moveMap.cellSize>moveMap.width||moveMap.offsetY+(parsed.data.y+moveSize)*moveMap.cellSize>moveMap.height)return reply?.({error:'Token cannot move outside map bounds'});
  // Check occupancy on the authoritative state. Never disclose hidden occupants to players.
  const footprint=tokenFootprint(token.size);
  const occupied=room.state.tokens.some(t=>t.id!==token.id && (t.staged?!!t.prepared:true) && parsed.data.x<t.x+tokenFootprint(t.size)&&parsed.data.x+footprint>t.x&&parsed.data.y<t.y+tokenFootprint(t.size)&&parsed.data.y+footprint>t.y);
  if(occupied){
   if(!member.isDm)return reply?.({error:'Move unavailable'});
   if(raw?.allowStack!==true)return reply?.({error:'Square occupied. Use DM override to stack.'});
  }
  const debugOldPosition={x:token.x,y:token.y};
  token.x=parsed.data.x;token.y=parsed.data.y;
  traceServer({at:new Date().toISOString(),by:member.id,tokenId:token.id,name:token.name,from:debugOldPosition,to:{x:token.x,y:token.y},revision:room.state.revision+1});
  if(member.isDm&&token.staged)token.prepared=true;room.state.revision++;send(room);reply?.({ok:true});
 });
 // Hidden tokens can be positioned privately; reveal operations broadcast once.
 socket.on('token:stage',(raw,reply)=>{
  const room=current();if(!room||!member?.isDm)return reply?.({error:'DM only'});
  const parsed=z.object({tokenId:z.string().uuid()}).safeParse(raw);
  if(!parsed.success)return reply?.({error:'Invalid token'});
  const t=room.state.tokens.find(t=>t.id===parsed.data.tokenId);
  if(!t)return reply?.({error:'Token not found'});
  t.staged=true;t.prepared=false;room.state.revision++;send(room);reply?.({ok:true});
 });
 socket.on('token:reveal',(raw,reply)=>{
  const room=current();if(!room||!member?.isDm)return reply?.({error:'DM only'});
  const parsed=z.object({tokenIds:z.array(z.string().uuid()).min(1).max(200)}).safeParse(raw);
  if(!parsed.success)return reply?.({error:'Invalid reveal request'});
  const ids=new Set(parsed.data.tokenIds);
  for(const t of room.state.tokens)if(ids.has(t.id)&&t.staged&&t.prepared){
   const collision=room.state.tokens.some(other=>other.id!==t.id&&(other.staged?!!other.prepared:true)&&t.x<other.x+tokenFootprint(other.size)&&t.x+tokenFootprint(t.size)>other.x&&t.y<other.y+tokenFootprint(other.size)&&t.y+tokenFootprint(t.size)>other.y);
   if(collision)return reply?.({error:'Cannot reveal onto an occupied square; reposition first'});
  }
  for(const t of room.state.tokens)if(ids.has(t.id)&&t.staged&&t.prepared)t.staged=false;
  room.state.revision++;send(room);reply?.({ok:true});
 });
 socket.on('initiative:add',(raw,reply)=>{
  const room=current();if(!room||!member?.isDm)return reply?.({error:'DM only'});
  const parsed=z.object({name:z.string().trim().min(1).max(40),score:z.number().int().min(-100).max(100),tokenId:z.string().uuid().optional()}).safeParse(raw);
  if(!parsed.success)return reply?.({error:'Invalid initiative'});
  const candidate=parsed.data.tokenId?room.state.tokens.find(t=>t.id===parsed.data.tokenId):undefined;
  if(parsed.data.tokenId&&!candidate)return reply?.({error:'Token not found'});
  if(candidate?.defeated)return reply?.({error:'Revive token before adding to initiative'});
  const sameName=room.state.tokens.filter(t=>t.name===parsed.data.name&&!t.defeated);
  const tokenId=parsed.data.tokenId??(sameName.length===1?sameName[0].id:undefined);
  const item={id:randomUUID(),...parsed.data,tokenId};initiativeSchema.parse(item);
  room.state.initiative.push(item);room.state.initiative.sort((a,b)=>b.score-a.score);room.state.turnIndex=0;room.state.round=1;room.state.revision++;send(room);reply?.({ok:true});
 });
 socket.on('initiative:next',(_,reply)=>{
  const room=current();if(!room||!member?.isDm)return reply?.({error:'DM only'});
  if(room.state.initiative.length){room.state.turnIndex++;if(room.state.turnIndex>=room.state.initiative.length){room.state.turnIndex=0;room.state.round++;}room.state.revision++;send(room);}reply?.({ok:true});
 });
 // CHARACTER_DICE_V06: server rolls both d20s and chooses the correct one.
 socket.on('dice:character',(raw,reply)=>{
  const room=current();if(!room||!member)return reply?.({error:'Not joined'});
  const parsed=z.object({label:z.string().min(1).max(90),modifier:z.number().int().min(-100).max(100),advantage:z.enum(['normal','advantage','disadvantage'])}).strict().safeParse(raw);
  if(!parsed.success)return reply?.({error:'Invalid character roll'});
  const {label,modifier,advantage}=parsed.data;const dice=Array.from({length:advantage==='normal'?1:2},()=>randomInt(1,21));
  const selected=advantage==='advantage'?Math.max(...dice):advantage==='disadvantage'?Math.min(...dice):dice[0];
  const result={by:member.name,dice,modifier,total:selected+modifier,sides:20,at:new Date().toISOString(),label,advantage};
  io.to(room.state.roomId).emit('dice:result',result);reply?.({ok:true});
 });
 socket.on('dice:roll',(raw,reply)=>{
  const room=current();if(!room||!member)return reply?.({error:'Not joined'});
  const parsed=rollSchema.safeParse(raw);if(!parsed.success)return reply?.({error:'Invalid dice'});
  const {count,sides,modifier}=parsed.data;const dice=Array.from({length:count},()=>randomInt(1,sides+1));
  const result={by:member.name,dice,modifier,total:dice.reduce((a,b)=>a+b,modifier),sides,at:new Date().toISOString()};
  io.to(room.state.roomId).emit('dice:result',result);reply?.({ok:true});
 });
 socket.on('disconnect',()=>{if(roomId){const room=rooms.get(roomId);room?.members.delete(socket.id);if(room){send(room);if(member)socket.to(roomId).emit('presence:event',{kind:'left',name:member.name,at:Date.now()});}}});
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
