import test from 'node:test';import assert from 'node:assert/strict';
import {normalizedLook,lookChoice,equipReceipt,createAppearanceService,sameLook} from '../src/lib/appearance-contracts.js';
import {createOwnerScope} from '../src/lib/contracts.js';
const a='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',b='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const original=normalizedLook({palette:'mint',body:'heart',name:'My Slop',hat:'tuft',aura:'none'});
test('native appearance normalization preserves identity and removes only invalid face collisions',()=>{
 assert.equal(normalizedLook({...original,eyes:'cyclops',accessory:'glasses'}).accessory,'none');
 assert.equal(normalizedLook({...original,eyes:'round',accessory:'glasses'}).accessory,'glasses');
 assert.equal(normalizedLook({...original,eyes:'visor',accessory:'mask'}).accessory,'none');
 assert.equal(normalizedLook(original).name,'My Slop');assert.equal(normalizedLook(original).hat,'tuft');
});
test('collectible choices use authoritative wardrobe without locking free body or colors',()=>{
 const catalog=[{id:'body-star',slot:'body',look:{body:'star'}},{id:'eyes-premium-slop-cyclops',slot:'eyes',look:{eyes:'slopCyclops'}}];
 assert.equal(lookChoice('body','star',{catalog}).allowed,false);
 assert.equal(lookChoice('body','star',{catalog,ownedIds:['body-star']}).allowed,true);
 assert.equal(lookChoice('body','heart',{catalog}).allowed,true);
 assert.equal(lookChoice('palette','mint',{catalog}).allowed,true);
 assert.equal(lookChoice('hat','itCouldBeWorse',{catalog}).allowed,false);
});
test('equip success requires the exact accepted look receipt',()=>{
 const requested={...original,palette:'aqua'};
 assert.throws(()=>equipReceipt({ok:false,code:'not_owned'},requested),{code:'not_owned'});
 assert.throws(()=>equipReceipt({ok:true,code:'equipped',slop_look:original},requested),{code:'invalid_response'});
 assert.deepEqual(equipReceipt({ok:true,code:'equipped',slop_look:requested},requested),requested);
});
function fixture(){let session={user:{id:a},access_token:'a-token',epoch:1},stored=original,writes=0,hook=()=>{};
 const client={from(){return{select(){return this;},eq(){return this;},async single(){hook();return{data:{id:a,slop_look:stored}};}};},async rpc(name,args){if(name==='my_slop_cosmetics')return{data:{authenticated:true,owned_ids:[]}};writes++;stored=args.p_look;return{data:{ok:true,code:'equipped',slop_look:stored}};}};
 const result=async promise=>{const r=await promise;if(r.error)throw r.error;return r.data;};
 const asOwner=createOwnerScope({getSession:()=>session,clientFactory:token=>({...client,async rpc(...args){await token();return client.rpc(...args);}})});
 return{service:createAppearanceService({asOwner,result}),writes:()=>writes,setStored:v=>stored=v,switchOwner:()=>{session={user:{id:b},access_token:'b-token',epoch:2};},onRead:f=>hook=f};
}
test('appearance save reads back the accepted owner look and can save without changing it',async()=>{const f=fixture();assert.deepEqual((await f.service.load(a)).look,original);const r=await f.service.save(a,original,original);assert.ok(sameLook(r,original));assert.equal(f.writes(),1);});
test('stale editor or switched account cannot overwrite another look',async()=>{let f=fixture();f.setStored({...original,palette:'grape'});await assert.rejects(f.service.save(a,original,original),{code:'version_changed'});assert.equal(f.writes(),0);f=fixture();f.switchOwner();await assert.rejects(f.service.save(a,original,original),{code:'account_changed'});assert.equal(f.writes(),0);});
test('account change while checking the appearance prevents the equip call',async()=>{const f=fixture();f.onRead(f.switchOwner);await assert.rejects(f.service.save(a,original,{...original,palette:'aqua'}),{code:'account_changed'});assert.equal(f.writes(),0);});
