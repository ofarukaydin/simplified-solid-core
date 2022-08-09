import { PENDING, STALE, NOTPENDING, READY } from "./constants";
import { Derivation } from "./derivation";
import { Signal } from "./signal";
import { GlobalState } from "./state";

export class Computation<T> {
  fn: (...args: any) => any;
  state: typeof PENDING | typeof STALE | typeof NOTPENDING | null;
  updatedAt: number | null;
  owned: Computation<T>[] | null;
  sources: (Signal<T> | Derivation<T>)[] | null;
  sourceSlots: number[] | null;
  cleanups: ((...args: any) => any)[] | null;
  value: T;
  owner: Computation<T> | Derivation<T> | null;
  context: null;
  pure: boolean;
  user: boolean | null;

  static createUnowned() {
    const unowned = new Computation(() => {}, null, false, null, true);
    unowned.owned = null;
    unowned.cleanups = null;
    unowned.context = null;
    unowned.owner = null;

    return unowned;
  }

  static createOwned(owner: Computation<null> | null) {
    const unowned = Computation.createUnowned();
    unowned.owner = owner;

    return unowned;
  }

  constructor(
    fn: (...args: any) => any,
    init: T,
    pure: boolean,
    state: number | null = STALE,
    createUnowned = false
  ) {
    this.fn = fn;
    this.state = state;
    this.updatedAt = null;
    this.owned = null;
    this.sources = null;
    this.sourceSlots = null;
    this.cleanups = null;
    this.value = init;
    this.owner = GlobalState.owner;
    this.context = null;
    this.user = null;
    this.pure = pure;

    if (!createUnowned && GlobalState.owner !== UNOWNED) {
      if (!GlobalState.owner?.owned) GlobalState.owner!.owned = [this];
      else GlobalState.owner.owned.push(this);
    }
  }

  updateComputation() {
    if (!this.fn) return;

    this.cleanNode();

    const owner = GlobalState.owner;
    const listener = GlobalState.listener;
    const time = GlobalState.execCount;

    GlobalState.listener = this;
    GlobalState.owner = this;

    this.runComputation(time);

    GlobalState.listener = listener;
    GlobalState.owner = owner;
  }

  runComputation(time: number) {
    const nextValue = this.fn(this.value);

    if (!this.updatedAt || this.updatedAt <= time) {
      this.value = nextValue;
    }

    this.updatedAt = time;
  }

  runTop() {
    let node: Computation<T> = this;
    if (node.state === 0) return;
    if (node.state === PENDING) return this.lookUpstream();

    const ancestors = [node];

    while (
      (node = node.owner as Computation<T>) &&
      (!node.updatedAt || node.updatedAt < GlobalState.execCount)
    ) {
      if (node.state) ancestors.push(node);
    }

    for (let i = ancestors.length - 1; i >= 0; i--) {
      node = ancestors[i];

      if (node.state == STALE) {
        this.updateComputation();
      } else if (node.state === PENDING) {
        const updates = GlobalState.updates;
        GlobalState.updates = null;
        this.lookUpstream();
        GlobalState.updates = updates;
      }
    }
  }

  lookUpstream() {
    this.state = READY;

    this.sources!.forEach((source) => {
      if (source instanceof Derivation && source.sources) {
        if (source.state === STALE) source.runTop();
        else if (source.state === PENDING) source.lookUpstream();
      }
    });
  }

  markPending() {
    this.state = PENDING;

    if (this.pure) GlobalState.updates!.push(this);
    else GlobalState.effects!.push(this);
  }

  markStale() {
    this.state = STALE;

    if (this.pure) GlobalState.updates!.push(this);
    else GlobalState.effects!.push(this);
  }

  cleanNode() {
    if (this.sources) {
      while (this.sources.length) {
        const source = this.sources.pop();
        const index = this.sourceSlots!.pop() as number;
        const obs = source?.observers;

        if (obs?.length) {
          const n = obs.pop() as Computation<any> | Derivation<any>;
          const s = source!.observerSlots?.pop() as number;

          if (index < obs.length) {
            n.sourceSlots![s] = index;
            obs[index] = n;
            source!.observerSlots![index] = s;
          }
        }
      }
    }

    if (this.owned) {
      this.owned.forEach((ownedNode) => ownedNode.cleanNode());
      this.owned = null;
    }

    if (this.cleanups) {
      this.cleanups.forEach((cleanup) => cleanup());
      this.cleanups = null;
    }

    this.state = READY;
    this.context = null;
  }
}

export const UNOWNED = Computation.createUnowned();
