"use client";

import { useEffect } from "react";
import { useAppDispatch, useAppSelector, useAppStore } from "@/store";
import { fetchDocuments, selectAnyInFlight, syncNow } from "@/store/documentsSlice";

const FAST_MS = 1500; // while documents are being processed
const IDLE_MS = 6000;
const OFFLINE_MS = 10000;

/**
 * The one place that keeps the document list, the statistics and the connection light fresh.
 * It polls quickly while anything is processing, slowly otherwise, and sleeps while the tab is hidden.
 * Pages just read from the store, so moving between pages never shows an empty list.
 */
export function Sync() {
  const dispatch = useAppDispatch();
  const store = useAppStore();

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = () => {
      if (stopped) return;
      const s = store.getState();
      const wait = s.ui.connection === "offline" ? OFFLINE_MS : selectAnyInFlight(s) ? FAST_MS : IDLE_MS;
      timer = setTimeout(tick, wait);
    };
    const tick = async () => {
      if (stopped) return;
      if (!document.hidden) await dispatch(syncNow());
      schedule();
    };
    const onVisible = () => {
      if (!document.hidden) {
        if (timer) clearTimeout(timer);
        void tick();
      }
    };

    void tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [dispatch, store]);

  // Searching the Documents page asks the server again (it also looks inside the extracted text)
  const query = useAppSelector((s) => s.documents.searchQuery);
  useEffect(() => {
    const t = setTimeout(() => void dispatch(fetchDocuments()), 300);
    return () => clearTimeout(t);
  }, [query, dispatch]);

  return null;
}
