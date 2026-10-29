"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Calls `fn` immediately and then repeatedly. `intervalMs(data)` can return a different delay depending
 * on the latest data (fast while jobs are running, slow when idle) or null to stop. Pauses while the
 * browser tab is hidden. Returns the latest data, error and a manual `refresh`.
 */
export function usePolling<T>(fn: () => Promise<T>, intervalMs: (data: T | undefined) => number | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fnRef = useRef(fn);
  const intervalRef = useRef(intervalMs);
  fnRef.current = fn;
  intervalRef.current = intervalMs;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);
  const tick = useRef<() => Promise<void>>(async () => {});

  tick.current = async () => {
    if (timer.current) clearTimeout(timer.current);
    let latest: T | undefined;
    try {
      if (typeof document === "undefined" || !document.hidden) {
        latest = await fnRef.current();
        if (!alive.current) return;
        setData(latest);
        setError(null);
      }
    } catch (e) {
      if (!alive.current) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (alive.current) setLoading(false);
    }
    if (!alive.current) return;
    const next = intervalRef.current(latest);
    if (next !== null) timer.current = setTimeout(() => void tick.current(), next);
  };

  useEffect(() => {
    alive.current = true;
    setLoading(true);
    void tick.current();
    return () => {
      alive.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const refresh = useCallback(() => tick.current(), []);
  return { data, error, loading, refresh };
}
