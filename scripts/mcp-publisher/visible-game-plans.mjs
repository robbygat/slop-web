// Pure choices from bounded visible snapshots. These functions never receive
// a game object, DOM, debug API or access to live gameplay state.
export function coastLane(s){const LANES=[-5.1,-1.7,1.7,5.1];
  function blockedNow(s, L) {
    const lx = LANES[L];
    for (const c of s.cars) {
      const xs = [c.x]; if (c.lc) xs.push(LANES[c.to]);
      for (const x of xs) if (Math.abs(x - lx) < (c.w + 2) / 2 + 0.25 && Math.abs(c.z) < (c.len + 4.75) / 2 + 3.2) return true;
    }
    return false;
  }
  function clearance(s, L) {
    const lx = LANES[L]; let best = 400;
    for (const c of s.cars) {
      const xs = [c.x]; if (c.lc) xs.push(LANES[c.to]);
      for (const x of xs) {
        if (Math.abs(x - lx) >= (c.w + 2) / 2 + 0.3) continue;
        const rear = c.z + c.len / 2; // positive = beside/behind us
        if (rear > -2.4 && c.z - c.len / 2 > 2.4) continue; // already passed
        const d = -(rear) - 2.4;
        const rel = Math.max(4, s.v - c.vt);
        best = Math.min(best, d / rel * 30); // time-to-reach scaled back to meters @30m/s
      }
    }
    return best;
  }
  function plan(s) {
    const cur = LANES.reduce((bi, x, i) => Math.abs(x - s.x) < Math.abs(LANES[bi] - s.x) ? i : bi, 0);
    let bestL = cur, bestV = -1e9;
    for (let L = 0; L < 4; L++) {
      // path must be open right now
      let ok = true; const a = Math.min(cur, L), b = Math.max(cur, L);
      for (let k = a; k <= b; k++) if (k !== cur && blockedNow(s, k)) ok = false;
      if (!ok) continue;
      const v = clearance(s, L) + (L === cur ? 12 : 0) - Math.abs(L - cur) * 3;
      if (v > bestV) { bestV = v; bestL = L; }
    }
    return { cur, lane: bestL, clear: bestV };
  }
return LANES[plan(s).lane];}
export function roofTarget(g){const XMAX=3;
  function sawX(w, dsT) { // predicted saw x when we reach it
    if (!w.amp) return w.x;
    const dt = w.ds / 10;
    return w.x0 + w.amp * Math.sin((w.t + dt) * w.freq + w.ph);
  }
  function score(g, x, suicide) {
    let v = -Math.abs(x - g.x) * 0.05;
    const L = g.L, R = g.R;
    // gap window
    const gap = g.gaps.find((q) => q.rs1 > 0 + g.s && q.rs0 - g.s < 16);
    if (gap) {
      const cxs = (q) => gap.a + (gap.b - gap.a) * Math.min(1, Math.max(0, (q - gap.rs0) / (gap.rs1 - gap.rs0)));
      const s1 = Math.max(g.s, gap.s0), s2 = Math.min(gap.s1, s1 + g.v * 0.5);
      const lo = Math.max(cxs(s1), cxs(s2)) + gap.hw - R, hi = Math.min(cxs(s1), cxs(s2)) - gap.hw + L;
      if (suicide) v += Math.abs(x - (lo + hi) / 2) * 10;
      else if (x < lo + 0.25 || x > hi - 0.25) v -= 200 + 50 * Math.min(Math.abs(x - lo), Math.abs(x - hi));
      else v -= Math.abs(x - (lo + hi) / 2) * 2;
    }
    for (const w of g.saws) {
      if (w.ds > 13) continue;
      const sx = sawX(w);
      const d = Math.abs(sx - x);
      const C = 0.59;
      if (d < 0.34 + C * 0.8 + (w.amp ? 0.4 : 0.15)) { v += suicide ? 2 : -1000; continue; }
      const inL = sx + C, inR = sx - C;
      if (sx < x && inL > x - L) v -= (suicide ? 0 : 12) * (inL - (x - L)) + 4;
      if (sx > x && inR < x + R) v -= (suicide ? 0 : 12) * (x + R - inR) + 4;
    }
    if (!suicide) {
      for (const p of g.pieces) if (p.ds < 14 && Math.abs(p.x - x) < 0.5) v += 3 * (1 - p.ds / 16);
      for (const q of g.gemsAhead) if (q.ds < 10 && Math.abs(q.x - x) < 0.5) v += 1.2 * (1 - q.ds / 12);
    }
    return v;
  }
  function pick(g, suicide) {
    let best = g.x, bv = -1e9;
    for (let x = -XMAX; x <= XMAX + 1e-6; x += 0.1) { const v = score(g, x, suicide); if (v > bv) { bv = v; best = x; } }
    return best;
  }
return pick(g,false);}
export function crowdTarget(g){const OPS={'+':(n,v)=>n+v,x:(n,v)=>n*v,'-':(n,v)=>Math.max(0,n-v),'/':(n,v)=>Math.floor(n/v)};
  function plan(g, suicide) {
    const reach = 1.4 + Math.sqrt(Math.max(1, g.count)) * 0.23;
    for (const r of g.rows) {
      if (r.type === "pit") {
        if (g.cd > r.d1 + reach) continue;
        if (suicide) return (r.x0 + r.x1) / 2;
        if (r.x0 < -3) return 2.2;
        if (r.x1 > 3) return -2.2;
        return g.mx >= 0 ? 3.0 : -3.0;
      }
      if (r.d < g.cd - 0.5) continue;
      if (r.type === "gate") {
        const a = OPS[r.L.k](g.count, r.L.v), b = OPS[r.R.k](g.count, r.R.v);
        const left = suicide ? a <= b : a >= b;
        return left ? -2 : 2;
      }
      if (r.type === "wall") {
        let best = 0, bw = -1;
        const edges = [-g.HW, ...r.blocks.flat(), g.HW];
        for (let i = 0; i + 1 < edges.length; i += 2) { const w = edges[i + 1] - edges[i]; if (w > bw) { bw = w; best = (edges[i] + edges[i + 1]) / 2; } }
        return best;
      }
      if (r.type === "saw") {
        const tArr = Math.max(0, (r.d - g.cd) / Math.max(1, g.speed));
        const bx = r.amp * Math.sin(r.w * (g.T + tArr) + r.ph);
        if (suicide) return bx;
        return bx > 0 ? -2.6 : 2.6;
      }
      if (r.type === "sweep") return suicide ? 0 : (g.mx >= 0 ? 3.2 : -3.2);
      if (r.type === "enemy") return Math.max(-2, Math.min(2, r.x));
    }
    return 0;
  }

return plan(g,false);}

