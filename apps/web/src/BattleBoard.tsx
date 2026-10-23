import {trace} from './DebugRecorder';
import {useEffect,useRef,useState,type ChangeEvent,type PointerEvent} from 'react';
import type {GameState,CreatureSize} from '@tabletop/shared';

type Member={id:string;name:string;isDm:boolean;playerId:string};
type Props={state:GameState;members:Member[];isDm:boolean;meId:string;zoom:number;allowStack:boolean;uploadRequest:number;emit:(event:string,payload:unknown,onAck?:(error?:string)=>void)=>void};
const footprint=(size?:CreatureSize)=>({Small:1,Medium:1,Large:2,Huge:3,Gargantuan:4})[size??'Medium'];
const blank={image:'',width:1200,height:800,cellSize:50,offsetX:0,offsetY:0,showGrid:true};
export default function BattleBoard({state,members,isDm,meId,emit,zoom,allowStack,uploadRequest}:Props){
 const map=state.battleMap??blank;
 // V07_PHASE41A: map zoom comes from the fixed application bottom bar.
 const [selected,setSelected]=useState('');
 const [placing,setPlacing]=useState(''); // token awaiting a hidden map location
 const [showPrepared,setShowPrepared]=useState(true);
 const [editing,setEditing]=useState<{name:string;color:string;ownerId:string;size:CreatureSize}|null>(null);
 const mapFileInputRef=useRef<HTMLInputElement>(null);
 const [loading,setLoading]=useState(false);
 useEffect(()=>{if(uploadRequest>0&&isDm)mapFileInputRef.current?.click();},[uploadRequest,isDm]);
 const [message,setMessage]=useState('');
 // V07_PHASE3_HIDDEN_DRAG_FIX
 // V07_PHASE3_CONTEXT_MENU: contextual actions reuse existing server events and permissions.
 // V07_PHASE44: empty-map menu and location-specific token creation.
 const [context,setContext]=useState<{id:string;x:number;y:number}|null>(null);
 const [mapContext,setMapContext]=useState<{x:number;y:number;gridX:number;gridY:number}|null>(null);
 const [newToken,setNewToken]=useState<{name:string;size:CreatureSize;color:string;ownerId:string;x:number;y:number}|null>(null);
 const scrollRef=useRef<HTMLDivElement>(null);
 const panRef=useRef<{id:number;x:number;y:number;left:number;top:number;active:boolean}|null>(null);
 const [panning,setPanning]=useState(false);
 const contextRef=useRef<HTMLDivElement>(null);
 const contextToken=state.tokens.find(t=>t.id===context?.id);
 function chooseToken(t:GameState['tokens'][number]){
  setSelected(t.id);
  setEditing({name:t.name,color:t.color,ownerId:t.ownerId??'',size:t.size??'Medium'});
 }
 function openContext(e:React.MouseEvent<HTMLDivElement>,t:GameState['tokens'][number]){
  e.preventDefault();e.stopPropagation();
  chooseToken(t);
  setMapContext(null);setContext({id:t.id,x:Math.max(8,Math.min(e.clientX,window.innerWidth-270)),y:Math.max(8,Math.min(e.clientY,window.innerHeight-290))});
 }
 useEffect(()=>{
  if(!context)return;
  const close=(e:globalThis.PointerEvent)=>{if(!contextRef.current?.contains(e.target as Node))setContext(null);};
  const key=(e:KeyboardEvent)=>{if(e.key==='Escape')setContext(null);};
  const scroll=()=>setContext(null);
  document.addEventListener('pointerdown',close,true);
  document.addEventListener('keydown',key);
  window.addEventListener('resize',scroll);
  window.addEventListener('scroll',scroll,true);
  return()=>{document.removeEventListener('pointerdown',close,true);document.removeEventListener('keydown',key);window.removeEventListener('resize',scroll);window.removeEventListener('scroll',scroll,true);};
 },[context]);
 function mapRightClick(e:React.MouseEvent<HTMLDivElement>){
  if(!isDm||((e.target as HTMLElement).closest('.battle-token,.ambush-ghost')))return;
  e.preventDefault();e.stopPropagation();setContext(null);
  const grid=gridAt(e.clientX,e.clientY);
  setMapContext({x:Math.min(e.clientX,window.innerWidth-205),y:Math.min(e.clientY,window.innerHeight-90),gridX:grid.x,gridY:grid.y});
 }
 function panDown(e:PointerEvent<HTMLDivElement>){
  if(e.button!==0||placing||((e.target as HTMLElement).closest('.battle-token,.ambush-ghost')))return;
  const el=scrollRef.current;if(!el)return;
  panRef.current={id:e.pointerId,x:e.clientX,y:e.clientY,left:el.scrollLeft,top:el.scrollTop,active:false};
  setMapContext(null);setContext(null);
  e.preventDefault();
 }
 useEffect(()=>{
  const move=(e:globalThis.PointerEvent)=>{
   const p=panRef.current,el=scrollRef.current;if(!p||p.id!==e.pointerId||!el)return;
   if(e.pointerType==='mouse'&&!(e.buttons&1)){panRef.current=null;setPanning(false);return;}
   if(!p.active&&Math.hypot(e.clientX-p.x,e.clientY-p.y)>4){p.active=true;setPanning(true);}
   if(p.active){el.scrollLeft=p.left-(e.clientX-p.x);el.scrollTop=p.top-(e.clientY-p.y);}
  };
  const stop=(e:globalThis.PointerEvent)=>{if(panRef.current?.id===e.pointerId){panRef.current=null;setPanning(false);}};
  const blur=()=>{panRef.current=null;setPanning(false);};
  document.addEventListener('pointermove',move,true);document.addEventListener('pointerup',stop,true);document.addEventListener('pointercancel',stop,true);window.addEventListener('blur',blur);
  return()=>{document.removeEventListener('pointermove',move,true);document.removeEventListener('pointerup',stop,true);document.removeEventListener('pointercancel',stop,true);window.removeEventListener('blur',blur);};
 },[]);
 useEffect(()=>{if(!mapContext&&!newToken)return;const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){setMapContext(null);setNewToken(null);}};document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key);},[mapContext,newToken]);
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
  // Keep the complete token footprint inside the actual map, including grid offsets.
  const size=footprint(state.tokens.find(t=>t.id===d.id)?.size);
  const minX=Math.max(0,Math.ceil(-map.offsetX/map.cellSize));
  const minY=Math.max(0,Math.ceil(-map.offsetY/map.cellSize));
  const maxX=Math.floor((map.width-map.offsetX)/map.cellSize)-size;
  const maxY=Math.floor((map.height-map.offsetY)/map.cellSize)-size;
  const clamp=(value:number,lo:number,hi:number)=>hi<lo?lo:Math.max(lo,Math.min(hi,value));
  return {x:clamp(Math.round(d.originX+dx),minX,maxX),y:maxY<minY?d.originY:Math.max(minY,Math.min(maxY,Math.round(d.originY+dy)))};
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
   <span className="battle-note">Scroll to pan · 1 square = 5 ft · {isDm?'DM moves tokens':state.playerMovementEnabled?'Move your assigned token':'DM controls movement'}</span>

  </div>
  {isDm&&<input ref={mapFileInputRef} type="file" accept="image/png,image/jpeg,image/webp" disabled={loading} onChange={e=>void upload(e)} style={{display:'none'}} aria-label="Upload map image"/>}
  {message&&<div className="battle-message" role="status">{message}</div>}
  <div ref={scrollRef} className={"battle-scroll v07-pan-scroll"+(panning?" v07-panning":"")} aria-label="Scrollable shared tactical map">
   <div ref={boardRef} className="battle-canvas" onPointerDown={panDown} onContextMenu={mapRightClick} onClick={boardClick} onDragOver={e=>{if(isDm)e.preventDefault();}} onDrop={boardDrop} style={{width:map.width*zoom/100,height:map.height*zoom/100,cursor:placing?"crosshair":undefined}}>
    <div className="battle-content" style={{width:map.width,height:map.height,transform:`scale(${zoom/100})`,transformOrigin:'top left',backgroundImage:map.image?`url(${map.image})`:undefined,backgroundSize:'100% 100%'}}>
     {map.showGrid&&<div className="battle-grid" style={{backgroundSize:`${map.cellSize}px ${map.cellSize}px`,backgroundPosition:`${map.offsetX}px ${map.offsetY}px`}}/>}
     {isDm&&showPrepared&&staged.filter(t=>t.prepared).map(t=><div key={'ghost-'+t.id} className="ambush-ghost"
       title={'Hidden: '+t.name} data-token-id={t.id} style={{left:map.offsetX+(dragPreview?.id===t.id?dragPreview.x:pendingMove?.id===t.id?pendingMove.x:t.x)*map.cellSize,top:map.offsetY+(dragPreview?.id===t.id?dragPreview.y:pendingMove?.id===t.id?pendingMove.y:t.y)*map.cellSize,
       width:Math.max(24,map.cellSize*footprint(t.size)-2),height:Math.max(24,map.cellSize*footprint(t.size)-2),background:t.color}}
       onPointerDown={e=>down(e,t)} onClick={e=>{e.stopPropagation();chooseToken(t);}} onContextMenu={e=>openContext(e,t)}>
       {t.name.slice(0,2).toUpperCase()}</div>)}
     {state.tokens.filter(t=>!t.staged).map(t=><div key={t.id} data-token-id={t.id} className={'battle-token'+(selected===t.id?' battle-selected':'')+(t.defeated?' v07-token-defeated':'')} title={`${t.name} (${t.x},${t.y})`} style={{left:map.offsetX+(dragPreview?.id===t.id?dragPreview.x:pendingMove?.id===t.id?pendingMove.x:t.x)*map.cellSize,top:map.offsetY+(dragPreview?.id===t.id?dragPreview.y:pendingMove?.id===t.id?pendingMove.y:t.y)*map.cellSize,width:Math.max(24,map.cellSize*footprint(t.size)-2),height:Math.max(24,map.cellSize*footprint(t.size)-2),background:t.color,cursor:isDm||(state.playerMovementEnabled&&t.ownerId===meId)?'grab':'default'}} onPointerDown={e=>down(e,t)} onContextMenu={e=>openContext(e,t)} onClick={e=>e.stopPropagation()}>{t.name.slice(0,2).toUpperCase()}{t.defeated&&<span className="v07-defeated-symbol" aria-label="Defeated">☠</span>}</div>)}
    </div>
   </div>
  </div>
  {mapContext&&isDm&&<div className="v07-token-context v07-map-context" role="menu" style={{left:Math.max(8,mapContext.x),top:Math.max(8,mapContext.y)}}>
   <button role="menuitem" type="button" onClick={()=>{setNewToken({name:'Goblin',size:'Medium',color:'#538fc1',ownerId:'',x:mapContext.gridX,y:mapContext.gridY});setMapContext(null);}}>＋ Add Token…</button>
  </div>}
  {newToken&&isDm&&<div className="v07-token-dialog-backdrop" onPointerDown={e=>{if(e.target===e.currentTarget)setNewToken(null);}}>
   <form className="v07-token-dialog" onSubmit={e=>{e.preventDefault();if(!newToken.name.trim())return;emit('token:add',{name:newToken.name.trim(),size:newToken.size,color:newToken.color,ownerId:newToken.ownerId||null,x:newToken.x,y:newToken.y},error=>{if(error)setMessage(error);else setNewToken(null);});}}>
    <h3>Add Token</h3><p>Place at grid {newToken.x}, {newToken.y}</p>
    <label>Name<input required maxLength={40} autoFocus value={newToken.name} onChange={e=>setNewToken({...newToken,name:e.target.value})}/></label>
    <label>Size<select value={newToken.size} onChange={e=>setNewToken({...newToken,size:e.target.value as CreatureSize})}>{(['Small','Medium','Large','Huge','Gargantuan'] as const).map(size=><option key={size} value={size}>{size} ({footprint(size)}×{footprint(size)})</option>)}</select></label>
    <label>Color<input type="color" value={newToken.color} onChange={e=>setNewToken({...newToken,color:e.target.value})}/></label>
    <label>Assigned player<select value={newToken.ownerId} onChange={e=>setNewToken({...newToken,ownerId:e.target.value})}><option value="">DM only</option>{members.filter(m=>!m.isDm).map(m=><option key={m.playerId} value={m.playerId}>{m.name}</option>)}</select></label>
    <div className="v07-token-dialog-actions"><button type="button" onClick={()=>setNewToken(null)}>Cancel</button><button className="primary" type="submit">Add Token</button></div>
   </form>
  </div>}
  {context&&contextToken&&<div ref={contextRef} className="v07-token-context" role="menu" aria-label={'Token actions for '+contextToken.name} style={{left:context.x,top:context.y}}>
    <div className="v07-token-context-head"><strong>{contextToken.name}</strong><small>{contextToken.size??'Medium'} · {contextToken.defeated?'Defeated':contextToken.staged?'Hidden':'On map'}</small></div>
    <button role="menuitem" type="button" onClick={()=>{chooseToken(contextToken);setContext(null);/* details panel opens below */}}>⚙ {isDm?'Token details / edit':'Token details'}</button>
    {isDm&&<>
      <div className="v07-token-context-divider"/>
      {contextToken.staged?<button role="menuitem" type="button" disabled={!contextToken.prepared} onClick={()=>{emit('token:reveal',{tokenIds:[contextToken.id]});setContext(null);}}>◉ Reveal token</button>:<button role="menuitem" type="button" onClick={()=>{emit('token:stage',{tokenId:contextToken.id});setContext(null);}}>◌ Hide / return to tray</button>}
      {contextToken.defeated
       ? <button role="menuitem" type="button" onClick={()=>{emit('token:defeated',{tokenId:contextToken.id,defeated:false});setContext(null);}}>✚ Revive token</button>
       : <button role="menuitem" type="button" onClick={()=>{emit('token:defeated',{tokenId:contextToken.id,defeated:true});setContext(null);}}>☠ Mark defeated</button>}
      {!contextToken.defeated&&<button role="menuitem" type="button" onClick={()=>{emit('initiative:remove-token',{tokenId:contextToken.id},error=>{if(error)window.alert(error);});setContext(null);}}>↪ Remove from initiative</button>}
      <button className="v07-token-context-danger" role="menuitem" type="button" onClick={()=>{if(window.confirm('Delete token '+contextToken.name+'?')){emit('token:delete',{tokenId:contextToken.id});setSelected('');}setContext(null);}}>✕ Delete token…</button>
    </>}
  </div>}
  {selected&&token&&<div className="battle-selection v07-token-details" role="region" aria-label="Selected token details"><button type="button" className="v07-token-details-close" aria-label="Close token details" onClick={()=>setSelected('')}>✕</button><strong>{token.name}</strong><span>Position {token.x},{token.y}</span><span>Distance from origin: {Math.round(Math.hypot(token.x,token.y)*5)} ft</span>
   {isDm&&editing&&<>{token.staged?<button type="button" disabled={!token.prepared} onClick={()=>emit('token:reveal',{tokenIds:[token.id]})}>Reveal selected</button>:<button type="button" onClick={()=>emit('token:stage',{tokenId:token.id})}>Return to tray (hide)</button>}<input aria-label="Edit token name" maxLength={40} value={editing.name} onChange={e=>setEditing({...editing,name:e.target.value})}/><input aria-label="Token color" type="color" value={editing.color} onChange={e=>setEditing({...editing,color:e.target.value})}/><select aria-label="Token size" value={editing.size} onChange={e=>setEditing({...editing,size:e.target.value as CreatureSize})}>{(['Small','Medium','Large','Huge','Gargantuan'] as const).map(size=><option key={size} value={size}>{size} ({footprint(size)}×{footprint(size)})</option>)}</select><select aria-label="Token owner" value={editing.ownerId} onChange={e=>setEditing({...editing,ownerId:e.target.value})}><option value="">DM only</option>{members.filter(m=>!m.isDm).map(m=><option key={m.playerId} value={m.playerId}>{m.name}</option>)}</select><button className={dirty?'primary':''} style={dirty?{boxShadow:'0 0 0 3px rgba(255,190,45,.65)'}:undefined} disabled={!dirty} onClick={()=>emit('token:edit',{tokenId:selected,...editing,ownerId:editing.ownerId||null})}>{dirty?'● Save token (unsaved changes)':'Save token'}</button><button onClick={()=>{emit('token:delete',{tokenId:selected});setSelected('');}}>Delete token</button></>}
  </div>}
 </>;
}
