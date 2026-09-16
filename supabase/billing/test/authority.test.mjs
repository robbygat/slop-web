import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
// Reuse the existing MCP PostgreSQL test runtime; no production dependency.
const {PGlite}=createRequire(new URL('../../../mcp/package.json',import.meta.url))('@electric-sql/pglite');
const OWNER='11111111-1111-4111-8111-111111111111';
const OTHER='22222222-2222-4222-8222-222222222222';
const PRICE='price_proMonthly';
const now=Math.floor(Date.now()/1000);
const period=new Date((now+30*86400)*1000).toISOString();
async function fixture(){
  const db=new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users(id uuid primary key,eligible boolean default true);
    insert into auth.users(id) values ('${OWNER}'),('${OTHER}');
    create function auth.uid() returns uuid language sql set search_path = public as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.jwt() returns jsonb language sql set search_path = public as $$ select jsonb_build_object('role',current_setting('request.jwt.claim.role',true)) $$;
    create table account_delete_intents(user_id uuid primary key);
    create function is_nonanonymous_user(p uuid) returns bool language sql set search_path = public as $$ select eligible from auth.users where id=p $$;
    create function has_account_delete_intent(p uuid) returns bool language sql set search_path = public as $$ select exists(select 1 from account_delete_intents where user_id=p) $$;
    create table billing(user_id uuid primary key references auth.users(id) on delete cascade,is_pro boolean default false,pro_until timestamptz,stripe_customer_id text,credits int default 0);
    create table credit_ledger(id bigint generated always as identity,user_id uuid,amount int,reason text);
    create table coin_ledger(id bigint generated always as identity,user_id uuid,delta int,reason text,request_id text,created_at timestamptz default now());
    create function ensure_billing(p_user uuid) returns void language sql set search_path = public as $$ insert into billing(user_id) values(p_user) on conflict do nothing $$;
    create function grant_credits(p_user uuid,p_amount integer,p_reason text) returns void language plpgsql set search_path = public as $$ begin perform ensure_billing(p_user); insert into credit_ledger(user_id,amount,reason) values(p_user,p_amount,p_reason); update billing set credits=credits+p_amount where user_id=p_user; end $$;
    create function _sweep_credits(p_user uuid) returns void language plpgsql set search_path = public as $$ declare n int; begin select credits into n from billing where user_id=p_user for update; if n>0 then insert into coin_ledger(user_id,delta,reason) values(p_user,n,'paid'); update billing set credits=0 where user_id=p_user; end if; end $$;
    create function _net_coin_spend_since(p uuid,t timestamptz) returns integer language sql set search_path = public as $$ select coalesce(sum(-delta),0)::int from coin_ledger where user_id=p and created_at>=t and delta<0 and reason<>'stripe_topup_reversal' $$;
    revoke all on function ensure_billing(uuid),grant_credits(uuid,integer,text) from public,anon,authenticated;
    grant execute on function ensure_billing(uuid),grant_credits(uuid,integer,text) to service_role;
  `);
  await db.exec(await readFile(new URL('../restore-authority.sql',import.meta.url),'utf8'));
  const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
  const create=async(owner=OWNER)=>await scalar('select intent_id from create_stripe_checkout_intent($1,$2,$3)',[owner,'pro',PRICE]);
  const bind=async(id,owner=OWNER,session='cs_test_sessionOne')=>await scalar('select bind_stripe_checkout_session($1,$2,$3)',[id,owner,session]);
  const checkout=async(id,{event='evt_checkoutOne',owner=OWNER,price=PRICE,customer='cus_customerOne',session='cs_test_sessionOne'}={})=>await scalar('select apply_stripe_subscription_checkout($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',[event,'checkout.session.completed',now,false,'a'.repeat(64),id,session,owner,price,'sub_subscriptionOne',customer,period]);
  const invoice=async({event='evt_invoiceOne',invoice='in_invoiceOne',customer='cus_customerOne',price=PRICE,digest='b'.repeat(64)}={})=>await scalar('select apply_stripe_subscription_invoice($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[event,now,false,digest,invoice,'sub_subscriptionOne',customer,price,'subscription_create',period]);
  return {db,scalar,create,bind,checkout,invoice};
}
test('staged recovery parses; all payment receipts and mutators are inaccessible to client roles',async()=>{
  const f=await fixture();try{
    for(const role of ['anon','authenticated']){
      assert.equal(await f.scalar(`select has_function_privilege($1,'create_stripe_checkout_intent(uuid,text,text)','execute')`,[role]),false);
      assert.equal(await f.scalar(`select has_function_privilege($1,'stripe_web_billing_authority(uuid)','execute')`,[role]),false);
      assert.equal(await f.scalar(`select has_table_privilege($1,'stripe_customer_owners','select')`,[role]),false);
      assert.equal(await f.scalar(`select has_table_privilege($1,'stripe_webhook_events','insert')`,[role]),false);
    }
  }finally{await f.db.close();}
});
test('checkout binds session, owner, exact price and immutable customer before membership can change',async()=>{
  const f=await fixture();try{
    const id=await f.create();await f.bind(id);
    await assert.rejects(()=>f.bind(id,OTHER),/checkout_intent_not_found/);
    await assert.rejects(()=>f.checkout(id,{owner:OTHER}),/intent_mismatch/);
    await assert.rejects(()=>f.checkout(id,{price:'price_attacker'}),/intent_mismatch/);
    assert.equal(await f.scalar('select count(*) from stripe_webhook_events'),0);
    assert.equal(await f.checkout(id),'subscription_registered');
    assert.equal(await f.scalar('select customer_id from stripe_customer_owners where user_id=$1',[OWNER]),'cus_customerOne');
    assert.equal(await f.scalar('select account_id from stripe_customer_owners where user_id=$1',[OWNER]),OWNER);
  }finally{await f.db.close();}
});
test('replayed events and multiple events for the same invoice grant value exactly once; changed payloads roll back',async()=>{
  const f=await fixture();try{
    const id=await f.create();await f.bind(id);await f.checkout(id);
    assert.equal(await f.invoice(),'applied');
    assert.equal(await f.invoice(),'duplicate_event');
    assert.equal(await f.invoice({event:'evt_invoiceOther'}),'duplicate_source');
    await assert.rejects(()=>f.invoice({digest:'c'.repeat(64)}),/stripe_event_reuse_mismatch/);
    assert.equal(await f.scalar('select sum(amount) from credit_ledger where user_id=$1',[OWNER]),600);
    assert.equal(await f.scalar('select count(*) from stripe_billing_grants'),1);
  }finally{await f.db.close();}
});
test('new sales reject anonymous/deleting accounts, retired top-ups and legacy unproven Stripe customer ids',async()=>{
  const f=await fixture();try{
    await f.db.query('update auth.users set eligible=false where id=$1',[OWNER]);
    await assert.rejects(()=>f.create(),/verified_account_required/);
    await f.db.query('update auth.users set eligible=true where id=$1',[OWNER]);
    await f.db.query('insert into account_delete_intents values($1)',[OWNER]);
    await assert.rejects(()=>f.create(),/verified_account_required/);
    await f.db.query('delete from account_delete_intents where user_id=$1',[OWNER]);
    await assert.rejects(()=>f.scalar('select intent_id from create_stripe_checkout_intent($1,$2,$3)',[OWNER,'topup_small',PRICE]),/invalid_checkout_kind/);
    await f.db.query('insert into billing(user_id,stripe_customer_id) values($1,$2)',[OWNER,'cus_victimCustomer']);
    await assert.rejects(()=>f.create(),/stripe_customer_owner_unproven/);
    assert.equal(await f.scalar('select count(*) from stripe_checkout_intents'),0);
  }finally{await f.db.close();}
});
test('a delayed paid checkout cannot expire by local clock to create a second charge',async()=>{
  const f=await fixture();try{
    const id=await f.create();await f.bind(id);
    await f.db.query("update stripe_checkout_intents set created_at=now()-interval '2 hours',expires_at=now()-interval '1 hour' where id=$1",[id]);
    await assert.rejects(()=>f.create(),/checkout_reconciliation_required/);
    assert.equal(await f.scalar('select state from stripe_checkout_intents where id=$1',[id]),'bound');
  }finally{await f.db.close();}
});
test('cumulative partial and full refunds debit once and hold membership after a full reversal',async()=>{
  const f=await fixture();try{
    const id=await f.create();await f.bind(id);await f.checkout(id);await f.invoice();
    const refund=async(event,amount)=>f.scalar('select apply_stripe_topup_reversal($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)',[
      event,'charge.refunded',now+1,false,'d'.repeat(64),'invoice:in_invoiceOne','pi_paymentOne','in_invoiceOne','sub_subscriptionOne',true,period,'ch_chargeOne',1500,amount,false,null,null,
    ]);
    assert.equal(await refund('evt_refundPartial',750),'topup_reversed');
    assert.equal(await refund('evt_refundPartial',750),'duplicate_event');
    assert.equal(await f.scalar('select sum(delta) from coin_ledger where user_id=$1',[OWNER]),300);
    assert.equal(await refund('evt_refundFull',1500),'topup_reversed');
    assert.equal(await f.scalar('select sum(delta) from coin_ledger where user_id=$1',[OWNER]),0);
    assert.equal(await f.scalar('select is_pro from billing where user_id=$1',[OWNER]),false);
    await f.scalar('select apply_stripe_subscription_state($1,$2,$3,$4,$5,$6,$7,$8,$9)',[
      'evt_lateActive','customer.subscription.updated',now+2,false,'e'.repeat(64),'sub_subscriptionOne','cus_customerOne',true,period,
    ]);
    assert.equal(await f.scalar('select is_pro from billing where user_id=$1',[OWNER]),false);
  }finally{await f.db.close();}
});
test('account erasure succeeds, clears identity linkage and retains only private receipt subjects for late events',async()=>{
  const f=await fixture();try{
    const id=await f.create();await f.bind(id);await f.checkout(id);
    await f.db.query('delete from auth.users where id=$1',[OWNER]);
    assert.equal(await f.scalar('select count(*) from auth.users where id=$1',[OWNER]),0);
    assert.equal(await f.scalar('select account_id from stripe_customer_owners where user_id=$1',[OWNER]),null);
    assert.equal(await f.scalar('select user_id from stripe_customer_owners where customer_id=$1',['cus_customerOne']),OWNER);
    assert.equal(await f.invoice(),'applied');
    assert.equal(await f.invoice(),'duplicate_event');
    assert.equal(await f.scalar('select count(*) from billing where user_id=$1',[OWNER]),0);
    assert.equal(await f.scalar('select count(*) from credit_ledger where user_id=$1',[OWNER]),0);
    assert.equal(await f.scalar('select count(*) from stripe_billing_grants where user_id=$1',[OWNER]),1);
    assert.deepEqual(await f.scalar('select stripe_web_billing_authority($1)',[OWNER]),{ready:false,customer_id:null});
  }finally{await f.db.close();}
});
test('a checkout completion delivered after account erasure settles privately without resurrecting entitlements',async()=>{
  const f=await fixture();try{
    const id=await f.create();await f.bind(id);
    await f.db.query('delete from auth.users where id=$1',[OWNER]);
    assert.equal(await f.checkout(id),'subscription_registered');
    await f.invoice();
    assert.equal(await f.scalar('select count(*) from billing where user_id=$1',[OWNER]),0);
    assert.equal(await f.scalar('select count(*) from credit_ledger where user_id=$1',[OWNER]),0);
    assert.equal(await f.scalar('select account_id from stripe_subscriptions where user_id=$1',[OWNER]),null);
  }finally{await f.db.close();}
});
