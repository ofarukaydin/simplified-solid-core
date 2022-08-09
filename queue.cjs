const equalFn = (a, b) => a === b;
const signalOptions = {
  equals: equalFn,
};
let ERROR = null;
let runEffects = runQueue;
const NOTPENDING = {};
const STALE = 1;
const PENDING = 2;
const UNOWNED = {
  owned: null,
  cleanups: null,
  context: null,
  owner: null,
};
let Owner = null;
let Listener = null;
let Pending = null;
let Updates = null;
let Effects = null;
let ExecCount = 0;

function createRoot(fn, detachedOwner) {
  if (detachedOwner) {
    Owner = detachedOwner;
  }

  const listener = Listener;
  const owner = Owner;
  const root =
    fn.length === 0
      ? UNOWNED
      : {
          owned: null,
          cleanups: null,
          context: null,
          owner,
        };
  Owner = root;
  Listener = null;
  let result;
  try {
    runUpdates(() => {
      result = fn(() => cleanNode(root));

      return result;
    }, true);
  } finally {
    Listener = listener;
    Owner = owner;
  }

  return result;
}

function createSignal(value, userOptions) {
  const options = { ...signalOptions, ...userOptions };

  const s = {
    value,
    observers: null,
    observerSlots: null,
    pending: NOTPENDING,
    comparator: options.equals || undefined,
  };

  const signal = readSignal.bind(s);
  const setSignal = (value) => {
    if (typeof value === "function") {
      value = value(s.pending !== NOTPENDING ? s.pending : s.value);
    }
    return writeSignal(s, value);
  };

  return [signal, setSignal];
}

function createComputed(fn, value) {
  updateComputation(createComputation(fn, value, true, STALE));
}

function createMemo(fn, value, userOptions) {
  const options = { ...signalOptions, ...userOptions };
  const c = createComputation(fn, value, true, 0);
  c.pending = NOTPENDING;
  c.observers = null;
  c.observerSlots = null;
  c.comparator = options.equals || undefined;

  updateComputation(c);

  return readSignal.bind(c);
}

function batch(fn) {
  if (Pending) return fn();
  let result;

  Pending = [];
  const q = [];

  try {
    result = fn();
  } finally {
    Pending = null;
  }

  runUpdates(() => {
    q.forEach((data) => {
      if (data.pending !== NOTPENDING) {
        const pending = data.pending;
        data.pending = NOTPENDING;
        writeSignal(data, pending);
      }
    });
  }, false);

  return result;
}

function untrack(fn) {
  let result;
  let listener = Listener;
  Listener = null;
  result = fn();
  Listener = listener;

  return result;
}

function readSignal() {
  if (this.state && this.sources) {
    const updates = Updates;
    Updates = null;

    if (this.state === STALE) {
      updateComputation(this);
    } else {
      lookUpstream(this);
    }

    Updates = updates;
  }

  if (Listener) {
    const sSlot = this.observers ? this.observers.length : 0;
    if (!Listener.sources) {
      Listener.sources = [this];
      Listener.sourceSlots = [sSlot];
    } else {
      Listener.sources.push(this);
      Listener.sourceSlots.push(sSlot);
    }

    if (!this.observers) {
      this.observers = [Listener];
      this.observerSlots = [Listener.sources.length - 1];
    } else {
      this.observers.push(Listener);
      this.observerSlots.push(Listener.sources.length - 1);
    }
  }

  return this.value;
}

function writeSignal(node, value) {
  if (Pending) {
    if (node.pending === NOTPENDING) Pending.push(node);
    node.pending = value;
    return value;
  }

  if (node.comparator) {
    if (node.comparator(node.value, value)) return value;
  }

  node.value = value;

  if (node.observers?.length) {
    runUpdates(() => {
      node.observers.forEach((o) => {
        if (!o.state) {
          if (o.pure) Updates.push(o);
          else Effects.push(o);
          if (o.observers) markDownstream(o);
        }

        o.state = STALE;
      });

      if (Updates.length > 10e5) {
        Updates = [];
        throw new Error();
      }
    }, false);
  }

  return value;
}

