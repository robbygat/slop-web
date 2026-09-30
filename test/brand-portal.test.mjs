import test from 'node:test';
import assert from 'node:assert/strict';
import {createPortalScope,pendingPair,savePendingPair,activeConnections,latestDrafts,portalDraftView,validatePortalPayload} from '../src/lib/mcp-portal.js';
import {createPreviewPool} from '../src/lib/preview-pool.js';
import {canWearRobot,withRobotItem,robotEquipReceipt,createRobotAppearance,sameRobotLook} from '../src/lib/robot-shop.js';
import {robotSpec,ROBOTS,ROBOT_FINISHES} from '../src/lib/robot-catalog.js';
import {existsSync} from 'node:fs';

test('portal discards older reads and fences actions after account changes or unmount',()=>{
 const scope=createPortalScope(),first=scope.read(),latest=scope.read();assert.equal(first(),false);assert.equal(latest(),true);
 const op=scope.begin('publish');assert.equal(latest(),false);assert.equal(scope.begin('double-click'),null);assert.equal(op.current(),true);
 scope.invalidate();assert.equal(op.current(),false);const next=scope.begin('new-owner');op.finish();assert.equal(scope.busy,true);assert.equal(next.current(),true);next.finish();assert.equal(scope.busy,false);
});
test('pair persistence tolerates unavailable storage and rejects missing or stale expiration',()=>{
 const blocked={getItem(){throw new Error('privacy mode');},setItem(){throw new Error('quota');}};
 assert.equal(pendingPair(blocked),null);assert.equal(savePendingPair(blocked,{}),false);
 for(const expires of [undefined,null,'1001',1000,601001])assert.equal(pendingPair({getItem:()=>JSON.stringify({id:'11111111-1111-4111-8111-111111111111',code:'abcdef',expires})},1000),null);
});
test('expired connections never count as connected and latest draft is chosen by revision',()=>{
 const rows=[{id:'old',status:'active',expires_at:'2020-01-01'},{id:'live',status:'active',expires_at:'2040-01-01'},{id:'revoked',status:'revoked',expires_at:'2040-01-01'},{id:'bad',status:'active',expires_at:'not-a-date'}];
 assert.deepEqual(activeConnections(rows,Date.parse('2026-01-01')).map(c=>c.id),['live']);
 const drafts=[{project_id:'a',revision:4},{project_id:'b',revision:2},{project_id:'a',revision:1}];assert.deepEqual(latestDrafts(drafts),drafts.slice(0,2));
 assert.throws(()=>validatePortalPayload([{connection_id:'invalid'}],[]));
});
test('publisher queue is locked but cannot impersonate confirmed publication',()=>{
 const draft={project_id:'p',game_id:'staged',digest:'source',publication:{status:'publishing'}};
 const waiting=portalDraftView(draft,{gameStates:{staged:'draft'}});assert.equal(waiting.locked,true);assert.equal(waiting.group,'ready');assert.equal(waiting.badge,'Publishing');
 const confirmed=portalDraftView(draft,{gameStates:{staged:'published',previews:{staged:{id:'staged',hasVideo:false}}}});assert.equal(confirmed.group,'published');assert.equal(confirmed.badge,'Published');assert.equal(confirmed.published.hasVideo,false);
});
test('preview pool bounds decoders and transfers a slot to the hovered tile',()=>{
 const pool=createPreviewPool(6),states=Array(30).fill(false),handles=states.map((_,i)=>pool.register(i,v=>states[i]=v));
 handles.forEach(h=>h.set(true));assert.equal(pool.activeCount,6);assert.equal(states.filter(Boolean).length,6);
 handles[25].set(true,10);assert.equal(states[25],true);assert.equal(states[5],false);assert.equal(pool.activeCount,6);
 handles[25].set(false);assert.equal(states[25],false);assert.equal(states[5],true);
 handles.forEach(h=>h.release());assert.equal(pool.activeCount,0);assert.equal(states.some(Boolean),false);
});
test('robot ownership uses trusted inventory, preserves unrelated look fields, and checks receipts',()=>{
 const item={id:'robot-shell-chip',slot:'shell',value:'chip',tier:'coin'},look={palette:'mint',futureFeature:{x:1},robot:{shell:'core',gear:'halo',companion:'bee'}};
 assert.equal(canWearRobot(item,{owned_ids:[item.id]},look),false);
 assert.equal(canWearRobot(item,{robot_catalog_version:'v2',robot_derived:{shell:'chip'}},look),false);
 const inventory={robot_catalog_version:'v2',robot_starter:{shell:'chip'},robot_derived:{shell:'core',face:'happy'}};
 assert.equal(canWearRobot(item,inventory,look),true);
 const next=withRobotItem(look,inventory,item);assert.deepEqual(next.futureFeature,{x:1});assert.equal(next.robot.companion,'bee');assert.equal(next.robot.face,'happy');assert.equal(look.robot.shell,'core');
 assert.throws(()=>robotEquipReceipt({ok:true,code:'equipped',slop_look:look},next));
 assert.deepEqual(robotEquipReceipt({ok:true,code:'equipped',slop_look:next},next),next);
 assert.equal(sameRobotLook({b:2,a:{y:2,x:1}},{a:{x:1,y:2},b:2}),true);
});
test('robot saves refuse changed accounts and concurrent profile changes before writing',async()=>{
 let writes=0;const current={robot:{shell:'neko'}};
 const client={from:()=>({select:()=>({eq:()=>({single:()=>({id:'alice',slop_look:current})})})}),rpc:()=>{writes++;}};
 const service=createRobotAppearance({asOwner:work=>work('alice',client),result:async v=>v});
 await assert.rejects(service.save('bob',current,current),/account changed/);
 await assert.rejects(service.save('alice',{robot:{shell:'core'}},current),/another screen/);assert.equal(writes,0);
});
test('all current shell and finish previews exist and renderer accepts mobile effects',()=>{
 for(const robot of ROBOTS)for(const finish of ROBOT_FINISHES)assert.equal(existsSync(new URL(`../public/assets/robots/shells/${robot.id}/${finish}.webp`,import.meta.url)),true,`${robot.id}/${finish}`);
 const spec=robotSpec({robot:{shell:'glowcap',finish:'holo',face:'grille',line:'scope',fx:'rain',glow:'aurora'}});assert.equal(spec.face,'grille');assert.equal(spec.line,'scope');assert.equal(spec.fx,'rain');assert.equal(spec.glow2,'#b58cff');
 assert.equal(robotSpec({hat:'cap',palette:'mint'}).shell,'gatekeeper');assert.equal(robotSpec({robot:{shell:'prickles'}}).shell,'prickles');
});
