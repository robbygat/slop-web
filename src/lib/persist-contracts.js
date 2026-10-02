// Save payloads are untrusted game-authored JSON, never score/reward authority.
export const PERSIST_LIMITS = Object.freeze({run: 256 * 1024, profile: 128 * 1024});
export const PERSIST_SCOPES = Object.freeze(['run', 'profile']);
export const validRevision = value => Number.isSafeInteger(value) && value >= 0;
export const validVersion = value => Number.isSafeInteger(value) && value > 0 && value <= 2147483647;
export const validRequest = value => typeof value === 'string' && value.length > 0 && value.length <= 120;
export const activeRun = row => row?.run_status === 'active' && row.data != null;
export const saveLabel = value => typeof value === 'string' ? value.trim().slice(0, 200) : null;

export function saveData(scope, value) {
  if (!PERSIST_SCOPES.includes(scope) || !value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Save data must be a JSON object.');
  const seen = new Set(); let nodes = 0;
  function inspect(item, depth) {
    if (++nodes > 50000 || depth > 64) throw new Error('Save data is too complex.');
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return;
    if (typeof item === 'number' && Number.isFinite(item)) return;
    if (typeof item !== 'object' || seen.has(item) || (!Array.isArray(item) && ![Object.prototype, null].includes(Object.getPrototypeOf(item)))) throw new Error('Save data must contain only JSON values.');
    seen.add(item);
    for (const key of Object.keys(item)) inspect(item[key], depth + 1);
    seen.delete(item);
  }
  inspect(value, 0);
  const json = JSON.stringify(value);
  const bytes = new TextEncoder().encode(json).byteLength;
  if (bytes > PERSIST_LIMITS[scope]) throw new Error(`${scope} save exceeds its device limit.`);
  return {data: JSON.parse(json), bytes};
}

export function acceptPersistEvent(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) return false;
  if (event.type === 'persist-init') return validVersion(event.version) && Array.isArray(event.scopes) && event.scopes.length === 2 && PERSIST_SCOPES.every(scope => event.scopes.includes(scope));
  if(event.generation!=null&&!validRevision(event.generation))return false;
  if (!validRequest(event.request)) return false;
  try {
    if (event.type === 'persist-write') {
      if (!PERSIST_SCOPES.includes(event.scope) || !validRevision(event.revision) || !validVersion(event.schema_version)) return false;
      saveData(event.scope, event.data);
      return event.scope !== 'run' || event.status == null || event.status === 'active';
    }
    if (!['persist-checkpoint', 'persist-newrun'].includes(event.type) || !validVersion(event.schema_version) || !PERSIST_SCOPES.every(scope => validRevision(event.revision?.[scope]))) return false;
    saveData('profile', event.profile);
    if (event.type === 'persist-newrun') return event.status === 'abandoned';
    if (event.run != null) saveData('run', event.run);
    return event.status == null || ['active', 'finished'].includes(event.status);
  } catch { return false; }
}

export function validSaveRow(row, scope, gameId) {
  if (!row || row.scope !== scope || row.slot !== 0 || typeof row.game_id !== 'string' || (gameId && row.game_id !== gameId) || !validRevision(row.revision) || !validVersion(row.schema_version)) return false;
  if (scope === 'run' && !['active', 'finished', 'abandoned'].includes(row.run_status)) return false;
  try { saveData(scope, row.data); return true; } catch { return false; }
}

export function persistentLineage(game) {
  const value = game?.root_game_slug || game?.slug || game?.id;
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$/.test(value)) throw new Error('This Slop World has no valid save identity.');
  return value;
}

// Accidental/corrupt local changes are detected before a game receives a row.
// This checksum is not a signature and saves do not authorize rewards.
export function saveChecksum(row) {
  const input = JSON.stringify([row.game_id, row.scope, row.revision, row.schema_version, row.data, row.run_status, row.run_label]);
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) hash = Math.imul(hash ^ input.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16);
}
