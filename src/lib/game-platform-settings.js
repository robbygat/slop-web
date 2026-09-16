import {asOwner,result} from './supabase.js';
import {SLUG,SlopError} from './contracts.js';
import {platformValues} from './game-platforms.js';
export function setGamePlatform(slug,platform){if(!SLUG.test(slug))throw new SlopError('invalid_response');const values=platformValues(platform);return asOwner(async(owner,client)=>{const r=await result(client.rpc('set_game_supported_platforms',{p_owner:owner,p_game_slug:slug,p_platforms:values}));if(r?.owner_id!==owner||r.game_slug!==slug||JSON.stringify(r.supported_platforms)!==JSON.stringify(values))throw new SlopError('invalid_response');return r;});}
