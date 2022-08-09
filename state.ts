import { Computation } from "./computation";
import { Derivation } from "./derivation";
import { runQueue } from "./globals";
import { Signal } from "./signal";

type GlobalState<T = any> = {
  updates: (Derivation<T> | Computation<T>)[] | null;
  listener: Derivation<T> | Computation<T> | null;
  pending: Signal<T>[] | null;
  effects: (Derivation<T> | Computation<T>)[] | null;
  owner: Derivation<T> | Computation<T> | null;
  execCount: number;
  runEffects: (queue: (Computation<any> | Derivation<any>)[]) => void;
};

export const GlobalState: GlobalState = {
  owner: null,
  listener: null,
  pending: null,
  updates: null,
  effects: null,
  execCount: 0,
  runEffects: runQueue,
};
