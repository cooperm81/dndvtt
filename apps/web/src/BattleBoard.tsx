import {trace} from './DebugRecorder';
import {useEffect,useRef,useState,type ChangeEvent,type PointerEvent} from 'react';
import type {GameState,CreatureSize} from '@tabletop/shared';

type Member={id:string;name:string;isDm:boolean;playerId:string};
type Props={state:GameState;members:Member[];isDm:boolean;meId:string;emit:(event:string,payload:unknown,onAck?:(error?:string)=>void)=>void};
const footprint=(size?:CreatureSize)=>({Small:1,Medium:1,Large:2,Huge:3,Gargantuan:4})[size??'Medium'];
const blank={image:'',width:1200,height:800,cellSize:50,offsetX:0,offsetY:0,showGrid:true};
export default function BattleBoard({state,members,isDm,meId,emit}:Props){
 const map=state.battleMap??blank;
 const [zoom,setZoom]=useState(75);const [allowStack,setAllowStack]=useState(false);
 const [selected,setSelected]=useState('');
 const [placing,setPlacing]=useState(''); // token awaiting a hidden map location
 const [showPrepared,setShowPrepared]=useState(true);
 const [editing,setEditing]=useState<{name:string;color:string;ownerId:string;size:CreatureSize}|null>(null);
 const [loading,setLoading]=useState(false);
 const [message,setMessage]=useState('');
 const boardRef=useRef<HTMLDivElement>(null);
 const [dragPreview,setDragPreview]=useState<{id:string;x:number;y:number}|null>(null); // LIVE_GRID_DRAG_V031
 const [pendingMove,setPendingMove]=useState<{id:string;x:number;y:number;originX:number;originY:number}|null>(null); // HOLD_UNTIL_SYNC_V031
 const drag=useRef<{id:string;pointerId:number;startX:number;startY:number;originX:number;originY:number;active:boolean}|null>(null);
 const token=state.tokens.find(t=>t.id===selected);
 const dirty=!!(token&&editing&&(editing.name!==token.name||editing.color!==token.color||editing.ownerId!==(token.ownerId??'')||editing.size!==(token.size??'Medium')));
 const staged=state.tokens.filter(t=>t.staged);
 const prepared=staged.filter(t=>t.prepared);
 function prepareAt(tokenId:string,clientX:number,clientY:number){
  const p=gridAt(clientX,clientY);
  emit('token:move',{tokenId,x:p.x,y:p.y,allowStack:isDm&&allowStack});
  setPlacing('');
 }
 function boardClick(e:React.MouseEvent<HTMLDivElement>){
  if(!isDm||!placing||e.detail===0)return;
  // A click on a visible token or hidden marker is NOT a placement click.
  if((e.target as HTMLElement).closest('.battle-token,.ambush-ghost'))return;
  prepareAt(placing,e.clientX,e.clientY);
 }
 function boardDrop(e:React.DragEvent<HTMLDivElement>){
  if(!isDm)return;
  e.preventDefault();
  const id=e.dataTransfer.getData('text/plain');
  if(staged.some(t=>t.id===id))prepareAt(id,e.clientX,e.clientY);
 }
 useEffect(()=>{
  if(!pendingMove)return;
  const authoritative=state.tokens.find(t=>t.id===pendingMove.id);
  if(!authoritative || (authoritative.x===pendingMove.x && authoritative.y===pendingMove.y) || (authoritative.x!==pendingMove.originX || authoritative.y!==pendingMove.originY))setPendingMove(null);
 },[state.tokens,pendingMove]);
 useEffect(()=>{
  if(!pendingMove)return;
  const timer=window.setTimeout(()=>setPendingMove(p=>p===pendingMove?null:p),4000);
  return ()=>window.clearTimeout(timer);
 },[pendingMove]);
 const sendMap=(updates:Partial<typeof blank>)=>emit('map:update',{...map,...updates});
 async function upload(e:ChangeEvent<HTMLInputElement>){
  const file=e.target.files?.[0];e.target.value='';if(!file)return;
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)){setMessage('Choose a PNG, JPG, or WebP image.');return;}
  setLoading(true);setMessage('Preparing map…');
  try{
   const img=new Image();const objectUrl=URL.createObjectURL(file);
   try{await new Promise<void>((resolve,reject)=>{img.onload=()=>resolve();img.onerror=()=>reject(new Error('Could not read image'));img.src=objectUrl;});
    const scale=Math.min(1,4000/img.naturalWidth,4000/img.naturalHeight);
    const width=Math.max(200,Math.round(img.naturalWidth*scale));const height=Math.max(200,Math.round(img.naturalHeight*scale));
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d');if(!ctx)throw Error('Canvas unavailable');ctx.drawImage(img,0,0,width,height);
    let data=canvas.toDataURL('image/webp',0.85);
    if(data.length>2700000)data=canvas.toDataURL('image/webp',0.6);
    if(data.length>2700000)throw Error('Map too detailed. Please resize or compress it first (about 2 MB maximum).');
    sendMap({image:data,width,height});setMessage('Map sent to everyone.');
   }finally{URL.revokeObjectURL(objectUrl);}
  }catch(err){setMessage(err instanceof Error?err.message:'Upload failed');}finally{setLoading(false);}
 }
 function gridAt(clientX:number,clientY:number){
  const rect=boardRef.current!.getBoundingClientRect();
  const scale=rect.width/map.width;
  return {x:Math.max(0,Math.min(10000,Math.round(((clientX-rect.left)/scale-map.offsetX)/map.cellSize))),y:Math.max(0,Math.min(10000,Math.round(((clientY-rect.top)/scale-map.offsetY)/map.cellSize)))};
 }
 // DRAG_LIFECYCLE_0323: document-level completion survives token DOM/capture changes.
 function down(e:PointerEvent<HTMLDivElement>,t:GameState['tokens'][number]){
  if(!isDm&&(!state.playerMovementEnabled||t.ownerId!==meId))return;
  if(e.button!==0)return;
  e.preventDefault();e.stopPropagation();
  setPlacing('');
  setSelected(t.id);setEditing({name:t.name,color:t.color,ownerId:t.ownerId??'',size:t.size??'Medium'});
  drag.current={id:t.id,pointerId:e.pointerId,startX:e.clientX,startY:e.clientY,originX:t.x,originY:t.y,active:false};
  setDragPreview(null);
  setPendingMove(null);
  try{e.currentTarget.setPointerCapture(e.pointerId);}catch{/* document listener still tracks release */}
  trace('DRAG_START_0323',{id:t.id,pointerId:e.pointerId,origin:{x:t.x,y:t.y}});
 }
 function dragTarget(d:NonNullable<typeof drag.current>,clientX:number,clientY:number){
  const board=boardRef.current;
  if(!board)return {x:d.originX,y:d.originY};
  const scale=board.getBoundingClientRect().width/map.width;
  if(!Number.isFinite(scale)||scale<=0)return {x:d.originX,y:d.originY};
  const dx=(clientX-d.startX)/scale/map.cellSize;
  const dy=(clientY-d.startY)/scale/map.cellSize;
  return {x:Math.max(0,Math.min(10000,Math.round(d.originX+dx))),y:Math.max(0,Math.min(10000,Math.round(d.originY+dy)))};
 }
 function moving(e:globalThis.PointerEvent){
  const d=drag.current;
  if(!d||d.pointerId!==e.pointerId)return;
  // Never move a token when the primary mouse button is not physically down.
  if(e.pointerType==='mouse'&&(e.buttons&1)===0){
   finishDrag(e.pointerId,e.clientX,e.clientY,'button-released-without-pointerup');return;
  }
  if(!d.active){
   if(Math.hypot(e.clientX-d.startX,e.clientY-d.startY)<6)return;
   d.active=true;
  }
  const next=dragTarget(d,e.clientX,e.clientY);
  setDragPreview({id:d.id,...next});
 }
 function finishDrag(pointerId:number,clientX:number,clientY:number,reason:string){
  const d=drag.current;
  if(!d||d.pointerId!==pointerId)return;
  // Clear synchronously BEFORE releasePointerCapture or emitting, so completion is exactly once.
  drag.current=null;
  const moved=d.active||Math.hypot(clientX-d.startX,clientY-d.startY)>=6;
  const next=dragTarget(d,clientX,clientY);
  trace('DRAG_FINISH_0323',{id:d.id,reason,moved,origin:{x:d.originX,y:d.originY},destination:next});
  if(moved&&(next.x!==d.originX||next.y!==d.originY)){
   setPendingMove({id:d.id,...next,originX:d.originX,originY:d.originY});
   emit('token:move',{tokenId:d.id,...next,allowStack:isDm&&allowStack},error=>{if(error)setPendingMove(p=>p?.id===d.id?null:p);});
  }
  setDragPreview(null);
 }
 function cancelDrag(reason:string){
  if(drag.current)trace('DRAG_CANCEL_0323',{id:drag.current.id,reason});
  drag.current=null;setDragPreview(null);
 }
 // Capture on document, not the moving token. A rerender can move/replace the token
 // and cause pointer capture to disappear before its onPointerUp handler runs.
 useEffect(()=>{
  const move=(e:globalThis.PointerEvent)=>moving(e);
  const up=(e:globalThis.PointerEvent)=>finishDrag(e.pointerId,e.clientX,e.clientY,'document-pointerup');
  const cancel=(e:globalThis.PointerEvent)=>{if(drag.current?.pointerId===e.pointerId)cancelDrag('pointercancel');};
  const lost=(e:globalThis.PointerEvent)=>{
   if(drag.current?.pointerId===e.pointerId)
    trace('DRAG_CAPTURE_LOST_0323',{id:drag.current.id,buttons:e.buttons});
   // Lost capture is NOT a cancellation; wait for document pointerup.
  };
  const blur=()=>cancelDrag('window-blur');
  document.addEventListener('pointermove',move,true);
  document.addEventListener('pointerup',up,true);
  document.addEventListener('pointercancel',cancel,true);
  document.addEventListener('lostpointercapture',lost,true);
  window.addEventListener('blur',blur);
  return()=>{
   document.removeEventListener('pointermove',move,true);
   document.removeEventListener('pointerup',up,true);
   document.removeEventListener('pointercancel',cancel,true);
   document.removeEventListener('lostpointercapture',lost,true);
   window.removeEventListener('blur',blur);
  };
 });
 return <>
  {isDm&&<section className="ambush-tray" aria-label="DM-only staging tray">
   <div className="ambush-head"><strong>DM STAGING TRAY</strong><span>Hidden from players · {staged.length} staged</span></div>
   <p>New tokens start here. Drag one onto the map, or choose Place then click its secret location. Prepared markers are visible only to you.</p>
   <div className="ambush-tokens">
    {staged.length===0&&<span className="muted">No hidden tokens. Create one with Add token below the map.</span>}
    {staged.map(t=><div className={'ambush-item'+(placing===t.id?' ambush-placing':'')} key={t.id} draggable
      onDragStart={e=>{e.dataTransfer.setData('text/plain',t.id);e.dataTransfer.effectAllowed='move';}}>
      <span className="ambush-chip" style={{background:t.color}}>{t.name.slice(0,2).toUpperCase()}</span>
      <span>{t.name} ({t.size??'Medium'}){t.prepared?' · Prepared':' · Unplaced'}</span>
      <button type="button" onClick={()=>{setSelected(t.id);setEditing({name:t.name,color:t.color,ownerId:t.ownerId??'',size:t.size??'Medium'});setPlacing(t.id);}}>Place</button>
      <button type="button" disabled={!t.prepared} onClick={()=>emit('token:reveal',{tokenIds:[t.id]})}>Reveal</button>
    </div>)}
   </div>
   <div className="ambush-controls">
    <label><input type="checkbox" checked={showPrepared} onChange={e=>setShowPrepared(e.target.checked)}/> Show hidden positions</label>
    {placing&&<button type="button" onClick={()=>setPlacing('')}>Cancel placement</button>}
    <button type="button" className="primary" disabled={!prepared.length} onClick={()=>emit('token:reveal',{tokenIds:prepared.map(t=>t.id)})}>Reveal All Prepared ({prepared.length})</button>
   </div>
  </section>}
  <div className="battle-actions">
   <label>Zoom <input aria-label="Map zoom" type="range" min="25" max="200" step="5" value={zoom} onChange={e=>setZoom(Number(e.target.value))}/><b>{zoom}%</b></label>
   <button type="button" onClick={()=>setZoom(100)}>100%</button>
   <span className="battle-note">Scroll to pan · 1 square = 5 ft · {isDm?'DM moves tokens':state.playerMovementEnabled?'Move your assigned token':'DM controls movement'}</span>
   {isDm&&<label className="battle-upload">{loading?'Preparing…':'Upload map'}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={loading} onChange={e=>void upload(e)}/></label>}
  </div>
  {isDm&&<div className="battle-settings"><label><input type="checkbox" checked={allowStack} onChange={e=>setAllowStack(e.target.checked)}/> Allow stacking (DM override)</label>
   <label>Cell px <input type="number" min="16" max="200" value={map.cellSize} onChange={e=>sendMap({cellSize:Number(e.target.value)})}/></label>
   <label>Grid X <input type="number" value={map.offsetX} onChange={e=>sendMap({offsetX:Number(e.target.value)})}/></label>
   <label>Grid Y <input type="number" value={map.offsetY} onChange={e=>sendMap({offsetY:Number(e.target.value)})}/></label>
   <label><input type="checkbox" checked={map.showGrid} onChange={e=>sendMap({showGrid:e.target.checked})}/> Show grid</label>
   {map.image&&<button type="button" onClick={()=>sendMap({image:''})}>Clear map</button>}
  </div>}
  {message&&<div className="battle-message" role="status">{message}</div>}
  <div className="battle-scroll" aria-label="Scrollable shared tactical map">
   <div ref={boardRef} className="battle-canvas" onClick={boardClick} onDragOver={e=>{if(isDm)e.preventDefault();}} onDrop={boardDrop} style={{width:map.width*zoom/100,height:map.height*zoom/100,cursor:placing?"crosshair":undefined}}>
    <div className="battle-content" style={{width:map.width,height:map.height,transform:`scale(${zoom/100})`,transformOrigin:'top left',backgroundImage:map.image?`url(${map.image})`:undefined,backgroundSize:'100% 100%'}}>
     {map.showGrid&&<div className="battle-grid" style={{backgroundSize:`${map.cellSize}px ${map.cellSize}px`,backgroundPosition:`${map.offsetX}px ${map.offsetY}px`}}/>}
     {isDm&&showPrepared&&staged.filter(t=>t.prepared).map(t=><div key={'ghost-'+t.id} className="ambush-ghost"
       title={'Hidden: '+t.name} style={{left:map.offsetX+t.x*map.cellSize,top:map.offsetY+t.y*map.cellSize,
       width:Math.max(24,map.cellSize*footprint(t.size)-2),height:Math.max(24,map.cellSize*footprint(t.size)-2),background:t.color}}
       onClick={e=>{e.stopPropagation();setSelected(t.id);setEditing({name:t.name,color:t.color,ownerId:t.ownerId??'',size:t.size??'Medium'});}}>
       {t.name.slice(0,2).toUpperCase()}</div>)}
     {state.tokens.filter(t=>!t.staged).map(t=><div key={t.id} data-token-id={t.id} className={'battle-token'+(selected===t.id?' battle-selected':'')} title={`${t.name} (${t.x},${t.y})`} style={{left:map.offsetX+(dragPreview?.id===t.id?dragPreview.x:pendingMove?.id===t.id?pendingMove.x:t.x)*map.cellSize,top:map.offsetY+(dragPreview?.id===t.id?dragPreview.y:pendingMove?.id===t.id?pendingMove.y:t.y)*map.cellSize,width:Math.max(24,map.cellSize*footprint(t.size)-2),height:Math.max(24,map.cellSize*footprint(t.size)-2),background:t.color,cursor:isDm||(state.playerMovementEnabled&&t.ownerId===meId)?'grab':'default'}} onPointerDown={e=>down(e,t)} onClick={e=>e.stopPropagation()}>{t.name.slice(0,2).toUpperCase()}</div>)}
    </div>
   </div>
  </div>
  {selected&&token&&<div className="battle-selection"><strong>{token.name}</strong><span>Position {token.x},{token.y}</span><span>Distance from origin: {Math.round(Math.hypot(token.x,token.y)*5)} ft</span>
   {isDm&&editing&&<>{token.staged?<button type="button" disabled={!token.prepared} onClick={()=>emit('token:reveal',{tokenIds:[token.id]})}>Reveal selected</button>:<button type="button" onClick={()=>emit('token:stage',{tokenId:token.id})}>Return to tray (hide)</button>}<input aria-label="Edit token name" maxLength={40} value={editing.name} onChange={e=>setEditing({...editing,name:e.target.value})}/><input aria-label="Token color" type="color" value={editing.color} onChange={e=>setEditing({...editing,color:e.target.value})}/><select aria-label="Token size" value={editing.size} onChange={e=>setEditing({...editing,size:e.target.value as CreatureSize})}>{(['Small','Medium','Large','Huge','Gargantuan'] as const).map(size=><option key={size} value={size}>{size} ({footprint(size)}×{footprint(size)})</option>)}</select><select aria-label="Token owner" value={editing.ownerId} onChange={e=>setEditing({...editing,ownerId:e.target.value})}><option value="">DM only</option>{members.filter(m=>!m.isDm).map(m=><option key={m.playerId} value={m.playerId}>{m.name}</option>)}</select><button className={dirty?'primary':''} style={dirty?{boxShadow:'0 0 0 3px rgba(255,190,45,.65)'}:undefined} disabled={!dirty} onClick={()=>emit('token:edit',{tokenId:selected,...editing,ownerId:editing.ownerId||null})}>{dirty?'● Save token (unsaved changes)':'Save token'}</button><button onClick={()=>{emit('token:delete',{tokenId:selected});setSelected('');}}>Delete token</button></>}
  </div>}
 </>;
}
