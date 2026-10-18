import {useEffect,useRef,useState} from 'react';
import type {GameState} from '@tabletop/shared';

type Entry={seq:number;at:string;ms:number;kind:string;detail:Record<string,unknown>};
const MAX=5000;
let events:Entry[]=[];
let seq=0;
let enabled=false;
let subscribers=new Set<()=>void>();
function notify(){for(const fn of subscribers)fn();}
export function trace(kind:string,detail:Record<string,unknown>={}){
 if(!enabled)return;
 events.push({seq:++seq,at:new Date().toISOString(),ms:Math.round(performance.now()),kind,detail});
 if(events.length>MAX)events.splice(0,events.length-MAX);
 notify();
}
function positions(state:GameState){return state.tokens.map(t=>({id:t.id,name:t.name,x:t.x,y:t.y,staged:!!t.staged,prepared:!!t.prepared}));}
let lastState:ReturnType<typeof positions>|null=null;
export function traceRoomState(state:GameState){
 if(!enabled)return;
 const next=positions(state);
 const before=new Map((lastState??[]).map(t=>[t.id,t]));
 for(const t of next){
  const old=before.get(t.id);
  if(!old)trace('STATE_TOKEN_ADDED',{token:t,revision:state.revision});
  else if(old.x!==t.x||old.y!==t.y||old.staged!==t.staged||old.prepared!==t.prepared)
   trace('STATE_TOKEN_CHANGED',{id:t.id,name:t.name,from:old,to:t,revision:state.revision});
  before.delete(t.id);
 }
 for(const t of before.values())trace('STATE_TOKEN_REMOVED',{token:t,revision:state.revision});
 lastState=next;
}
export function traceOutgoing(event:string,payload:unknown){
 if(!enabled||!['token:move','token:stage','token:reveal','token:add','token:edit','token:delete','map:update'].includes(event))return;
 if(event==='map:update')trace('CLIENT_SEND_MAP_UPDATE',{note:'Map image omitted'});
 else trace('CLIENT_SEND_'+event.toUpperCase().replace(':','_'),{payload});
}
function nodeInfo(target:EventTarget|null){
 if(!(target instanceof Element))return {tag:'unknown'};
 const token=target.closest('[data-token-id]');
 return {tag:target.tagName.toLowerCase(),className:typeof target.className==='string'?target.className.slice(0,120):'',tokenId:token?.getAttribute('data-token-id')??null,insideMap:!!target.closest('.battle-canvas'),insideTray:!!target.closest('.ambush-tray')};
}
function download(){
 const data={app:'dndvtt',version:'v0.4.0',exportedAt:new Date().toISOString(),note:'DM browser diagnostic log. No chat, credentials, or map images included.',events};
 const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
 const a=document.createElement('a');a.href=url;a.download=`dndvtt-debug-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;a.click();
 setTimeout(()=>URL.revokeObjectURL(url),3000);
}
export default function DebugRecorder({state}:{state:GameState}){
 const [recording,setRecording]=useState(false);
 const [count,setCount]=useState(0);
 const [expanded,setExpanded]=useState(false);
 const lastMove=useRef(0);
 useEffect(()=>{const update=()=>setCount(events.length);subscribers.add(update);return()=>{subscribers.delete(update);};},[]);
 useEffect(()=>{
  if(!recording)return;
  function pointer(e:PointerEvent){
   const info=nodeInfo(e.target);
   if(!info.insideMap&&!info.insideTray&&!info.tokenId)return;
   if(e.type==='pointermove'&&performance.now()-lastMove.current<100)return;
   if(e.type==='pointermove')lastMove.current=performance.now();
   trace('POINTER_'+e.type.toUpperCase(),{...info,x:e.clientX,y:e.clientY,buttons:e.buttons,button:e.button,pointerId:e.pointerId,isPrimary:e.isPrimary});
  }
  const kinds=['pointerdown','pointermove','pointerup','pointercancel','lostpointercapture'] as const;
  for(const k of kinds)document.addEventListener(k,pointer,true);
  return()=>{for(const k of kinds)document.removeEventListener(k,pointer,true);};
 },[recording]);
 function toggle(){
  if(recording){trace('RECORDING_STOP');enabled=false;setRecording(false);}
  else{events=[];seq=0;lastState=null;enabled=true;setRecording(true);trace('RECORDING_START',{revision:state.revision});traceRoomState(state);}
 }
 const recent=events.slice(-12).reverse();
 return <section className="debug-recorder" aria-label="DM Debug Recorder">
  <div className="debug-head"><strong>DM DEBUG RECORDER</strong><span>{recording?'● Recording':'Stopped'} · {count} events</span></div>
  <div className="debug-controls">
   <button type="button" onClick={toggle}>{recording?'Stop recording':'Start recording'}</button>
   <button type="button" onClick={()=>trace('BUG_MARKER',{note:'DM marked unexpected behavior'})} disabled={!recording}>⚑ Mark Bug</button>
   <button type="button" onClick={download} disabled={!count}>Download Log</button>
   <button type="button" onClick={()=>{events=[];seq=0;lastState=null;setCount(0);if(recording){trace('LOG_CLEARED');traceRoomState(state);}}}>Clear</button>
   <button type="button" onClick={()=>setExpanded(v=>!v)}>{expanded?'Hide events':'Show events'}</button>
  </div>
  <p>Start recording, reproduce the issue, click Mark Bug, then Download Log. Only your DM browser records; player browser actions are visible through server movement events and state updates.</p>
  {expanded&&<pre className="debug-events">{recent.map(e=>`${e.seq} ${e.at.slice(11,23)} ${e.kind} ${JSON.stringify(e.detail)}`).join('\n')}</pre>}
 </section>;
}
