import { createSignal, createRoot, createMemo, createEffect } from "./globals";

createRoot(() => {
  const [count, setCount] = createSignal(0);

  const double = createMemo(() => count() * 2);

  createEffect(() => {
    console.log(double());
  });

  setInterval(() => setCount(count() + 1), 1000);
});
