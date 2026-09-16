// Public catalog only. Inventory and purchases remain authenticated owner RPCs.
const headers={'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, OPTIONS','Cache-Control':'public, max-age=120','X-Content-Type-Options':'nosniff'};
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='GET')return Response.json({error:'method_not_allowed'},{status:405,headers});
 try{
  const base=Deno.env.get('SUPABASE_URL')!;const named=Deno.env.get('SUPABASE_SECRET_KEYS');const key=named?JSON.parse(named).default:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');if(typeof key!=='string'||!key)throw new Error('missing key');
  const r=await fetch(`${base}/rest/v1/slop_cosmetic_products?select=cosmetic_id,trait_slot,trait_value,coin_price,purchasable,beta_exclusive&order=cosmetic_id&limit=500`,{headers:{apikey:key,...(key.startsWith('sb_secret_')?{}:{Authorization:`Bearer ${key}`})},signal:AbortSignal.timeout(10000),redirect:'error'});
  if(!r.ok)throw new Error('catalog unavailable');
  const products=await r.json();if(!Array.isArray(products))throw new Error('invalid catalog');
  return Response.json({products}, {headers});
 }catch{return Response.json({error:'catalog_unavailable'},{status:503,headers:{...headers,'Cache-Control':'no-store'}});}
});
