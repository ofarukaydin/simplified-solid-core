import { Computation } from "./computation";
import { STALE, NOTPENDING, signalOptions } from "./constants";
import { Derivation } from "./derivation";
import { Signal } from "./signal";
import { GlobalState } from "./state";

export function createMemo<T>(fn: () => T, value?: T) {
  const derivation = new Derivation(fn, value, {});
  return derivation.getSignal() as () => T;
}

export function createComputed<T>(fn: () => any, value?: T) {
  const computation = new Computation(fn, value, true, STALE);
  computation.updateComputation();
}

export function untrack(fn: () => any) {
  let result;
  let listener = GlobalState.listener;
  GlobalState.listener = null;
  result = fn();
  GlobalState.listener = listener;

  return result;
}

export function runUpdates(fn: (...args: any) => any, init: boolean) {
  if (GlobalState.updates) return fn();
  let wait = false;
  if (!init) GlobalState.updates = [];
  if (GlobalState.effects) wait = true;
  else GlobalState.effects = [];
  GlobalState.execCount++;

  try {
    fn();
  } finally {
    completeUpdates(wait);
  }
}

function completeUpdates(wait: boolean) {
  if (GlobalState.updates) {
    runQueue(GlobalState.updates);
    GlobalState.updates = null;
  }
  if (wait) return;
  if (GlobalState.effects?.length) {
    batch(() => {
      GlobalState.runEffects(GlobalState.effects || []);
    });
  }
  GlobalState.effects = null;
}

export function runQueue(queue: (Computation<any> | Derivation<any>)[] | null) {
  queue?.forEach((node) => node.runTop());
}

export function batch(fn: () => any) {
  if (GlobalState.pending) return fn();
  let result;

  GlobalState.pending = [];
  const q: any[] = [];

  try {
    result = fn();
  } finally {
    GlobalState.pending = null;
  }

  runUpdates(() => {
    q.forEach((data: Signal<any>) => {
      if (data.pending !== NOTPENDING) {
        const pending = data.pending;
        data.pending = NOTPENDING;
        data.writeSignal(pending);
      }
    });
  }, false);

  return result;
}

export function createRoot(fn: (...args: any[]) => any, detachedOwner?: Computation<any>) {
  if (detachedOwner) {
    GlobalState.owner = detachedOwner;
  }

  const listener = GlobalState.listener;
  const owner = GlobalState.owner;
  const root =
    fn.length === 0 ? Computation.createUnowned() : Computation.createOwned(getComputation(owner));

  GlobalState.owner = root;
  GlobalState.listener = null;
  let result;
  try {
    runUpdates(() => {
      result = fn(() => root.cleanNode());
    }, true);
  } finally {
    GlobalState.listener = listener;
    GlobalState.owner = owner;
  }

  return result;
}

export function createSignal<T>(value: T, userOptions?: Record<string, any>) {
  const options = { ...signalOptions, ...userOptions };
  const signal = new Signal(value, options);

  return signal.getTuple();
}

export function createEffect<T>(cb: (val?: T) => T, init?: T): void {
  GlobalState.runEffects = runUserEffects;

  const effect = new Computation(cb, init, false, STALE);

  effect.user = true;

  GlobalState.effects ? GlobalState.effects.push(effect) : effect.updateComputation();
}

export function createRenderEffect<T>(fn: () => any, value?: T) {
  const effect = new Computation(fn, value, false, STALE);
  effect.updateComputation();
}

const getComputation = <T>(signal: Computation<T> | Derivation<T> | null) =>
  signal instanceof Derivation ? (signal.computation as Computation<T>) : signal;

function runUserEffects(queue: (Computation<any> | Derivation<any>)[]) {
  const userEffectsCount = runRenderEffects(queue);

  const resume = queue.length;

  for (let i = 0; i < userEffectsCount; i++) queue[i].runTop();
  for (let i = resume; i < queue.length; i++) queue[i].runTop();
}

export function runRenderEffects(queue: (Computation<any> | Derivation<any>)[]) {
  let userEffectsCount = 0;

  for (const effect of queue) {
    if (!effect.user) effect.runTop();
    else {
      queue[userEffectsCount] = effect;
      userEffectsCount++;
    }
  }

  return userEffectsCount;
}
