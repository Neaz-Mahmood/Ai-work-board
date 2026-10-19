export type WriteMutex = {
  run<T>(fn: () => Promise<T>): Promise<T>;
};

export function createWriteMutex(): WriteMutex {
  let queue: Promise<unknown> = Promise.resolve();

  return {
    run<T>(fn: () => Promise<T>): Promise<T> {
      let runFn!: () => Promise<void>;
      const next = new Promise<T>((resolve, reject) => {
        runFn = async () => {
          try {
            const res = await fn();
            resolve(res);
          } catch (err) {
            reject(err);
          }
        };
      });

      queue = queue.then(runFn, runFn);

      return next;
    },
  };
}