function updateComputation(node) {
  console.log("computation is updating");

  if (!node.fn) return;

  cleanNode(node);

  const owner = Owner;
  const listener = Listener;
  const time = ExecCount;

  Listener = node;
  Owner = node;

  runComputation(node, node.value, time);

  Listener = listener;
  Owner = owner;
}

function runComputation(node, value, time) {
  const nextValue = node.fn(value);

  if (!node.updatedAt || node.updatedAt <= time) {
    if (node.observers?.length) {
      writeSignal(node, nextValue);
    } else {
      node.value = nextValue;
    }
    node.updatedAt = time;
  }
}

function createComputation(fn, init, pure, state = STALE, options) {
  const c = {
    fn,
    state,
    updatedAt: null,
    owned: null,
    sources: null,
    sourceSlots: null,
    cleanups: null,
    value: init,
    owner: Owner,
    context: null,
    pure,
  };

  if (Owner !== UNOWNED) {
    if (!Owner.owned) Owner.owned = [c];
    else Owner.owned.push(c);
  }

  return c;
}

function runTop(node) {
  if (node.state === 0) return;
  if (node.state === PENDING) return lookUpstream(node);

  const ancestors = [node];

  while ((node = node.owner) && (!node.updatedAt || node.updatedAt < ExecCount)) {
    if (node.state) ancestors.push(node);
  }

  for (let i = ancestors.length - 1; i >= 0; i--) {
    node = ancestors[i];

    if (node.state == STALE) {
      updateComputation(node);
    } else if (node.state === PENDING) {
      const updates = Updates;
      Updates = null;
      lookUpstream(node);
      Updates = updates;
    }
  }
}

function runUpdates(fn, init) {
  if (Updates) return fn();
  let wait = false;
  if (!init) Updates = [];
  if (Effects) wait = true;
  else Effects = [];
  ExecCount++;

  try {
    fn();
  } finally {
    completeUpdates(wait);
  }
}

function completeUpdates(wait) {
  if (Updates) {
    runQueue(Updates);
    Updates = null;
  }
  if (wait) return;
  if (Effects.length) {
    batch(() => {
      runEffects(Effects);
    });
  }
  Effects = null;
}

function runQueue(queue) {
  queue.forEach(runTop);
}

function lookUpstream(node) {
  node.state = 0;

  node.sources.forEach((source) => {
    if (source.sources) {
      if (source.state === STALE) runTop(source);
      else if (source.state === PENDING) lookUpstream(source);
    }
  });
}

function markDownstream(node) {
  node.observers.forEach((o) => {
    if (!o.state) {
      o.state = PENDING;
      if (o.pure) Updates.push(o);
      else Effects.push(o);

      if (o.observers) {
        markDownstream(o);
      }
    }
  });
}

function cleanNode(node) {
  let i;

  if (node.sources) {
    while (node.sources.length) {
      const source = node.sources.pop();
      const index = node.sourceSlots.pop();
      const obs = source.observers;

      if (obs?.length) {
        const n = obs.pop();
        const s = source.observerSlots.pop();

        if (index < obs.length) {
          n.sourceSlots[s] = index;
          obs[index] = n;
          source.observerSlots[index] = s;
        }
      }
    }
  }

  if (node.owned) {
    node.owned.forEach((ownedNode) => cleanNode(ownedNode));
    node.owned = null;
  }

  if (node.cleanups) {
    node.cleanups.forEach((cleanup) => cleanup());
    node.cleanups = null;
  }

  node.state = 0;
  node.context = null;
}

exports.createComputed = createComputed;
exports.createMemo = createMemo;
exports.createRoot = createRoot;
exports.createSignal = createSignal;
exports.batch = batch;
