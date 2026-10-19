import MediaRoom from './MediaRoom';
import CharacterSheet, {type SheetCharacter} from './CharacterSheet';
import BattleBoard from './BattleBoard';
import DebugRecorder, {trace,traceRoomState,traceOutgoing} from './DebugRecorder'; // DEBUG_RECORDER_0322
import {useEffect,useRef,useState, type ChangeEvent} from 'react';
import {storeRecovery,readRecovery} from './campaignRecovery'; // CAMPAIGN_PHASE2_V05
import {io, type Socket} from 'socket.io-client';
import type {GameState,RollResult,CreatureSize} from '@tabletop/shared';
import {Dices,Users,Map as MapIcon,Plus,ArrowRight,Copy} from 'lucide-react';
const API=import.meta.env.VITE_API_URL || '';
type Member={id:string;name:string;isDm:boolean;playerId:string}; // CHARACTER_PHASE3_V05
type RoomView={state:GameState;members:Member[]};
type Character={format:'dndvtt-character';formatVersion:1;id:string;playerId:string|null;name:string;ancestry:string;characterClass:string;level:number;size:CreatureSize;armorClass:number;hitPoints:{current:number;maximum:number};speed:number};
const stateRevision=(r:RoomView|null)=>r?.state.revision??-1;
function getPlayerId(){const key='dndvtt-player-id-v05';let id=localStorage.getItem(key);if(!id||!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(id)){id=crypto.randomUUID();localStorage.setItem(key,id);}return id;}
export default function App(){
 const [name,setName]=useState('');const [dmName,setDmName]=useState('');const [roomInput,setRoomInput]=useState(new URLSearchParams(location.search).get('room')||'');
 const [secret,setSecret]=useState(sessionStorage.getItem('dmSecret')||'');
 const [room,setRoom]=useState<RoomView|null>(null);const [me,setMe]=useState<Member|null>(null);
 // CAMPAIGN_PHASE1_V05: single-file campaign with multiple scenes and explicit Save/Open.
 const [campaign,setCampaign]=useState<{id:string;name:string;activeSceneId:string;scenes:{id:string;name:string}[];characters:{id:string;name:string;playerId:string|null;characterClass:string;level:number}[]} | null>(null);
 const [,setSavedRevision]=useState<number|null>(null);
 const [saving,setSaving]=useState(false);
 const characterInput=useRef<HTMLInputElement>(null);
 const [editingCharacter,setEditingCharacter]=useState<SheetCharacter|null>(null);
 const [myCharacters,setMyCharacters]=useState<{id:string;name:string}[]>([]);
 const playerId=useRef<string>(getPlayerId());
 const fileInput=useRef<HTMLInputElement>(null);
 const latestRevision=useRef(0);
 const campaignId=useRef('');
 const [savedMark,setSavedMark]=useState<{revision:number;signature:string}|null>(null);
 const [recoveryAvailable,setRecoveryAvailable]=useState(false);
 const [autoSave,setAutoSave]=useState(false);
 const [directFile,setDirectFile]=useState(false);
 const [saveLabel,setSaveLabel]=useState('');
 const fileHandle=useRef<{createWritable:()=>Promise<{write:(data:Blob)=>Promise<void>;close:()=>Promise<void>}>}|null>(null);
 const campaignRef=useRef<typeof campaign>(null);
 const roomRef=useRef<RoomView|null>(null);
 const savingRef=useRef(false);
 const savedRef=useRef<{revision:number;signature:string}|null>(null);
 const recoveryKey=useRef('');
 const lastRecoveryRevision=useRef(-1);
 const latestCampaignSignature=()=>JSON.stringify(campaignRef.current);
 const dirty=!!campaign && (!savedMark||savedMark.revision!==stateRevision(room)||savedMark.signature!==JSON.stringify(campaign));
 // PRESENCE_V05: game-server connectivity is separate from optional video.
 const [connected,setConnected]=useState(false);
 const [presenceEvents,setPresenceEvents]=useState<{kind:'joined'|'left';name:string;at:number}[]>([]);
 const [access,setAccess]=useState<'checking'|'required'|'granted'>('checking');
 const [accessPassword,setAccessPassword]=useState(''); const [accessError,setAccessError]=useState('');
 const [error,setError]=useState('');const [rolls,setRolls]=useState<RollResult[]>([]);
 // V06_PHASE22B_DICE: local preference, never affects room/game state.
 const [diceOpen,setDiceOpen]=useState<boolean>(()=>{try{return localStorage.getItem('dndvtt-dice-drawer-open')!=='false';}catch{return true;}});
 useEffect(()=>{try{localStorage.setItem('dndvtt-dice-drawer-open',String(diceOpen));}catch{/* storage optional */}},[diceOpen]);

 const [tokenName,setTokenName]=useState('Hero');const [tokenSize,setTokenSize]=useState<CreatureSize>('Medium');const [initiativeName,setInitiativeName]=useState('Goblin');const [initiativeScore,setInitiativeScore]=useState(12);
 const socket=useRef<Socket|null>(null);const joined=useRef<{roomId:string;name:string;dmSecret:string;playerId:string}|null>(null);
 useEffect(()=>{fetch(`${API}/api/auth/status`).then(r=>r.json()).then(data=>setAccess(data.authenticated?'granted':'required')).catch(()=>setAccess('required'));},[]);
 async function loginAccess(){setAccessError('');try{const r=await fetch(`${API}/api/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:accessPassword})});if(!r.ok){const data=await r.json();throw Error(data.error||'Login failed');}location.reload();}catch(e){setAccessError(e instanceof Error?e.message:'Login failed');}}
 useEffect(()=>{const s=io(import.meta.env.VITE_SOCKET_URL||undefined,{autoConnect:true});socket.current=s;
  s.on('room:state',(state:RoomView)=>{traceRoomState(state.state);latestRevision.current=state.state.revision;roomRef.current=state;setRoom(state);if(!joined.current?.dmSecret)s.emit('character:mine',{},(r:{characters?:{id:string;name:string}[]})=>setMyCharacters(r.characters||[]));});
  s.on('campaign:summary',(c:{id:string;name:string;activeSceneId:string;scenes:{id:string;name:string}[];characters:{id:string;name:string;playerId:string|null;characterClass:string;level:number}[]})=>{
   if(campaignId.current!==c.id){campaignId.current=c.id;setSavedRevision(null);setSavedMark(null);savedRef.current=null;fileHandle.current=null;setDirectFile(false);lastRecoveryRevision.current=-1;}
   campaignId.current=c.id;campaignRef.current=c;setCampaign(c);
  });
  s.on('presence:event',(event:{kind:'joined'|'left';name:string;at:number})=>setPresenceEvents(old=>[event,...old].slice(0,4)));
  s.on('disconnect',()=>setConnected(false));
  s.on('debug:server',(data:Record<string,unknown>)=>trace('SERVER_TOKEN_MOVE',data));s.on('dice:result',(r:RollResult)=>setRolls(old=>[r,...old].slice(0,12)));
  s.on('connect',()=>{setConnected(true);if(joined.current)s.emit('room:join',joined.current,(res:{ok?:boolean;member?:Member;error?:string})=>{if(res.ok)setMe(res.member!);else setError(res.error||'Could not rejoin');});});
  return()=>{s.disconnect();socket.current=null;};},[]);
 function join(roomId:string,dmSecret=secret,displayName=name){if(!displayName.trim())return setError('Enter your name first');setError('');
  const details={roomId,name:displayName.trim(),dmSecret,playerId:playerId.current};joined.current=details;
  socket.current?.emit('room:join',details,(res:{ok?:boolean;member?:Member;error?:string})=>{if(res.ok){setMe(res.member!);history.replaceState(null,'',`?room=${encodeURIComponent(roomId)}`);}else setError(res.error||'Could not join');});}
 async function create(){if(!dmName.trim())return setError('Enter your name first');setName(dmName.trim());try{const r=await fetch(`${API}/api/rooms`,{method:'POST'});if(!r.ok)throw Error('Failed to create room');const data=await r.json();sessionStorage.setItem('dmSecret',data.dmSecret);setSecret(data.dmSecret);setRoomInput(data.roomId);join(data.roomId,data.dmSecret,dmName.trim());}catch{setError('Server unavailable. Is it running?');}}
 function emit(event:string,payload:unknown,onAck?:(error?:string)=>void){traceOutgoing(event,payload);socket.current?.emit(event,payload,(r:{error?:string})=>{trace('CLIENT_ACK',{event,ok:!r?.error,error:r?.error??null});if(r?.error)setError(r.error);onAck?.(r?.error);});}
 function campaignAck(event:string,payload:unknown):Promise<{ok?:boolean;error?:string;campaign?:unknown;revision?:number}>{return new Promise((resolve,reject)=>{if(!socket.current?.connected)return reject(new Error('Not connected to game server'));socket.current.timeout(15000).emit(event,payload,(err:Error|null,res:{ok?:boolean;error?:string;campaign?:unknown;revision?:number})=>err?reject(new Error('Server did not respond')):resolve(res));});}
 async function exportCampaign(){const result=await campaignAck('campaign:export',{});if(!result.ok||!result.campaign)throw new Error(result.error||'Export failed');return {data:result.campaign,revision:result.revision??latestRevision.current};}
 function fileBlob(data:unknown){return new Blob([JSON.stringify(data,null,2)],{type:'application/json'});}
 function fileName(){return ((campaignRef.current?.name||'Campaign').replace(/[^a-z0-9 _-]/gi,'').trim()||'Campaign')+'.dndcamp';}
 function markSaved(revision:number){const mark={revision,signature:latestCampaignSignature()};savedRef.current=mark;setSavedMark(mark);setSavedRevision(revision);}
 async function downloadCampaign(data:unknown){const url=URL.createObjectURL(fileBlob(data));const link=document.createElement('a');link.href=url;link.download=fileName();document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
 async function saveCampaign(asNew=false,automatic=false){if(savingRef.current)return; savingRef.current=true;setSaving(true);
  try{const {data,revision}=await exportCampaign();let handle=fileHandle.current;
   if(asNew && 'showSaveFilePicker' in window){
    try{handle=await (window as unknown as {showSaveFilePicker:(opts:unknown)=>Promise<typeof handle>}).showSaveFilePicker({suggestedName:fileName(),types:[{description:'D&D Campaign',accept:{'application/json':['.dndcamp']}}]});}
    catch(e){if((e as {name?:string}).name==='AbortError')return;throw e;}
   }
   if(handle){const writable=await handle.createWritable();await writable.write(fileBlob(data));await writable.close();fileHandle.current=handle;setDirectFile(true);setSaveLabel('Saved to local file');}
   else if(!automatic){await downloadCampaign(data);setSaveLabel('Campaign downloaded');}
   else return;
   markSaved(revision);
  }catch(e){if(!automatic)setError(e instanceof Error?e.message:'Save failed');}
  finally{savingRef.current=false;setSaving(false);}
 }
 async function saveAs(){if('showSaveFilePicker' in window)await saveCampaign(true);else {fileHandle.current=null;setDirectFile(false);await saveCampaign(false);}}
 async function openLocalFile(){
  if('showOpenFilePicker' in window){
   try{const handles=await (window as unknown as {showOpenFilePicker:(opts:unknown)=>Promise<Array<{getFile:()=>Promise<File>;createWritable:()=>Promise<{write:(data:Blob)=>Promise<void>;close:()=>Promise<void>}>}>>}).showOpenFilePicker({multiple:false,types:[{description:'D&D Campaign',accept:{'application/json':['.dndcamp']}}]});
    const handle=handles[0];if(!handle)return;const file=await handle.getFile();const ok=await importFile(file);if(ok){fileHandle.current=handle;setDirectFile(true);setSaveLabel('Opened local file');}
   }catch(e){if((e as {name?:string}).name!=='AbortError')setError(e instanceof Error?e.message:'Open failed');}
  }else fileInput.current?.click();
 }
 async function importFile(file:File){
  if(file.size>15_000_000){setError('Campaign file exceeds 15 MB');return false;}
  if(!window.confirm('Open this campaign? This replaces the active game for everyone in the room. Save your current campaign first.'))return false;
  try{const parsed=JSON.parse(await file.text());const result=await campaignAck('campaign:import',parsed);if(!result.ok)throw new Error(result.error||'Open failed');
   fileHandle.current=null;setDirectFile(false);setSavedRevision(null);savedRef.current=null;setSavedMark(null);setSaveLabel('Imported — save to preserve changes');return true;
  }catch(err){setError(err instanceof Error?err.message:'Could not open campaign');return false;}
 }
 async function openCampaign(e:ChangeEvent<HTMLInputElement>){const file=e.target.files?.[0];e.target.value='';if(file)await importFile(file);}
 async function characterAck(event:string,payload:unknown):Promise<{ok?:boolean;error?:string;character?:Character}>{return new Promise((resolve,reject)=>{
  if(!socket.current?.connected)return reject(new Error('Not connected'));
  socket.current.timeout(15000).emit(event,payload,(err:Error|null,res:{ok?:boolean;error?:string;character?:Character})=>err?reject(new Error('Character request timed out')):resolve(res));
 });}
 async function addCharacter(){if(!me?.isDm)return;
  const name=window.prompt('Character name:');if(!name?.trim())return;
  const characterClass=window.prompt('Class (e.g. Fighter):','Fighter');if(characterClass===null)return;
  const assigned=room?.members.filter(m=>!m.isDm)||[];
  const player=assigned.length?window.prompt('Assign to connected player (enter name, or leave blank for unassigned):',assigned[0].name):null;
  const selected=assigned.find(m=>m.name===player);
  const c:Character={format:'dndvtt-character',formatVersion:1,id:crypto.randomUUID(),playerId:selected?.playerId??null,name:name.trim(),ancestry:'',characterClass:characterClass.trim(),level:1,size:'Medium',armorClass:10,hitPoints:{current:10,maximum:10},speed:30};
  try{const r=await characterAck('character:save',c);if(!r.ok)throw Error(r.error||'Save failed');}catch(e){setError(e instanceof Error?e.message:'Could not create character');}
 }
 async function importCharacter(e:ChangeEvent<HTMLInputElement>){const file=e.target.files?.[0];e.target.value='';if(!file)return;
  if(file.size>100000){setError('Character file too large');return;}
  try{const c=JSON.parse(await file.text()) as Character;
   // Reassign on import explicitly; never trust an external file's player association.
   c.playerId=null;
   const r=await characterAck('character:save',c);if(!r.ok)throw Error(r.error||'Import failed');
  }catch(err){setError(err instanceof Error?err.message:'Invalid character file');}
 }
 async function exportCharacter(id:string){try{const r=await characterAck('character:export',{id});if(!r.ok||!r.character)throw Error(r.error||'Export failed');
  const blob=new Blob([JSON.stringify(r.character,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);
  const link=document.createElement('a');link.href=url;link.download=(r.character.name.replace(/[^a-z0-9 _-]/gi,'').trim()||'Character')+'.dndchar';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
 }catch(e){setError(e instanceof Error?e.message:'Export failed');}}
 async function openSheet(id:string){try{const r=await characterAck('character:get',{id});if(!r.ok||!r.character)throw Error(r.error||'Character unavailable');setEditingCharacter(r.character);}catch(e){setError(e instanceof Error?e.message:'Cannot open sheet');}}
 async function rollSheet(label:string,modifier:number,advantage:'normal'|'advantage'|'disadvantage'){const r=await new Promise<{ok?:boolean;error?:string}>(resolve=>socket.current?.emit('dice:character',{label,modifier,advantage},resolve));if(!r?.ok)throw Error(r?.error||'Roll failed');}
 async function saveSheet(c:SheetCharacter){const r=await characterAck('character:save',c);if(!r.ok)throw Error(r.error||'Save failed');}
 async function assignCharacter(id:string){const c=campaign?.characters.find(x=>x.id===id);if(!c)return;
  const selected=room?.members.filter(m=>!m.isDm)||[];
  const name=window.prompt('Assign character to connected player (name is case-insensitive; blank to unassign):',selected.find(m=>m.playerId===c.playerId)?.name||'');if(name===null)return;
  const player=selected.find(m=>m.name.trim().toLocaleLowerCase()===name.trim().toLocaleLowerCase());
  if(name.trim()&&!player){setError('Player must be connected to assign a character');return;}
  try{const r=await characterAck('character:export',{id});if(!r.ok||!r.character)throw Error(r.error||'Character unavailable');
   const result=await characterAck('character:save',{...r.character,playerId:player?.playerId??null});if(!result.ok)throw Error(result.error||'Assignment failed');
  }catch(e){setError(e instanceof Error?e.message:'Assignment failed');}
 }
 async function renameScene(){const current=campaign?.scenes.find(sc=>sc.id===campaign.activeSceneId);if(!current)return;
  const name=window.prompt('Scene name:',current.name);if(!name?.trim()||name.trim()===current.name)return;
  try{const r=await campaignAck('campaign:scene:rename',{id:current.id,name:name.trim()});if(!r.ok)throw new Error(r.error);}catch(e){setError(e instanceof Error?e.message:'Could not rename scene');}
 }
 // Recovery snapshots use browser-local IndexedDB, independent of file permissions.
 useEffect(()=>{if(!me?.isDm||!campaign)return;
  const key='dndvtt-recovery:'+campaign.id;recoveryKey.current=key;
  void readRecovery(key).then(x=>setRecoveryAvailable(!!x)).catch(()=>{});
  const timer=window.setInterval(async()=>{
   if(savingRef.current||!socket.current?.connected||!campaignRef.current||!roomRef.current)return;
   const revision=roomRef.current.state.revision;
   if(revision===lastRecoveryRevision.current)return;
   try{const {data,revision:exportedRevision}=await exportCampaign();
    if(recoveryKey.current!==key)return;
    await storeRecovery(key,{campaign:data,revision:exportedRevision,createdAt:Date.now()});lastRecoveryRevision.current=exportedRevision;setRecoveryAvailable(true);
   }catch{/* Connection may be temporarily unavailable. */}
  },12000);
  return()=>window.clearInterval(timer);
 },[me?.isDm,campaign?.id]);
 useEffect(()=>{if(!me?.isDm||!autoSave||!directFile||!dirty)return;
  const timer=window.setTimeout(()=>{void saveCampaign(false,true);},3000);
  return()=>window.clearTimeout(timer);
 },[autoSave,directFile,dirty,room?.state.revision,campaign]);
 useEffect(()=>{const onKey=(e:KeyboardEvent)=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='s'&&me?.isDm&&room){e.preventDefault();void saveCampaign();}};
  const onLeave=(e:BeforeUnloadEvent)=>{if(me?.isDm&&dirty){e.preventDefault();e.returnValue='';}};
  window.addEventListener('keydown',onKey);window.addEventListener('beforeunload',onLeave);
  return()=>{window.removeEventListener('keydown',onKey);window.removeEventListener('beforeunload',onLeave);};
 },[me?.isDm,room,dirty,campaign]);
 async function restoreRecovery(){if(!campaign)return;
  try{const recovery=await readRecovery('dndvtt-recovery:'+campaign.id);if(!recovery){setError('No recovery snapshot available');return;}
   if(!window.confirm('Restore the browser recovery snapshot? This replaces the active game for everyone.'))return;
   const result=await campaignAck('campaign:import',recovery.campaign);if(!result.ok)throw new Error(result.error||'Recovery failed');
   setSavedMark(null);savedRef.current=null;setSaveLabel('Recovered — save campaign now');
  }catch(e){setError(e instanceof Error?e.message:'Recovery failed');}
 }
 async function addScene(){const name=window.prompt('Name for the new scene:');if(!name?.trim())return;try{const r=await campaignAck('campaign:scene:add',{name:name.trim()});if(!r.ok)throw new Error(r.error);}catch(e){setError(e instanceof Error?e.message:'Could not create scene');}}
 async function switchScene(id:string){if(id===campaign?.activeSceneId)return;try{const r=await campaignAck('campaign:scene:switch',{id});if(!r.ok)throw new Error(r.error);}catch(e){setError(e instanceof Error?e.message:'Could not switch scene');}}
 async function renameCampaign(){const name=window.prompt('Campaign name:',campaign?.name||'Untitled Campaign');if(!name?.trim())return;try{const r=await campaignAck('campaign:rename',{name:name.trim()});if(!r.ok)throw new Error(r.error);}catch(e){setError(e instanceof Error?e.message:'Could not rename campaign');}}
 // PRIVATE_GAME_ACCESS_V1: authentication gate, then separate DM/player entry forms.
 if(access==='checking')return <main className="landing"><section className="join-card"><div className="brand">⚔ TABLETOP</div><p>Checking access…</p></section></main>;
 if(access==='required')return <main className="landing"><section className="join-card"><div className="brand">⚔ TABLETOP</div><h1>Private game</h1><p>Enter your group's access password to continue.</p><form onSubmit={e=>{e.preventDefault();void loginAccess();}}><label>Access password<input type="password" autoFocus value={accessPassword} onChange={e=>setAccessPassword(e.target.value)} autoComplete="current-password" required/></label><button className="primary" type="submit">Enter tabletop <ArrowRight size={17}/></button></form>{accessError&&<p className="error" role="alert">{accessError}</p>}</section></main>;
 if(!room||!me)return <main className="landing"><section className="entry-shell"><div className="brand">⚔ TABLETOP <small>v0.6.0 PRIVATE ALPHA</small></div><h1>Gather your party.</h1><p className="entry-intro">Create a new adventure or join a game already in progress.</p><div className="entry-grid"><section className="entry-panel"><div className="entry-icon"><Plus size={24}/></div><h2>Create a Room</h2><p>Start a new adventure as Dungeon Master.</p><form onSubmit={e=>{e.preventDefault();void create();}}><label>Dungeon Master name<input value={dmName} onChange={e=>setDmName(e.target.value)} maxLength={40} placeholder="Your name" required/></label><p className="entry-hint">We'll generate a room code you can share with your players.</p><button type="submit" className="primary">Create Room <ArrowRight size={17}/></button></form></section><section className="entry-panel"><div className="entry-icon"><Users size={24}/></div><h2>Join a Room</h2><p>Enter the room code your Dungeon Master shared.</p><form onSubmit={e=>{e.preventDefault();join(roomInput.trim(),'');}}><label>Player name<input value={name} onChange={e=>setName(e.target.value)} maxLength={40} placeholder="Your name" required/></label><label>Room code<input value={roomInput} onChange={e=>setRoomInput(e.target.value)} placeholder="e.g. a1b2c3d4" required/></label><button type="submit">Join Room <ArrowRight size={17}/></button></form></section></div>{error&&<p className="error" role="alert">{error}</p>}</section></main>;

 const state=room.state;const inCombat=state.encounterMode==='combat';
 return <div className="app"><header>{/* V06_PHASE22B_UI_FIX */}<strong>⚔ TABLETOP</strong><span className="vtt-app-version" aria-label="Application version">v0.6.0</span><span>Room {state.roomId}</span><button onClick={()=>navigator.clipboard.writeText(`${location.origin}/?room=${state.roomId}`)}><Copy size={15}/> Copy invite link</button><span className="tag">{me.isDm?'DUNGEON MASTER':'PLAYER'}</span></header>
 {/* V06_PHASE22A_MENU: native disclosure menus; all permissions checked in actions and server. */}
 <nav className="vtt-menu-bar" aria-label="Application menus" /* V06_PHASE22A_MENU_FIX */
  onClickCapture={e=>{
   const target=e.target;
   if(!(target instanceof HTMLElement))return;
   const menu=target.closest('details.vtt-menu');
   if(!menu)return;
   if(target.closest('summary')){
    document.querySelectorAll('details.vtt-menu[open]').forEach(other=>{if(other!==menu)(other as HTMLDetailsElement).open=false;});
   }else if(target.closest('button:not(:disabled)')){
    (menu as HTMLDetailsElement).open=false;
   }
  }}
  onKeyDown={e=>{if(e.key==='Escape'){document.querySelectorAll('details.vtt-menu[open]').forEach(el=>(el as HTMLDetailsElement).open=false);}}}>

  <details className="vtt-menu" onMouseLeave={e=>{e.currentTarget.open=false;}}><summary>Campaign</summary><div className="vtt-menu-items">
   {me.isDm?<>
    <button onClick={()=>{if(window.confirm('Leave this room and create a new campaign? Save your current campaign first.')){sessionStorage.removeItem('dmSecret');location.href=location.pathname;}}}>New…</button>
    <button onClick={()=>void openLocalFile()}>Open…</button>
    <button onClick={renameCampaign}>Rename…</button>
    <button disabled={saving||!campaign} onClick={()=>void saveCampaign()}>Save (⌘/Ctrl+S)</button>
    <button disabled={saving||!campaign} onClick={()=>void saveAs()}>Save As…</button>
    <label className="vtt-menu-check" title="Requires an authorized local campaign file"><input type="checkbox" checked={autoSave} disabled={!directFile} onChange={e=>setAutoSave(e.target.checked)}/> Autosave</label>
    {recoveryAvailable&&<button onClick={()=>void restoreRecovery()}>Restore recovery…</button>}
   </>:<span className="vtt-menu-note">Campaign files are managed by the DM.</span>}
  </div></details>
  <details className="vtt-menu" onMouseLeave={e=>{e.currentTarget.open=false;}}><summary>Character</summary><div className="vtt-menu-items">
   {me.isDm&&<><button onClick={()=>void addCharacter()}>New character…</button><button onClick={()=>characterInput.current?.click()}>Import .dndchar…</button></>}
   {(me.isDm?(campaign?.characters||[]):myCharacters).length===0&&<span className="vtt-menu-note">No characters available</span>}
   {(me.isDm?(campaign?.characters||[]):myCharacters).map(c=><div className="vtt-menu-character" key={c.id}><strong>{c.name}</strong><button onClick={()=>void openSheet(c.id)}>Open sheet</button>{me.isDm&&<button onClick={()=>void assignCharacter(c.id)}>Assign…</button>}<button onClick={()=>void exportCharacter(c.id)}>Export .dndchar</button></div>)}
  </div></details>
  <details className="vtt-menu" onMouseLeave={e=>{e.currentTarget.open=false;}}><summary>Scene</summary><div className="vtt-menu-items">
   {me.isDm?<><label className="vtt-menu-note">Current scene<select aria-label="Select scene" value={campaign?.activeSceneId||''} onChange={e=>void switchScene(e.target.value)}>{campaign?.scenes.map(sc=><option key={sc.id} value={sc.id}>{sc.name}</option>)}</select></label><button onClick={()=>void addScene()}>New scene…</button><button onClick={()=>void renameScene()}>Rename scene…</button></>:<span className="vtt-menu-note">The DM controls scenes.</span>}
  </div></details>
  <span className="vtt-menu-context" title={campaign?.name||'Campaign'}>{campaign?.name||'Campaign'} · {campaign?.scenes.find(sc=>sc.id===campaign.activeSceneId)?.name||'Scene'}</span>
  {me.isDm&&<span className="vtt-menu-save" role="status">{dirty?'● Unsaved changes':saveLabel||'Saved'}{directFile?' · Local file':''}</span>}
 </nav>
 <input ref={fileInput} type="file" accept=".dndcamp,application/json" style={{display:'none'}} onChange={openCampaign}/>
 <input ref={characterInput} type="file" accept=".dndchar,application/json" style={{display:'none'}} onChange={e=>void importCharacter(e)}/>
 {editingCharacter&&<CharacterSheet character={editingCharacter} onSave={saveSheet} onRoll={rollSheet} onClose={()=>setEditingCharacter(null)}/>}
 <section className="video-row media-section"><MediaRoom roomId={state.roomId} socketId={me.id} api={API}/></section>
 <section aria-label="Game server presence" style={{padding:'10px 16px',borderBottom:'1px solid #555',display:'flex',alignItems:'flex-start',gap:16,flexWrap:'wrap'}}>
  <div style={{display:'flex',alignItems:'center',gap:8}}><span aria-hidden="true" style={{color:connected?'#69d59a':'#f3b366'}}>●</span><strong>{connected?'Connected to game server':'Reconnecting to game server…'}</strong><span style={{opacity:.75}}>· Video optional</span></div>
  <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}><strong>Players ({room.members.length} online):</strong>{room.members.map(m=><span key={m.id} style={{padding:'3px 9px',border:'1px solid #777',borderRadius:14,whiteSpace:'nowrap'}}><span aria-hidden="true" style={{color:'#69d59a'}}>●</span> {m.name}{m.isDm?' (DM)':''}{m.id===me.id?' (you)':''}</span>)}</div>
  <div aria-live="polite" style={{width:'100%',fontSize:12,opacity:.75}}>{presenceEvents[0]&&Date.now()-presenceEvents[0].at<120000?`${presenceEvents[0].name} ${presenceEvents[0].kind==='joined'?'joined the game':'disconnected'}`:'Everyone listed above is connected to the game, regardless of camera or microphone status.'}</div>
 </section>
 <div className="encounter-bar" style={{display:'flex',alignItems:'center',gap:12,flexWrap:'wrap',padding:'10px 16px',borderBottom:'1px solid #555'}}>
  <strong>Encounter: {inCombat?'Combat':'Exploration'}</strong>
  {me.isDm&&<><button type="button" onClick={()=>emit('encounter:mode',{mode:inCombat?'exploration':'combat'})}>{inCombat?'Return to Exploration':'Enter Combat'}</button>
  <label style={{display:'flex',alignItems:'center',gap:6}}><input type="checkbox" checked={!!state.playerMovementEnabled} onChange={e=>emit('settings:movement',{enabled:e.target.checked})}/> Allow players to move assigned tokens</label></>}
  <small>Hidden enemies are revealed separately by the DM.</small>
 </div>
 <div className={`workspace vtt-dice-workspace ${diceOpen?"vtt-dice-expanded":inCombat?"vtt-dice-combat-collapsed":"vtt-dice-collapsed"}`}><section className="map-panel"><div className="panel-title"><span><MapIcon size={17}/> Shared tabletop</span><small>{me.isDm?'DM controls movement':state.playerMovementEnabled?'Move your assigned token':'Ask the DM to move your character'} · 1 square = 5 ft</small></div><BattleBoard state={state} members={room.members} isDm={me.isDm} meId={me.playerId} emit={emit} />{me.isDm&&<DebugRecorder state={state}/>}{me.isDm&&<div className="toolbar"><input aria-label="Token name" value={tokenName} onChange={e=>setTokenName(e.target.value)} maxLength={40}/><select aria-label="New token size" value={tokenSize} onChange={e=>setTokenSize(e.target.value as CreatureSize)}>{(['Small','Medium','Large','Huge','Gargantuan'] as const).map(size=><option key={size} value={size}>{size} ({size==='Large'?'2×2':size==='Huge'?'3×3':size==='Gargantuan'?'4×4':'1×1'})</option>)}</select><button onClick={()=>emit('token:add',{name:tokenName,color:'#538fc1',ownerId:null,size:tokenSize})}><Plus size={15}/> Add token</button><select aria-label="Assign token to player" onChange={e=>{const id=e.target.value;if(!id)return;emit('token:add',{name:room.members.find(m=>m.id===id)?.name||'Hero',color:'#65b58e',ownerId:room.members.find(m=>m.id===id)?.playerId??id,size:tokenSize});e.target.value='';}} defaultValue=""><option value="">Add player token…</option>{room.members.filter(m=>!m.isDm).map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></div>}</section>
 <aside className="vtt-dice-sidebar" aria-label="Dice and initiative controls"><div className="vtt-dice-toggle-row"><button type="button" className="vtt-dice-toggle" aria-expanded={diceOpen} aria-controls="vtt-dice-drawer" title={diceOpen?'Collapse dice drawer':'Expand dice drawer'} onClick={()=>setDiceOpen(open=>!open)}><Dices size={18}/><span>{diceOpen?'Hide dice':'Show dice'}</span><span aria-hidden="true">{diceOpen?'›':'‹'}</span></button></div>{inCombat&&<><div className="panel-title">Initiative <span>Round {state.round}</span></div><div className="initiative">{state.initiative.length===0&&<p className="muted">No combatants yet.</p>}{state.initiative.map((c,i)=><div key={c.id} className={'combatant '+(i===state.turnIndex?'active':'')}><span>{c.name}</span><b>{c.score}</b></div>)}</div>{me.isDm&&<><div className="formrow"><input aria-label="Combatant" value={initiativeName} onChange={e=>setInitiativeName(e.target.value)}/><input aria-label="Initiative score" type="number" value={initiativeScore} onChange={e=>setInitiativeScore(Number(e.target.value))}/><button onClick={()=>emit('initiative:add',{name:initiativeName,score:initiativeScore})}>Add</button></div><button className="primary" onClick={()=>emit('initiative:next',{})}>Next turn →</button></>}</>}<div id="vtt-dice-drawer" className="vtt-dice-drawer" hidden={!diceOpen}><div className="panel-title dice-title"><Dices size={18}/> Dice</div><div className="dice-buttons">{[4,6,8,10,12,20,100].map(s=><button key={s} onClick={()=>emit('dice:roll',{count:1,sides:s,modifier:0})}>d{s}</button>)}</div><div className="rolls">{rolls.map((r,i)=><div key={i}><b>{r.by}</b> {r.label?`${r.label} (${r.advantage||'normal'})`: `d${r.sides}`}: {r.dice.join(r.advantage&&r.advantage!=='normal'?' or ':'+')} {r.modifier?`(${r.modifier>0?'+':''}${r.modifier})`:''} = <b>{r.total}</b></div>)}</div></div></aside></div>{error&&<div className="toast" role="alert" onClick={()=>setError('')}>{error} ✕</div>}<footer>Campaign files are saved locally by the DM · Unsaved room state is lost if the server restarts</footer></div>;
}
