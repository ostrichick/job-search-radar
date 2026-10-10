// Caches live only for one synchronous render. Nothing survives a feed, filter,
// workflow-state or wall-clock change between renders.
export function createRenderCache() {
  let current = null;
  return {
    begin() { current = new Map(); },
    end() { current = null; },
    wrap(name, calculate, keyFor = (value) => value) {
      return (...args) => {
        if (!current) return calculate(...args);
        if (!current.has(name)) current.set(name, new Map());
        const cache = current.get(name), key = keyFor(...args);
        if (!cache.has(key)) cache.set(key, calculate(...args));
        return cache.get(key);
      };
    }
  };
}
