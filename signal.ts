import { Computation } from "./computation";
import { NOTPENDING, PENDING, signalOptions, STALE } from "./constants";
import { Derivation } from "./derivation";
import { runUpdates } from "./globals";
import { GlobalState } from "./state";

export class Signal<T> {
  value: T;
  observers: (Computation<T> | Derivation<T>)[] | null;
  observerSlots: number[] | null;
  pending: typeof NOTPENDING | typeof PENDING;
  comparator?: (<T>(a: T, b: T) => boolean) | undefined;

  constructor(value: T, userOptions: Record<string, any>) {
    const options = { ...signalOptions, ...userOptions };

    this.value = value;
    this.observers = null;
    this.observerSlots = null;
    this.comparator = options.equals || undefined;
    this.pending = NOTPENDING;
  }

  getTuple() {
    return [this.readSignal.bind(this), this.setSignal.bind(this)] as const;
  }

  readSignal(): T {
    if (GlobalState.listener) {
      const sSlot = this.observers ? this.observers.length : 0;
      if (!GlobalState.listener!.sources || !GlobalState.listener!.sourceSlots) {
        GlobalState.listener!.sources = [this];
        GlobalState.listener!.sourceSlots = [sSlot];
      } else {
        GlobalState.listener!.sources.push(this);
        GlobalState.listener!.sourceSlots.push(sSlot);
      }

      if (!this.observers || !this.observerSlots) {
        this.observers = [GlobalState.listener];
        this.observerSlots = [GlobalState.listener!.sources.length - 1];
      } else {
        this.observers.push(GlobalState.listener);
        this.observerSlots.push(GlobalState.listener!.sources.length - 1);
      }
    }

    return this.value;
  }

  writeSignal(value: T) {
    if (GlobalState.pending) {
      if (this.pending === NOTPENDING) GlobalState.pending.push(this);
      this.pending = value;
      return value;
    }

    if (this.comparator) {
      if (this.comparator(this.value, value)) return value;
    }

    this.value = value;

    if (this.observers?.length) {
      runUpdates(() => {
        this.observers!.forEach((o) => {
          if (!o?.state) {
            o.markStale();
            if (o instanceof Derivation && o.observers) {
              o.markDownstream();
            }
          }

          o.state = STALE;
        });

        if (GlobalState.updates && GlobalState.updates.length > 10e5) {
          GlobalState.updates = [];
          throw new Error();
        }
      }, false);
    }

    return value;
  }

  setSignal(value: ((set: T) => T) | T) {
    const calculatedVal =
      typeof value === "function"
        ? (value as (set: T) => T)(this.pending !== NOTPENDING ? (this.pending as T) : this.value)
        : value;

    return this.writeSignal(calculatedVal);
  }
}
