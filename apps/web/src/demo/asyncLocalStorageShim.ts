// Stand-in for node:async_hooks in the demo build. It keeps one module-level
// store, which is only correct because demoFetch runs one request at a time,
// so at most one transaction is ever in flight.
export class AsyncLocalStorage<T> {
  private store: T | undefined;

  getStore(): T | undefined {
    return this.store;
  }

  async run<R>(store: T, fn: () => Promise<R>): Promise<R> {
    const prev = this.store;
    this.store = store;
    try {
      return await fn();
    } finally {
      this.store = prev;
    }
  }
}
