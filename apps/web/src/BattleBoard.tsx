import {useEffect,useRef,useState,type ChangeEvent,type PointerEvent} from 'react';
import type {GameState} from '@tabletop/shared';

type Member={id:string;name:string;isDm:boolean};
type Props={state:GameState;members:Member[];isDm:boolean;meId:string;emit:(event:string,payload:unknown)=>void};
const blank={image:'',width:1200,height:800,cellSize:50,offsetX:0,offsetY:0,showGrid:true};
export default function BattleBoard({state,members,isDm,meId,emit}:Props){
 const map=state.battleMap??blank;
 const [zoom,setZoom]=useState(75);
 const [selected,setSelected]=useState('');
 const [editing,setEditing]=useState<{name:string;color:string;ownerId:string}|null>(null);
 const [loading,setLoading]=useState(false);
 const [message,setMessage]=useState('');
 const boardRef=useRef<HTMLDivElement>(null);
 const [dragPreview,setDragPreview]=useState<{id:string;x:number;y:number}|null>(null); // LIVE_GRID_DRAG_V031
 const [pendingMove,setPendingMove]=useState<{id:string;x:number;y:number;originX:number;originY:number}|null>(null); // HOLD_UNTIL_SYNC_V031
 const drag=useRef<{id:string;pointerId:number;startX:number;startY:number;originX:number;originY:number;active:boolean}|null>(null);
 const token=state.tokens.find(t=>t.id===selected);
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
 function down(e:PointerEvent<HTMLDivElement>,t:GameState['tokens'][number]){
  if(!isDm&&t.ownerId!==meId)return;
  if(e.button!==0)return;
  e.preventDefault();e.stopPropagation();
  setSelected(t.id);setEditing({name:t.name,color:t.color,ownerId:t.ownerId??''});
  drag.current={id:t.id,pointerId:e.pointerId,startX:e.clientX,startY:e.clientY,originX:t.x,originY:t.y,active:false};
  setDragPreview(null);
  setPendingMove(null);
  e.currentTarget.setPointerCapture(e.pointerId);
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
 function moving(e:PointerEvent<HTMLDivElement>){
  const d=drag.current;
  if(!d||d.pointerId!==e.pointerId)return;
  if(!d.active){
   if(Math.hypot(e.clientX-d.startX,e.clientY-d.startY)<6)return;
   d.active=true;
  }
  const next=dragTarget(d,e.clientX,e.clientY);
  setDragPreview({id:d.id,...next});
 }
 function up(e:PointerEvent<HTMLDivElement>){
  const d=drag.current;
  if(!d||d.pointerId!==e.pointerId)return;
  drag.current=null;
  if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
  if(!d.active&&Math.hypot(e.clientX-d.startX,e.clientY-d.startY)<6){setDragPreview(null);return;}
  const next=dragTarget(d,e.clientX,e.clientY);
  if(next.x!==d.originX||next.y!==d.originY){
   setPendingMove({id:d.id,...next,originX:d.originX,originY:d.originY});
   setDragPreview(null);
   emit('token:move',{tokenId:d.id,...next});
  }else setDragPreview(null);
 }
 function cancelDrag(){drag.current=null;setDragPreview(null);}
 return <>
  <div className="battle-actions">
   <label>Zoom <input aria-label="Map zoom" type="range" min="25" max="200" step="5" value={zoom} onChange={e=>setZoom(Number(e.target.value))}/><b>{zoom}%</b></label>
   <button type="button" onClick={()=>setZoom(100)}>100%</button>
   <span className="battle-note">Scroll to pan · 1 square = 5 ft</span>
   {isDm&&<label className="battle-upload">{loading?'Preparing…':'Upload map'}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={loading} onChange={e=>void upload(e)}/></label>}
  </div>
  {isDm&&<div className="battle-settings">
   <label>Cell px <input type="number" min="16" max="200" value={map.cellSize} onChange={e=>sendMap({cellSize:Number(e.target.value)})}/></label>
   <label>Grid X <input type="number" value={map.offsetX} onChange={e=>sendMap({offsetX:Number(e.target.value)})}/></label>
   <label>Grid Y <input type="number" value={map.offsetY} onChange={e=>sendMap({offsetY:Number(e.target.value)})}/></label>
   <label><input type="checkbox" checked={map.showGrid} onChange={e=>sendMap({showGrid:e.target.checked})}/> Show grid</label>
   {map.image&&<button type="button" onClick={()=>sendMap({image:''})}>Clear map</button>}
  </div>}
  {message&&<div className="battle-message" role="status">{message}</div>}
  <div className="battle-scroll" aria-label="Scrollable shared tactical map">
   <div ref={boardRef} className="battle-canvas" style={{width:map.width*zoom/100,height:map.height*zoom/100}}>
    <div className="battle-content" style={{width:map.width,height:map.height,transform:`scale(${zoom/100})`,transformOrigin:'top left',backgroundImage:map.image?`url(${map.image})`:undefined,backgroundSize:'100% 100%'}}>
     {map.showGrid&&<div className="battle-grid" style={{backgroundSize:`${map.cellSize}px ${map.cellSize}px`,backgroundPosition:`${map.offsetX}px ${map.offsetY}px`}}/>}
     {state.tokens.map(t=><div key={t.id} data-token-id={t.id} className={'battle-token'+(selected===t.id?' battle-selected':'')} title={`${t.name} (${t.x},${t.y})`} style={{left:map.offsetX+(dragPreview?.id===t.id?dragPreview.x:pendingMove?.id===t.id?pendingMove.x:t.x)*map.cellSize,top:map.offsetY+(dragPreview?.id===t.id?dragPreview.y:pendingMove?.id===t.id?pendingMove.y:t.y)*map.cellSize,width:Math.max(24,map.cellSize-2),height:Math.max(24,map.cellSize-2),background:t.color,cursor:isDm||t.ownerId===meId?'grab':'default'}} onPointerDown={e=>down(e,t)} onPointerMove={moving} onPointerUp={up} onPointerCancel={cancelDrag}>{t.name.slice(0,2).toUpperCase()}</div>)}
    </div>
   </div>
  </div>
  {selected&&token&&<div className="battle-selection"><strong>{token.name}</strong><span>Position {token.x},{token.y}</span><span>Distance from origin: {Math.round(Math.hypot(token.x,token.y)*5)} ft</span>
   {isDm&&editing&&<><input aria-label="Edit token name" maxLength={40} value={editing.name} onChange={e=>setEditing({...editing,name:e.target.value})}/><input aria-label="Token color" type="color" value={editing.color} onChange={e=>setEditing({...editing,color:e.target.value})}/><select aria-label="Token owner" value={editing.ownerId} onChange={e=>setEditing({...editing,ownerId:e.target.value})}><option value="">DM only</option>{members.filter(m=>!m.isDm).map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select><button onClick={()=>emit('token:edit',{tokenId:selected,...editing,ownerId:editing.ownerId||null})}>Save token</button><button onClick={()=>{emit('token:delete',{tokenId:selected});setSelected('');}}>Delete token</button></>}
  </div>}
 </>;
}
