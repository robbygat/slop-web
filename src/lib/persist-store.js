import {saveChecksum, validSaveRow} from './persist-contracts.js';

const keyFor = (owner, game, scope) => JSON.stringify([owner, game, scope, 0]);
const valid = value => value && validSaveRow(value, value.scope) && value.checksum === saveChecksum(value);

export class PersistentStore {
  constructor({indexedDB = globalThis.indexedDB, name = 'slop-persistent-v1', onChange = () => {}} = {}) {
    this.indexedDB = indexedDB; this.name = name; this.onChange = onChange; this.opening = null;
  }
  async open() {
    if (!this.opening) this.opening = new Promise((resolve, reject) => {
      if (!this.indexedDB) return reject(new Error('Durable browser storage is unavailable. Enable website storage before playing this Slop World.'));
      const request = this.indexedDB.open(this.name, 1);
      let retired = false;
      request.onupgradeneeded = () => {
        request.result.createObjectStore('saves', {keyPath: 'key'});
        const history = request.result.createObjectStore('history', {keyPath: 'id', autoIncrement: true});
        history.createIndex('key', 'key');
      };
      request.onerror = () => { retired = true; reject(request.error); };
      request.onblocked = () => { retired = true; reject(new Error('Close older Slop tabs so save storage can open.')); };
      request.onsuccess = () => {
        const db = request.result;
        if(retired){db.close();return;}
        db.onversionchange = () => { db.close(); this.opening = null; };
        resolve(db);
      };
    }).catch(error => { this.opening = null; throw error; });
    return this.opening;
  }
  async transaction(work, notify = true) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['saves', 'history'], 'readwrite');
      let result, error;
      tx.oncomplete = () => { try { if (notify) this.onChange(); } catch {} resolve(result); };
      tx.onabort = tx.onerror = () => reject(error || tx.error || new Error('The save was not committed to device storage.'));
      try { work(tx.objectStore('saves'), tx.objectStore('history'), value => { result = value; }, cause => { error = cause; tx.abort(); }); }
      catch (cause) { error = cause; tx.abort(); }
    });
  }
  async read(owner, game, scope) {
    const key = keyFor(owner, game, scope);
    return this.transaction((saves, history, done) => {
      const read = saves.get(key);
      read.onsuccess = () => {
        if (!read.result || valid(read.result)) return done(read.result || null);
        const previous = history.index('key').getAll(key);
        previous.onsuccess = () => {
          const recovered = previous.result.reverse().map(item => item.row).find(valid);
          if (!recovered) return done({corrupt: true, key});
          const row = {...recovered, recovered: true};
          saves.put(row); done(row);
        };
      };
    }, false);
  }
  // Multi-scope checkpoints and tombstones commit in one IndexedDB transaction.
  async change(owner, game, updates) {
    return this.transaction((saves, history, done, fail) => {
      const rows = {}; let remaining = updates.length;
      for (const {scope, update} of updates) {
        const key = keyFor(owner, game, scope), request = saves.get(key);
        request.onsuccess = () => {
          try {
            const old = request.result;
            if (old && !valid(old)) throw new Error('Stored save is damaged. Recover it before writing.');
            const candidate = update(old || null);
            if (!candidate) { rows[scope] = old || null; if (--remaining === 0) done(rows); return; }
            const row = {...candidate, owner, key};
            if (!validSaveRow(row, scope)) throw new Error('Invalid save row.');
            row.checksum = saveChecksum(row);
            if (old) history.add({key, row: old, reason: 'previous', savedAt: Date.now()});
            saves.put(row); rows[scope] = row;
            const previous = history.index('key').getAll(key);
            previous.onsuccess = () => {
              for (const item of previous.result.slice(0, -5)) history.delete(item.id);
              if (--remaining === 0) done(rows);
            };
          } catch (error) { fail(error); }
        };
      }
      if (!remaining) done(rows);
    });
  }
  async archive(owner, game, scope, row, reason = 'conflict') {
    if (!validSaveRow(row, scope)) return;
    const key = keyFor(owner, game, scope);
    return this.transaction((_saves, history, done) => {
      history.add({key, row: {...row, key, owner, checksum: saveChecksum(row)}, reason, savedAt: Date.now()});
      const previous = history.index('key').getAll(key);
      previous.onsuccess = () => { for (const item of previous.result.slice(0, -5)) history.delete(item.id); done(); };
    });
  }
  async list(owner) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const request = db.transaction('saves').objectStore('saves').getAll();
      request.onsuccess = () => resolve(request.result.filter(row => row.owner === owner && valid(row)));
      request.onerror = () => reject(request.error);
    });
  }
  async close() { const db = await this.opening; db?.close(); this.opening = null; }
}