export function flappyTap(g){const {R,G,F,RIM}=g;const LAT=.03,DT=1/120,SLOT=.05;
  function sim(g, h, flaps) {
    let x = g.x, y = g.y, vx = g.vx, vy = g.vy, t = 0, fi = 0, lastLy = null;
    const ca = Math.cos(h.ang), sa = Math.sin(h.ang), safe = Math.max(8, h.half - R - RIM - 12);
    for (let n = 0; n < 400; n++) {
      if (fi < flaps.length && t >= flaps[fi]) { vy = -F; fi++; }
      if (vx < g.vxNow) vx = Math.min(g.vxNow, vx + 700 * DT);
      vy += G * DT; x += vx * DT; y += vy * DT; t += DT;
      if (y + R > g.floor - 4 || y - R < 6) return { ok: false, cost: 1e6 - t * 1000 };
      const hy = h.baseY + h.amp * Math.sin((g.t + t) * h.freq + h.ph);
      const dx = x - h.x, dy = y - hy, lx = dx * ca + dy * sa, ly = -dx * sa + dy * ca;
      if (lastLy !== null && lastLy < 0 && ly >= 0) {
        if (Math.abs(lx) < safe) return { ok: true, cost: Math.abs(lx) + flaps.length * 2 + Math.max(0, y - (g.floor - 250)) * 0.05 };
        if (Math.abs(lx) < h.half) return { ok: false, cost: 5000 + Math.abs(lx) };
      }
      lastLy = ly;
      if (x - R > h.x + h.half + RIM + 6) return { ok: false, cost: 1e4 + Math.abs(y - hy) };
    }
    return { ok: false, cost: 1e5 };
  }
  function decide(g) {
    const h = g.hoops[0]; if (!h) return false;
    const N = Math.min(24, Math.ceil(((h.x - g.x) / Math.max(120, g.vx) + 0.4) / SLOT));
    let best = { cost: Infinity, now: false };
    const consider = (fl) => { const r = sim(g, h, fl); if (r.cost < best.cost) best = { cost: r.cost, now: fl.length > 0 && fl[0] === LAT, ok: r.ok }; };
    const at = (i) => LAT + i * SLOT;
    consider([]);
    for (let i = 0; i <= N; i++) {
      consider([at(i)]);
      for (let j = i + 2; j <= N; j += (N > 16 ? 2 : 1)) {
        consider([at(i), at(j)]);
        for (let l = j + 3; l <= N; l += 2) consider([at(i), at(j), at(l)]);
      }
    }
    return best.now;
  }

return decide(g);}

