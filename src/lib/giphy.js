import {request} from './supabase.js';
import {parseGifResults} from './giphy-contracts.js';

export async function findGifs(query=''){
 const clean=query.trim().slice(0,80);
 const payload=await request('gif-proxy','/',{body:{kind:clean?'search':'trending',query:clean,limit:12},ownerReceipt:false});
 return parseGifResults(payload);
}
