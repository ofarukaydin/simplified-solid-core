export const NOTPENDING = {};
export const STALE = 1;
export const PENDING = 2;
export const READY = 0;

export const equalFn = <T>(a: T, b: T) => a === b;
export const signalOptions = {
  equals: equalFn,
};
