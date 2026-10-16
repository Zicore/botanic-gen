// Runs generation in a worker. Latest request wins: while a job runs, only the newest
// pending document is kept and dispatched when the worker frees up.

export function createGenerator(onResult, onError) {
  const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  let busy = false;
  let pending = null;
  let nextId = 1;

  const dispatch = (doc) => {
    busy = true;
    worker.postMessage({ id: nextId++, doc });
  };

  worker.onerror = (e) => {
    busy = false;
    onError?.(`Generator worker failed: ${e.message || 'could not load'}`);
  };

  worker.onmessage = (e) => {
    busy = false;
    if (e.data.error) onError?.(e.data.error);
    else if (!pending) onResult(e.data.result);
    if (pending) {
      const doc = pending;
      pending = null;
      dispatch(doc);
    }
  };

  return {
    request(doc) {
      if (busy) pending = doc;
      else dispatch(doc);
    },
    /** One-off generation (e.g. export at a different quality), independent of the live stream. */
    once(doc) {
      return new Promise((resolve, reject) => {
        const w = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
        w.onmessage = (e) => {
          w.terminate();
          if (e.data.error) reject(new Error(e.data.error));
          else resolve(e.data.result);
        };
        w.postMessage({ id: 0, doc });
      });
    },
    dispose() {
      worker.terminate();
    },
  };
}
