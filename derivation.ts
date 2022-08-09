import { Computation } from "./computation";
import { signalOptions, NOTPENDING, STALE } from "./constants";
import { Signal } from "./signal";
import { GlobalState } from "./state";

export class Derivation<T> extends Signal<T> {
  computation: Computation<T>;

  constructor(fn: (...args: any) => any, value: T, userOptions: Record<string, any>) {
    super(value, { ...signalOptions, ...userOptions });
    this.computation = new Computation(fn, value, true, 0);
    this.pending = NOTPENDING;
    this.updateComputation();
  }

  get state() {
    return this.computation.state;
  }

  set state(state) {
    this.computation.state = state;
  }

  get sources() {
    return this.computation.sources;
  }

  set sources(source) {
    this.computation.sources = source;
  }

  get sourceSlots() {
    return this.computation.sourceSlots;
  }

  set sourceSlots(sourceSlots) {
    this.computation.sourceSlots = sourceSlots;
  }

  set owner(owner: Derivation<T> | Computation<T> | null) {
    this.computation.owner = owner;
  }

  get owner() {
    return this.computation.owner;
  }

  set owned(owned: Computation<T>[] | null) {
    this.computation.owned = owned;
  }

  get owned() {
    return this.computation.owned;
  }

  get pure() {
    return this.computation.pure;
  }

  get fn() {
    return this.computation.fn;
  }

  set updatedAt(updatedAt) {
    this.computation.updatedAt = updatedAt;
  }

  get updatedAt() {
    return this.computation.updatedAt;
  }

  get user() {
    return this.computation.user;
  }

  cleanNode() {
    this.computation.cleanNode.bind(this)();
  }

  runTop() {
    this.computation.runTop.bind(this)();
  }

  lookUpstream() {
    this.computation.lookUpstream.bind(this)();
  }

  markPending() {
    this.computation.markPending.bind(this)();
  }

  markStale() {
    this.computation.markStale.bind(this)();
  }

  updateComputation() {
    this.computation.updateComputation.bind(this)();
  }

  getSignal() {
    return this.readSignal.bind(this);
  }

  readSignal(): T {
    if (this.computation.state && this.computation.sources) {
      const updates = GlobalState.updates;
      GlobalState.updates = null;

      if (this.computation.state === STALE) {
        this.updateComputation();
      } else {
        this.computation.lookUpstream();
      }

      GlobalState.updates = updates;
    }

    return super.readSignal();
  }

  runComputation(time: number) {
    const nextValue = this.fn(this.value);

    if (!this.updatedAt || this.updatedAt <= time) {
      if (this.observers?.length) {
        this.writeSignal(nextValue);
      } else {
        this.value = nextValue;
      }
      this.updatedAt = time;
    }
  }

  markDownstream() {
    this.observers!.forEach((o) => {
      if (!o.state) {
        o.markPending();

        if (o instanceof Derivation && o.observers) {
          o.markDownstream();
        }
      }
    });
  }
}
