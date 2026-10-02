import test,{after,before} from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';

let server,GameOver,LeaderboardResults,ScoreContext,PlayerStanding;
const previousMatchMedia=Object.getOwnPropertyDescriptor(globalThis,'matchMedia');

before(async()=>{
  // SSR exercises the real components without starting requests or robot animation.
  globalThis.matchMedia=()=>({matches:true});
  server=await createServer({
    root:fileURLToPath(new URL('..',import.meta.url)),configFile:false,
    appType:'custom',logLevel:'silent',server:{middlewareMode:true,hmr:false,watch:null},
  });
  ({GameOver,LeaderboardResults,ScoreContext,PlayerStanding}=await server.ssrLoadModule('/src/components/GameResults.jsx'));
});

after(async()=>{
  await server?.close();
  if(previousMatchMedia)Object.defineProperty(globalThis,'matchMedia',previousMatchMedia);
  else delete globalThis.matchMedia;
});

const render=(Component,props)=>renderToStaticMarkup(React.createElement(Component,props));
const entries=Array.from({length:10},(_,i)=>({
  user_id:`player-${i}`,username:`runner-${i}`,score:(10-i)*1234,
  authority:i===0?'verified_receipt':'community',
}));
const rowsFrom=html=>[...html.matchAll(/<li\b[^>]*>[\s\S]*?<\/li>/g)].map(match=>match[0]);

test('compact results retain all ten ranked players for the desktop leaderboard',()=>{
  const html=render(LeaderboardResults,{data:entries,compact:true});
  const rows=rowsFrom(html);
  assert.equal(rows.length,10);
  for(const [index,entry] of entries.entries()){
    assert.ok(rows[index].includes(`@${entry.username}`));
    assert.ok(rows[index].includes(entry.score.toLocaleString()));
  }
  assert.match(html,/aria-label="Top scores"/);
  assert.match(html,/>All time</);
});

