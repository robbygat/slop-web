import {validSaveRow} from './persist-contracts.js';

// Input-order correlation is part of claim_device_saves. The guest originals
// remain on this device; account recovery history retains the offered copy.
export async function claimPersistentDeviceSaves({store,owner,assertCurrent,rpc}) {
 const rows=(await store.list('device')).filter(row=>!row.claimedBy);
 for(let offset=0;offset<rows.length;offset+=32){
  assertCurrent();const batch=rows.slice(offset,offset+32);
  const result=await rpc('claim_device_saves',{p_saves:batch.map(row=>({game_id:JSON.parse(row.key)[1],scope:row.scope,slot:0,
   schema_version:row.schema_version,revision:row.revision,base_revision:0,data:row.data,run_label:row.run_label,run_status:row.run_status}))});
  assertCurrent();
  if(!Array.isArray(result?.saves)||result.saves.length!==batch.length)throw new Error('Device progress is safe, but its account transfer was not confirmed.');
  for(let i=0;i<batch.length;i++){
   assertCurrent();const row=batch[i],receipt=result.saves[i];
   if(!validSaveRow(receipt?.current,row.scope,receipt?.game_id)||receipt.throttled)continue;
   const game=JSON.parse(row.key)[1];
   await store.archive(owner,game,row.scope,row,'device-transfer');assertCurrent();
   await store.change('device',game,[{scope:row.scope,update:latest=>latest?.revision===row.revision?{...latest,claimedBy:owner}:null}]);
  }
 }
}