export function rollerDirection(g){const DX=[0,1,0,-1],DY=[-1,0,1,0];
  function slide(grid, gw, i, d) { const s = DX[d] + DY[d] * gw; let L = 0; while (i+s*(L+1)>=0 && i+s*(L+1)<grid.length && grid[i + s * (L + 1)] !== "#") L++; return L; }
  // greedy: first move of the shortest slide sequence ending in a move that paints a new tile
  function plan(grid, gw, pos) {
    const prev = new Map([[pos, null]]), q = [pos];
    for (let h = 0; h < q.length; h++) {
      const i = q[h];
      for (let d = 0; d < 4; d++) {
        const L = slide(grid, gw, i, d); if (!L) continue;
        const s = DX[d] + DY[d] * gw;
        let fresh = false; for (let k = 1; k <= L; k++) if (grid[i + s * k] === ".") { fresh = true; break; }
        const j = i + s * L;
        if (fresh) { // walk back to the first move
          let at = i, dir = d;
          while (prev.get(at)) { const p = prev.get(at); dir = p.d; at = p.from; }
          return i === pos ? d : dir;
        }
        if (!prev.has(j)) { prev.set(j, { from: i, d }); q.push(j); }
      }
    }
    return -1;
  }
return plan(g.grid,g.gw,g.pos);}


