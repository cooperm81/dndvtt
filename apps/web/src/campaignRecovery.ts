// Browser-local recovery cache; snapshots are not a substitute for saving the .dndcamp file.
type Recovery={campaign:unknown;revision:number;createdAt:number};
const DB='dndvtt-campaign-recovery';const STORE='snapshots';
function openDb():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{
 const req=indexedDB.open(DB,1);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE);};
 req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
});}
async function transaction<T>(key:string,mode:IDBTransactionMode,op:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T>{
 const db=await openDb();try{return await new Promise<T>((resolve,reject)=>{
 const tx=db.transaction(STORE,mode);const request=op(tx.objectStore(STORE));
 request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
 tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
 });}finally{db.close();}
}
export const storeRecovery=(key:string,value:Recovery)=>transaction(key,'readwrite',s=>s.put(value,key));
export const readRecovery=(key:string)=>transaction<Recovery|undefined>(key,'readonly',s=>s.get(key));
export const clearRecovery=(key:string)=>transaction(key,'readwrite',s=>s.delete(key));
