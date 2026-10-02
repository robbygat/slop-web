import {PERSIST_SCOPES, acceptPersistEvent, activeRun, saveData, saveLabel, validSaveRow, validVersion} from './persist-contracts.js';

const sameData = (a, b) => a && b && a.schema_version === b.schema_version && a.run_status === b.run_status && JSON.stringify(a.data) === JSON.stringify(b.data);
const snapshotContent = row => JSON.stringify(row ? [row.game_id,row.scope,row.schema_version,row.data,row.run_status,row.run_label] : null);
const deadline = (promise, ms = 8000) => {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Cloud saves are unavailable. Your device copy is kept.')), ms); })]).finally(() => clearTimeout(timer));
};

// One captured account + one game lineage. Revisions acknowledged to the SDK
// are device revisions; base_revision is the separate last cloud CAS revision.
export class PersistentSession {
  constructor({store, game, owner, epoch, currentScope, rpc = null, send = () => {}, onState = () => {}, now = Date.now, setTimer = (...args) => globalThis.setTimeout(...args), clearTimer = (...args) => globalThis.clearTimeout(...args)}) {
    Object.assign(this, {store, game, owner, epoch, currentScope, rpc, send, onState, now, setTimer, clearTimer});
    this.rows = {run: null, profile: null}; this.cloudId = null; this.disposed = false; this.loaded = false; this.started = false; this.generation=0;
    this.serial = Promise.resolve(); this.timers = new Map(); this.inflight = new Map(); this.lastAttempt = new Map(); this.receipts = new Map(); this.flushes = new Map(); this.counter = 0;
    this.platformFlushRevision = null;
  }
  current() { const scope = this.currentScope(); return !this.disposed && scope.owner === this.owner && scope.epoch === this.epoch; }
  assertCurrent() { if (!this.current()) throw new Error('Your account changed. Reopen this Slop World to use that account’s saves.'); }
  report(error = null) {
    if (this.current()) this.onState({loaded: this.loaded, started: this.started, run: this.rows.run, conflict: PERSIST_SCOPES.find(scope => this.rows[scope]?.conflict) || null, pending: PERSIST_SCOPES.some(scope => this.rows[scope]?.pending), error});
  }
  enqueue(work) {
    const next = this.serial.then(() => { this.assertCurrent(); return work(); });
    this.serial = next.catch(() => {}); return next;
  }
  async load() {
    return this.enqueue(async () => {
      for (const scope of PERSIST_SCOPES) this.rows[scope] = await this.store.read(this.owner, this.game, scope);
      this.assertCurrent();
      if (PERSIST_SCOPES.some(scope => this.rows[scope]?.corrupt)) throw new Error('This save is damaged and no valid recovery snapshot is available. Nothing has been overwritten.');
      let unavailable = null;
      if (this.rpc) {
        try {
          const response = await deadline(this.rpc('load_game_state', {p_game: this.game}));
          this.assertCurrent();
          if (typeof response?.game_id !== 'string') throw new Error('The cloud save response was not valid.');
          this.cloudId = response.game_id;
          for (const scope of PERSIST_SCOPES) {
            const remote = response[scope];
            if (remote != null && !validSaveRow(remote, scope, this.cloudId)) throw new Error('A cloud save failed validation. Your device copy is kept.');
            await this.reconcile(scope, remote);
          }
        } catch (error) { this.assertCurrent(); unavailable = error; }
      }
      this.assertCurrent(); this.loaded = true; this.report(unavailable);
      for (const scope of PERSIST_SCOPES) this.schedule(scope);
      return this.rows;
    });
  }
  async reconcile(scope, remote) {
    const local = this.rows[scope];
    const conflict=local?.pending && (remote?.revision || 0) !== (local.base_revision || 0) && !sameData(local, remote);
    if (conflict) {
      if (remote) await this.store.archive(this.owner, this.game, scope, remote, 'cloud-conflict');
      this.assertCurrent();
    }
    if (!conflict&&(!remote || (local?.pending && !sameData(local, remote)))) return;
    let raced=false;
    const changed = await this.store.change(this.owner, this.game, [{scope, update: latest => {
      // The cloud request captured `local` before awaiting. A competing tab's
      // later payload, conflict or sync metadata must not be overwritten by it.
      if(JSON.stringify(latest)!==JSON.stringify(local)){raced=true;return null;}
      if(conflict)return {...latest,conflict:remote||{absent:true}};
      // Local SDK counters are distinct from server CAS revisions. Replacing
      // content always retires the old counter, even when it was already much
      // higher than the cloud revision; an older tab must fail its next CAS.
      const previous=latest?.revision||0,contentChanged=!!latest&&snapshotContent(latest)!==snapshotContent(remote);
      const revision=Math.max(remote.revision,previous+(contentChanged?1:0));
      if(!Number.isSafeInteger(revision))throw new Error('This save revision cannot advance safely. Your device copy is kept.');
      return {...remote,revision,base_revision:remote.revision,pending:false,conflict:null};
    }}]);
    this.assertCurrent();
    this.rows[scope] = changed[scope];
    if(raced)throw new Error('The device save changed in another tab while cloud progress loaded. The newer device copy is kept.');
  }
  start() {
    this.assertCurrent();
    if (!this.loaded || PERSIST_SCOPES.some(scope => this.rows[scope]?.conflict)) throw new Error('Choose a save before starting.');
    if (!this.started && !activeRun(this.rows.run)) this.newRunAllowed = true;
    this.started = true; this.report();
  }
  async chooseConflict(scope, choice) {
    return this.enqueue(async () => {
      const local = this.rows[scope], remote = local?.conflict;
      if (!remote || !['device', 'cloud'].includes(choice)) throw new Error('That save choice is no longer available.');
      if (choice === 'cloud' && remote.absent) throw new Error('There is no cloud snapshot to restore.');
      await this.store.archive(this.owner, this.game, scope, local, 'conflict-choice');
      const changed = await this.store.change(this.owner, this.game, [{scope, update: latest => {
        if (latest?.revision !== local.revision) throw new Error('This save changed in another tab. Reopen it before choosing.');
        return choice === 'cloud'
          ? {...remote, revision: Math.max(remote.revision, local.revision) + 1, base_revision: remote.revision, pending: false, conflict: null}
          : {...latest, base_revision: remote.revision || 0, pending: true, conflict: null};
      }}]);
      this.assertCurrent(); this.rows[scope] = changed[scope]; this.report(); this.schedule(scope);
    });
  }
  revisions() { return Object.fromEntries(PERSIST_SCOPES.map(scope => [scope, this.rows[scope]?.revision || 0])); }
  data() {
    return {type: 'persist-data', generation:this.generation, run: activeRun(this.rows.run) ? this.rows.run.data : null, profile: this.rows.profile?.data ?? null, resumed: activeRun(this.rows.run), revision: this.revisions(), schema_version: Object.fromEntries(PERSIST_SCOPES.map(scope => [scope, this.rows[scope]?.schema_version || 0]))};
  }
  async safeRevisionResync(event,error) {
    const proof=this.platformFlushRevision;
    const matches=()=>this.current()&&this.initialized&&proof===this.platformFlushRevision&&
      proof?.generation===this.generation&&(event.generation??0)===this.generation&&
      PERSIST_SCOPES.every(scope=>(this.rows[scope]?.revision||0)===proof.revision[scope]&&!this.rows[scope]?.conflict&&snapshotContent(this.rows[scope])===proof.content[scope]);
    if(event.type!=='persist-write'||error.code!=='stale_revision'||error.deviceConflict||
      !proof||proof.offered[event.scope]!==event.revision||!matches())return false;
    try {
      // One read-only multi-scope IDB transaction: the remembered platform
      // snapshot cannot bless a newer competing-tab row or cloud conflict.
      const durable=await this.store.change(this.owner,this.game,PERSIST_SCOPES.map(scope=>({scope,update:()=>null})));
      return matches()&&PERSIST_SCOPES.every(scope=>(durable[scope]?.revision||0)===proof.revision[scope]&&!durable[scope]?.conflict&&snapshotContent(durable[scope])===proof.content[scope]);
    } catch { return false; }
  }
  async handle(event) {
    if (!acceptPersistEvent(event)) return false;
    try {
      this.assertCurrent();
      if (event.type === 'persist-init') {
        if (!this.started) throw new Error('Wait for the platform save choice before loading.');
        this.initialized = true;
        this.send(this.data()); return true;
      }
      if (!this.started) throw new Error('This save session has not started.');
      if (this.receipts.has(event.request)) { this.send(this.receipts.get(event.request)); return true; }
      await this.enqueue(async () => {
        // A duplicate queued before the first durable write also has one result.
        if (this.receipts.has(event.request)) { this.send(this.receipts.get(event.request)); return; }
        if((event.generation??0)!==this.generation)throw new Error('That save belongs to an earlier run.');
        const scopes = event.type === 'persist-write' ? [event.scope] : PERSIST_SCOPES;
        const terminal = event.type === 'persist-newrun' ? 'abandoned' : event.status === 'finished' ? 'finished' : null;
        const changed = await this.store.change(this.owner, this.game, scopes.map(scope => ({scope, update: old => {
          const offered = event.type === 'persist-write' ? event.revision : event.revision[scope];
          const sessionRevision = this.rows[scope]?.revision || 0;
          // A synchronous flush may precede round-tripping our previous ACK.
          // Only rebase this session's ordered barrier, never another tab's row.
          if (offered > sessionRevision || (event.type==='persist-write'&&offered!==sessionRevision)) {
            throw Object.assign(new Error('The save revision is not current.'),{code:'stale_revision',deviceConflict:(old?.revision||0)!==sessionRevision});
          }
          const expected = event.type === 'persist-write' ? offered : sessionRevision;
          if ((old?.revision || 0) !== expected) throw Object.assign(new Error('The device save changed in another tab.'),{code:'stale_revision',deviceConflict:true});
          if (old?.conflict) throw new Error('Resolve the cloud save conflict before replacing progress.');
          const data = scope === 'run' && (terminal || event.run === null) ? {} : event.type === 'persist-write' ? event.data : event[scope];
          const value = saveData(scope, data);
          // Once ended, late pause/checkpoint messages must not resurrect the run.
          if (scope === 'run' && old && !activeRun(old) && !terminal && event.type !== 'persist-newrun') {
            if (event.run === null) return null;
            if (!this.newRunAllowed) throw new Error('That run has already ended. Start a new run first.');
          }
          return {...old, game_id: this.cloudId || old?.game_id || this.game, scope, slot: 0, schema_version: event.schema_version, revision: expected + 1,
            base_revision: old?.base_revision || 0, data: value.data, data_bytes: value.bytes,
            run_label: scope === 'run' ? saveLabel(event.label ?? data.__label) : null,
            run_status: scope === 'run' ? terminal || (event.run === null ? 'finished' : 'active') : null,
            pending: !!this.rpc, conflict: null, ...(this.owner==='device'?{claimedBy:null}:{}), updated_at: new Date(this.now()).toISOString()};
        }}))).catch(async error=>{
          if(!error.deviceConflict)throw error;
          // Preserve the rejected live branch as recovery history, without
          // replacing the competing tab's committed row or acknowledging it.
          for(const scope of scopes){
            const data=scope==='run'&&(terminal||event.run===null)?{}:event.type==='persist-write'?event.data:event[scope];
            const value=saveData(scope,data),old=this.rows[scope];
            await this.store.archive(this.owner,this.game,scope,{...old,game_id:this.cloudId||old?.game_id||this.game,scope,slot:0,
              schema_version:event.schema_version,revision:(old?.revision||0)+1,data:value.data,data_bytes:value.bytes,
              run_label:scope==='run'?saveLabel(event.label??data.__label):null,
              run_status:scope==='run'?terminal||(event.run===null?'finished':'active'):null},'competing-tab');
          }
          throw Object.assign(new Error('The device save changed. Reopen this Slop World; both copies are kept in recovery history.'),{code:'stale_revision',deviceConflict:true});
        });
        this.assertCurrent(); Object.assign(this.rows, changed);
        if(event.type==='persist-checkpoint'&&this.flushes.has(event.request)){
          this.platformFlushRevision={generation:this.generation,offered:{...event.revision},revision:this.revisions(),content:Object.fromEntries(PERSIST_SCOPES.map(scope=>[scope,snapshotContent(this.rows[scope])]))};
        }
        if (terminal) { this.newRunAllowed = event.type === 'persist-newrun'; if(event.type==='persist-newrun')this.generation++; }
        if(terminal)this.platformFlushRevision=null;
        else if (scopes.includes('run') && activeRun(changed.run)) this.newRunAllowed = false;
        const ack = event.type === 'persist-write'
          ? {type: 'persist-ack', generation:this.generation, request: event.request, scope: event.scope, revision: this.rows[event.scope].revision}
          : {type: 'persist-ack', generation:this.generation, request: event.request, action: event.type === 'persist-newrun' ? 'newrun' : 'checkpoint', revision: this.revisions()};
        this.receipts.set(event.request, ack); if (this.receipts.size > 128) this.receipts.delete(this.receipts.keys().next().value);
        this.send(ack); this.flushes.get(event.request)?.resolve(); this.report();
        for (const scope of scopes) this.schedule(scope);
      });
    } catch (error) {
      const resync=await this.safeRevisionResync(event,error);
      if (this.current()) {
        const metadata=event.type==='persist-init'?{}:{generation:this.generation,revision:this.revisions(),
          ...(event.type==='persist-write'?{scope:event.scope}:{action:event.type==='persist-newrun'?'newrun':'checkpoint'}),
          ...(error.code?{code:error.code}:{}),...(resync?{revision_resync:true}:{})};
        this.send({type: event.type === 'persist-init' ? 'persist-data' : 'persist-ack', request: event.request, error: error.message,...metadata});
        this.flushes.get(event.request)?.reject(error); this.report(error);
      }
    }
    return true;
  }
  async newRun(version) {
    this.assertCurrent();
    const wasStarted = this.started; this.started = true;
    const request = `host-newrun-${++this.counter}`;
    const wait = new Promise((resolve, reject) => this.flushes.set(request, {resolve, reject})).then(()=>null,error=>error);
    await this.handle({type: 'persist-newrun', generation:this.generation, request, revision: this.revisions(), schema_version: validVersion(version) ? version : this.rows.run?.schema_version || this.rows.profile?.schema_version || 1, profile: this.rows.profile?.data || {}, status: 'abandoned'});
    // newrun uses the same local durable barrier as a checkpoint.
    const failure=await wait;
    this.flushes.delete(request); this.started = wasStarted;
    if (failure) throw failure;
    this.newRunAllowed = true;
  }
  flush() {
    if (!this.current() || !this.started || !this.initialized) return Promise.resolve();
    const request = `host-flush-${++this.counter}`;
    let timer;
    const work = new Promise((resolve, reject) => {
      this.flushes.set(request, {resolve, reject});
      timer = this.setTimer(() => reject(new Error('The game did not confirm its last save. Your last durable checkpoint is kept.')), 1500);
      this.send({type: 'persist-flush', request});
    });
    return work.finally(() => { this.clearTimer(timer); this.flushes.delete(request); });
  }
  schedule(scope) {
    if (!this.rpc || !this.current() || !this.rows[scope]?.pending || this.rows[scope]?.conflict || this.timers.has(scope) || this.inflight.has(scope)) return;
    const delay = Math.max(0, 2000 - (this.now() - (this.lastAttempt.get(scope) ?? -Infinity)));
    this.timers.set(scope, this.setTimer(() => { this.timers.delete(scope); void this.sync(scope); }, delay));
  }
  async sync(scope) {
    if (!this.current() || this.inflight.has(scope)) return;
    const row = this.rows[scope]; if (!row?.pending || row.conflict || !this.rpc) return;
    this.lastAttempt.set(scope, this.now()); this.inflight.set(scope, row.revision);
    try {
      const response = await deadline(this.rpc('save_game_state', {p_game: this.game, p_scope: scope, p_slot: 0, p_expected_revision: row.base_revision || 0,
        p_schema_version: row.schema_version, p_data: row.data, p_label: row.run_label, p_status: row.run_status}));
      this.assertCurrent();
      if (response?.throttled) {
        const wait = Math.max(2000, Math.min(60000, Number(response.retry_after_ms) || 2000));
        this.lastAttempt.set(scope, this.now() + wait - 2000);
        this.timers.set(scope, this.setTimer(() => { this.timers.delete(scope); void this.sync(scope); }, wait));
        return;
      }
      const remote = response?.current;
      if (!(response?.conflict && remote === null) && !validSaveRow(remote, scope, this.cloudId || undefined)) throw new Error('The cloud save receipt failed validation. Your device copy is kept.');
      if (response.conflict && !sameData(row, remote)) {
        await this.enqueue(async () => { await this.reconcile(scope, remote); this.report(new Error('Progress changed on another device. Choose the copy to continue.')); });
      } else {
        await this.enqueue(async () => {
          const changed = await this.store.change(this.owner, this.game, [{scope, update: latest => latest ? {...latest,
            game_id: remote.game_id, base_revision: remote.revision, pending: latest.revision !== row.revision, conflict: null} : null}]);
          this.assertCurrent(); this.rows[scope] = changed[scope]; this.report();
        });
      }
    } catch (error) { if (this.current()) this.report(error); }
    finally { this.inflight.delete(scope); }
    // Offline failures wait for online/visible or a later genuine write; no hot retry loop.
    if (this.current() && this.rows[scope]?.revision !== row.revision) this.schedule(scope);
  }
  reconnect() { if (this.current()) for (const scope of PERSIST_SCOPES) this.schedule(scope); }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.platformFlushRevision=null;
    for (const timer of this.timers.values()) this.clearTimer(timer);
    this.timers.clear();
    for (const request of this.flushes.values()) request.reject(new Error('The save session closed.'));
    this.flushes.clear();
  }
}