// Steer a running mob using only visible recruits, wall openings and hazard
// motion. Keep the full tail through a gap before switching to a new cluster.
export function joinTarget(g) {
 const lim=g.HW-.5,clamp=x=>Math.max(-lim,Math.min(lim,x));
 if(g.phase==='boss'&&g.boss?.phase==='wind'){
  const need=g.boss.Rs+g.R+.35;
  if(Math.abs(g.mx-g.boss.tx)>=need)return g.mx;
  const options=[g.boss.tx-need,g.boss.tx+need].filter(x=>Math.abs(x)<=lim);
  return options.length?options.sort((a,b)=>Math.abs(a-g.mx)-Math.abs(b-g.mx))[0]:g.boss.tx>0?-lim:lim;
 }
 if(g.phase!=='run')return g.mx;
 const imminent=g.hazards.filter(h=>h.d>=g.md-g.back-.5&&h.d-g.md<=10+g.front).sort((a,b)=>a.d-b.d);
 if(g.rage<=0)for(const h of imminent){
  if(h.type==='wall'){
   const gaps=h.gaps.slice().sort((a,b)=>(b[1]-b[0])-(a[1]-a[0])||Math.abs((a[0]+a[1])/2-g.mx)-Math.abs((b[0]+b[1])/2-g.mx));
   return gaps.length?clamp((gaps[0][0]+gaps[0][1])/2):g.mx;
  }
  if(h.type==='saw'){
   const eta=Math.max(0,(h.d-g.md)/Math.max(1,g.speed)),x=h.amp*Math.sin(h.w*(g.T+eta)+h.ph);
   return x>0?-lim:lim;
  }
  if(h.type==='roller')return clamp(h.x0<=-g.HW+.01?(h.x1+g.HW)/2:(h.x0-g.HW)/2);
  if(h.type==='sweeper')return g.mx>0?lim:-lim;
 }
 const nearby=g.idles.filter(i=>i.d>g.md+g.front*.25&&i.d<g.md+18).sort((a,b)=>a.d-b.d);
 if(!nearby.length)return g.mx;
 const first=nearby[0],cluster=nearby.filter(i=>i.d<=first.d+2.5),gold=cluster.find(i=>i.gold);
 return clamp(gold?gold.x:cluster.reduce((x,i)=>x+i.x,0)/cluster.length);
}


export function petalDelta(g) {
 const [hx,hy]=g.hero,candidates=[[0,0]];
 for(let a=0;a<16;a++)for(const r of [3,6])candidates.push([Math.cos(a*Math.PI/8)*r,Math.sin(a*Math.PI/8)*r]);
 let best=[0,0],bestCost=Infinity;
 for(const [dx,dy] of candidates){
  const x=Math.max(g.left,Math.min(g.right,hx+dx)),y=Math.max(g.top,Math.min(g.bottom,hy+dy));
  let cost=Math.hypot(x-g.W*.5,(y-g.H*.6)*.8)*.03+Math.hypot(dx,dy)*.004;
  for(const b of g.bullets){
   if(Math.abs(b[0]-x)>260||Math.abs(b[1]-y)>260)continue;
   for(let t=0;t<=.64;t+=.08){
    const px=b[0]+b[2]*t+.5*b[5]*t*t,py=b[1]+b[3]*t+.5*b[6]*t*t,d=Math.hypot(px-x,py-y)-b[4]-g.heroR;
    if(d<5)cost+=(4000+(5-d)*1200)*(1-t);else if(d<25)cost+=(25-d)*(1-t)*2.2;
   }
  }
  if(cost<bestCost){bestCost=cost;best=[x-hx,y-hy];}
 }
 return best;
}

export function puffPlan(g) {
 const p=g.puff,ahead=g.enemies.filter(e=>e.x>p.x-p.r*.3),spikes=ahead.filter(e=>e.spiky),food=ahead.filter(e=>!e.spiky);
 const lane=e=>Math.abs(e.y-p.y)<p.r+e.r+26;
 const threat=spikes.filter(e=>lane(e)&&e.x-p.x<g.cone.L+120).sort((a,b)=>a.x-b.x)[0];
 if(g.enemies.some(e=>e.spiky&&e.sucked))return {release:true,y:p.y};
 if(g.belly>0&&(threat||g.boss?.state==='fight'&&Math.abs(g.boss.y-p.y)<65||g.belly>=3||g.belly>=2&&food.some(e=>lane(e))))return {release:true,y:p.y};
 if(threat&&!g.belly){const up=threat.y>=p.y;return {release:false,y:up?Math.max(g.ceil+p.r,p.y-55):Math.min(g.floor-p.r,p.y+55)};}
 const target=g.boss&&g.belly>=2?g.boss:food.filter(e=>!spikes.some(k=>Math.abs(k.y-e.y)<k.r+p.r&&k.x<e.x&&k.x>p.x)).sort((a,b)=>a.x-b.x)[0];
 return {release:false,y:target?Math.max(g.ceil+p.r,Math.min(g.floor-p.r,target.y)):(g.ceil+g.floor)*.5};
}
