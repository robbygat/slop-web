import {SlopError} from './contracts.js';

export function coinSnapshot(data){
 if(!Number.isSafeInteger(data?.balance)||data.balance<0||typeof data.daily_claim_available!=='boolean')throw new SlopError('invalid_response');
 return data;
}
export function dailyCoinReceipt(data){
 if(typeof data?.claimed!=='boolean'||typeof data.already_claimed!=='boolean'||data.claimed===data.already_claimed||!Number.isSafeInteger(data.reward)||data.reward<=0||!Number.isSafeInteger(data.balance)||data.balance<0||!Number.isFinite(Date.parse(data.next_claim_at)))throw new SlopError('invalid_response');
 return {balance:data.balance,daily_claim_available:false,daily_reward:data.reward,next_claim_at:data.next_claim_at};
}
