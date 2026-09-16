// Serialized into the opaque game iframe before any game code. This function
// must remain self-contained: it never touches the website's browser storage.
export function installGameStorage(target = window) {
  function memoryStorage() {
    const values = new Map();
    const capacity = 512 * 1024; // UTF-16 units: at most 1 MiB per store/frame.
    let used = 0;
    function put(key, value) {
      key = String(key); value = String(value);
      const previous = values.get(key);
      const next = used - (previous === undefined ? 0 : key.length + previous.length) + key.length + value.length;
      if (next > capacity || (!values.has(key) && values.size >= 1024)) {
        throw new DOMException('Game storage is full.', 'QuotaExceededError');
      }
      values.set(key, value); used = next;
    }
    function remove(key) {
      key = String(key);
      if (values.has(key)) { used -= key.length + values.get(key).length; values.delete(key); }
    }
    const methods = Object.create(null);
    Object.defineProperties(methods, {
      getItem: {value: key => values.get(String(key)) ?? null},
      setItem: {value: put},
      removeItem: {value: remove},
      clear: {value: () => { values.clear(); used = 0; }},
      key: {value: index => [...values.keys()][Number(index) >>> 0] ?? null},
      length: {get: () => values.size},
    });
    // Older games also use storage.best = value and Object.keys(storage).
    return new Proxy(Object.create(null), {
      get: (_, key) => key === Symbol.toStringTag ? 'Storage' : Object.hasOwn(methods, key) ? methods[key] : values.get(String(key)),
      set: (_, key, value) => { put(key, value); return true; },
      deleteProperty: (_, key) => { remove(key); return true; },
      has: (_, key) => Object.hasOwn(methods, key) || values.has(String(key)),
      ownKeys: () => [...values.keys()],
      getOwnPropertyDescriptor: (_, key) => values.has(String(key)) ? {value: values.get(String(key)), enumerable: true, configurable: true, writable: true} : undefined,
    });
  }
  for (const name of ['localStorage', 'sessionStorage']) {
    Object.defineProperty(target, name, {value: memoryStorage(), configurable: false, writable: false});
  }
}
