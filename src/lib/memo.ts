// A small in-process cache for the heavy "scan the whole clinics table" queries.
//
// Every directory page used to run them again on its own. With 8 pages rendering at once (the bot's audit, Googlebot, a
// visitor) the database pool was exhausted and pages answered 500. Here:
//   * a value is reused for `ttlMs`;
//   * callers that arrive while it is being loaded share that ONE load (no stampede);
//   * a failed load is never cached: the previous value (even if stale) is served instead, otherwise the error is thrown.

type Entry<R> = { value: R; at: number };

export interface Memoized<A extends unknown[], R> {
  (...args: A): Promise<R>;
  clear: () => void;
}

export function memoizeAsync<A extends unknown[], R>(
  load: (...args: A) => Promise<R>,
  options: { ttlMs: number; key?: (...args: A) => string; now?: () => number },
): Memoized<A, R> {
  const now = options.now ?? Date.now;
  const keyOf = options.key ?? (() => '');
  const values = new Map<string, Entry<R>>();
  const loading = new Map<string, Promise<R>>();

  const memoized = (async (...args: A): Promise<R> => {
    const key = keyOf(...args);
    const cached = values.get(key);
    if (cached && now() - cached.at < options.ttlMs) return cached.value;

    const running = loading.get(key);
    if (running) return running;

    const started = (async () => {
      try {
        const value = await load(...args);
        values.set(key, { value, at: now() });
        return value;
      } catch (error) {
        if (cached) return cached.value; // stale beats an error page
        throw error;
      } finally {
        loading.delete(key);
      }
    })();
    loading.set(key, started);
    return started;
  }) as Memoized<A, R>;

  memoized.clear = () => {
    values.clear();
  };
  return memoized;
}
