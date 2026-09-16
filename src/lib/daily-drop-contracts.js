import {SlopError,UUID} from './contracts.js';

const validId=value=>typeof value==='string'&&value.length>0&&value.length<=160;
const validDay=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value);

export function parseDailyDrop(value,ownerId){
 if(!value||value.version!==3||!UUID.test(ownerId)||value.user_id!==ownerId||!['claimed','already_claimed','collection_complete'].includes(value.code))throw new SlopError('invalid_response');
 if(value.code==='collection_complete'){
  if(value.ok!==false||value.owned!==false||value.reward_id!==null||value.reward_kind!==null)return invalid();
  return {code:value.code,itemId:null,kind:null,claimed:false,lastDaily:null};
 }
 if(!validId(value.reward_id)||!['slop_cosmetic','profile_banner'].includes(value.reward_kind)||value.owned!==true||!validDay(value.last_daily))return invalid();
 if(value.reward_kind==='slop_cosmetic'&&value.cosmetic_id!==value.reward_id)return invalid();
 if(value.reward_kind==='profile_banner'&&value.banner_id!==value.reward_id)return invalid();
 if(value.code==='claimed'&&value.ok!==true)return invalid();
 if(value.code==='already_claimed'&&value.ok!==false)return invalid();
 return {code:value.code,itemId:value.reward_id,kind:value.reward_kind,claimed:value.code==='claimed',lastDaily:value.last_daily};
}

function invalid(){throw new SlopError('invalid_response');}
