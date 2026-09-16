import test from 'node:test';
import assert from 'node:assert/strict';
import {createBillingStatusHandler,createBillingPortalHandler,publicPrice} from '../supabase/functions/_shared/web_billing.mjs';

const owner = '00000000-0000-4000-8000-000000000001';
const request = (method='GET',extra={}) => new Request('https://api.slop.game/functions/v1/billing-status', {
  method,headers:{origin:'https://slop.game',authorization:'Bearer test-owner',...extra},
});
function dependencies(overrides={}) {
  return {authenticate:async()=>({id:owner,is_anonymous:false}),readBilling:async()=>[{is_pro:true}],
    configuration:()=>({configured:true,enabled:true,livemode:false,portalConfigured:true}),readAuthority:async id=>{
      assert.equal(id,owner);return {ready:true,customer_id:'cus_verifiedOwner'};
    },readPrice:async()=>({active:true,type:'recurring',livemode:false,unit_amount:1500,currency:'usd',recurring:{interval:'month',interval_count:1}}),
    createPortal:async id=>{assert.equal(id,'cus_verifiedOwner');return {url:'https://billing.stripe.com/p/session_test'};},...overrides};
}
test('status requires a nonanonymous verified owner and rejects foreign browser origins',async()=>{
  const handler=createBillingStatusHandler(dependencies());
  assert.equal((await handler(request('GET',{authorization:''}))).status,401);
  assert.equal((await handler(request('GET',{origin:'https://attacker.example'}))).status,403);
  assert.equal((await createBillingStatusHandler(dependencies({authenticate:async()=>({id:owner,is_anonymous:true})}))(request())).status,401);
});
test('missing configuration and missing DB authority keep paid operations unavailable without hiding current entitlements',async()=>{
  for(const change of [{configuration:()=>({configured:false})},{readAuthority:async()=>({ready:false})}]){
    const response=await createBillingStatusHandler(dependencies(change))(request());
    assert.equal(response.status,200);const data=await response.json();
    assert.equal(data.owner_id,owner);assert.equal(data.premium,true);
    assert.equal(data.available,false);assert.equal(data.portal_available,false);assert.equal(data.price,null);
    assert.equal(response.headers.get('cache-control'),'no-store');
  }
});
test('status returns only the server current price and never exposes Stripe customer ids',async()=>{
  const response=await createBillingStatusHandler(dependencies())(request());const data=await response.json();
  assert.deepEqual(data.price,{amount:1500,currency:'usd',interval:'month'});
  assert.equal(data.available,true);assert.equal(data.portal_available,true);
  assert.equal(JSON.stringify(data).includes('cus_'),false);
});
test('provider price must be active, in the matching mode, and an exact monthly amount',()=>{
  const price={active:true,type:'recurring',livemode:false,unit_amount:1500,currency:'usd',recurring:{interval:'month',interval_count:1}};
  for(const change of [{active:false},{livemode:true},{unit_amount:0},{unit_amount:1.5},{recurring:{interval:'year',interval_count:1}},{recurring:{interval:'month',interval_count:2}},{currency:'<x>'}]){
    assert.equal(publicPrice({...price,...change},false),null);
  }
});
test('portal ignores forged body customer and return destinations and uses signed owner receipt',async()=>{
  const req=new Request('https://api.slop.game/functions/v1/stripe-portal',{method:'POST',headers:{origin:'https://slop.game',authorization:'Bearer test-owner','content-type':'application/json'},body:JSON.stringify({customer_id:'cus_victimAccount',return_url:'https://attacker.example'})});
  const response=await createBillingPortalHandler(dependencies())(req);
  assert.equal(response.status,200);assert.equal((await response.json()).url,'https://billing.stripe.com/p/session_test');
});
test('portal cannot fall back to legacy ownership or an arbitrary provider redirect',async()=>{
  for(const change of [{configuration:()=>({configured:false})},{readAuthority:async()=>({ready:false,customer_id:'cus_victimAccount'})},{readAuthority:async()=>({ready:true,customer_id:null})},{createPortal:async()=>({url:'https://billing.stripe.com.attacker.example'})}]){
    const response=await createBillingPortalHandler(dependencies(change))(request('POST'));
    assert.ok(response.status>=400);assert.equal((await response.json()).url,undefined);
  }
});
test('membership management remains available while new subscriptions are paused',async()=>{
  const deps=dependencies({configuration:()=>({configured:true,enabled:false,livemode:false,portalConfigured:true})});
  const data=await (await createBillingStatusHandler(deps)(request())).json();
  assert.equal(data.available,false);assert.equal(data.portal_available,true);
  assert.equal((await createBillingPortalHandler(deps)(request('POST'))).status,200);
});
test('status errors do not silently report an existing member as free',async()=>{
  const response=await createBillingStatusHandler(dependencies({readBilling:async()=>{throw Error('offline');}}))(request());
  assert.equal(response.status,503);assert.equal((await response.json()).premium,undefined);
});