test('leaderboard escapes names and highlights only the signed-in player ID',()=>{
  const name='<img src=x onerror=alert(1)>';
  const data=[
    {...entries[0],username:name},
    {...entries[1],username:name},
    entries[2],
  ];
  const rows=rowsFrom(render(LeaderboardResults,{data,viewerId:'player-1'}));
  assert.equal(rows.filter(row=>/class="is-you"/.test(row)).length,1);
  assert.doesNotMatch(rows[0],/class="is-you"|>You</);
  assert.match(rows[1],/class="is-you"/);
  assert.match(rows[1],/>You</);
  assert.match(rows[1],/@&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(rows.join(''),/<img src=x/);
  assert.doesNotMatch(render(LeaderboardResults,{data}),/class="is-you"|>You</);
});

test('verified and community score provenance remain truthful',()=>{
  const mixed=render(LeaderboardResults,{data:entries});
  const rows=rowsFrom(mixed);
  assert.match(rows[0],/>Verified</);
  assert.doesNotMatch(rows[1],/>Verified</);
  assert.match(mixed,/Community scores/);
  const verified=render(LeaderboardResults,{data:[entries[0]]});
  assert.doesNotMatch(verified,/Community scores/);
});

test('leaderboard loading, failure, and empty states are distinct',()=>{
  const loading=render(LeaderboardResults,{data:[],loading:true});
  assert.match(loading,/role="status"/);
  assert.match(loading,/Loading the leaderboard/);
  assert.doesNotMatch(loading,/No scores yet|>Retry</);

  const failed=render(LeaderboardResults,{data:[],error:new Error('offline'),refresh:()=>{}});
  assert.match(failed,/role="alert"/);
  assert.match(failed,/leaderboard couldn’t load/);
  assert.match(failed,/<button\b[^>]*>[\s\S]*?>Retry<[\s\S]*?<\/button>/);
  assert.doesNotMatch(failed,/No scores yet|Loading the leaderboard/);

  const empty=render(LeaderboardResults,{data:[]});
  assert.match(empty,/No scores yet/);
  assert.doesNotMatch(empty,/role="alert"|Loading the leaderboard|>Retry</);
});

test('game over renders zero and large scores with a replay action',()=>{
  for(const score of [0,123456789]){
    const html=render(GameOver,{score,save:{state:'guest'},onReplay:()=>{}});
    assert.match(html,/aria-label="Game over"/);
    assert.ok(html.includes(`<strong>${score.toLocaleString()}</strong>`));
    assert.match(html,/<button\b[^>]*>[\s\S]*?>Play again<[\s\S]*?<\/button>/);
    assert.doesNotMatch(html,/NaN|undefined/);
  }
});

test('game over reports saving, saved, guest, idle, and failed outcomes accurately',()=>{
  const cases=[
    [undefined,'saving','Saving your score…'],
    ['saved','saved','Score saved'],
    ['guest','guest','Sign in before your next round to save your score.'],
    ['idle','idle','Play a round to save your score.'],
    ['failed','failed','Your score couldn’t be saved.'],
  ];
  for(const [state,expectedState,message] of cases){
    const html=render(GameOver,{score:0,save:state?{state}:undefined,onReplay:()=>{}});
    assert.ok(html.includes(`data-state="${expectedState}"`));
    assert.ok(html.includes(message),`Missing ${expectedState} message`);
    if(state!=='saved')assert.doesNotMatch(html,/>Score saved</);
  }
});

test('private playtests never claim that their score was saved publicly',()=>{
  const html=render(GameOver,{score:123,save:{state:'saved'},preview:true,onReplay:()=>{}});
  assert.match(html,/data-state="preview"/);
  assert.match(html,/Private playtest/);
  assert.match(html,/leaderboard opens when this game is published/);
  assert.doesNotMatch(html,/>Score saved</);
});

test('personal best context distinguishes saved improvements, failures and a newer best',()=>{
 const baseline={available:true,hasScore:true,best:800};
 const props={score:950,baseline,personal:{data:{...baseline,best:950}},save:{state:'saved'}};
 assert.match(render(ScoreContext,props),/New personal best · \+150/);
 assert.match(render(ScoreContext,{...props,save:{state:'failed'}}),/not saved/);
 assert.doesNotMatch(render(ScoreContext,{...props,save:{state:'failed'}}),/save pending|New personal best/);
 const newer=render(ScoreContext,{...props,score:800});
 assert.match(newer,/150 points off your best/);assert.doesNotMatch(newer,/Matched your best/);
 assert.doesNotMatch(render(ScoreContext,{...props,baseline:null}),/New personal best|First score saved/);
});

test('server standing is pinned outside the scrolling top ten, including a saved zero',()=>{
 const standing={hasScore:true,rank:420,best:0,authority:'community_unverified'};
 const html=render(LeaderboardResults,{data:entries,viewerId:'outside',standingState:{data:standing}});
 assert.equal(rowsFrom(html).length,10);
 assert.match(html,/aria-label="Your leaderboard position"/);
 assert.ok(html.indexOf('#420')>html.indexOf('</ol>'));
 assert.match(html,/Your best/);assert.match(html,/<strong>0<\/strong>/);
 assert.doesNotMatch(render(PlayerStanding,{loading:true}),/No saved position/);
});

test('score targets never use stale standing data during loading or failure',()=>{
 const props={score:950,personal:{data:{available:true,hasScore:true,best:950}},standing:{data:{hasScore:true,rank:42,nextRank:41,nextScore:1000,pointsToNext:51}}};
 assert.match(render(ScoreContext,props),/51 pts/);
 assert.match(render(ScoreContext,props),/To pass #41 · target 1,001/);
 for(const status of [{loading:true},{error:new Error('offline')}])assert.doesNotMatch(render(ScoreContext,{...props,standing:{...props.standing,...status}}),/Next position|To pass #41/);
});

test('guest sign-in and retry actions are specific to the completed save outcome',()=>{
 const props={score:42,onReplay:()=>{},onSignIn:()=>{},onRetrySave:()=>{}};
 assert.match(render(GameOver,{...props,save:{state:'guest'}}),/>Sign in for next round</);
 assert.match(render(GameOver,{...props,save:{state:'failed'}}),/>Retry saving score</);
 assert.doesNotMatch(render(GameOver,{...props,save:{state:'saving'}}),/>Retry saving score</);
 assert.doesNotMatch(render(GameOver,{...props,save:{state:'failed',retryable:false}}),/>Retry saving score</);
 assert.doesNotMatch(render(GameOver,{...props,save:{state:'guest'},preview:true}),/>Sign in for next round</);
});
