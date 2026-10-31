import type { Store } from "@reduxjs/toolkit";
import type { RootState } from "./index";

const KEY = "docuintel.prefs.v1";

/** Only preferences are saved: never documents, results or anything from the server. */
export function pickPrefs(s: RootState) {
  return {
    documents: { statusFilter: s.documents.statusFilter, typeFilter: s.documents.typeFilter, pageSize: s.documents.pageSize },
    search: { mode: s.search.mode, recent: s.search.recent },
    ui: { zoom: s.ui.zoom, viewMode: s.ui.viewMode },
  };
}

export type Prefs = ReturnType<typeof pickPrefs>;

export function loadPrefs(): Partial<Prefs> | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Partial<Prefs>) : null;
  } catch {
    return null; // private window, blocked storage or damaged value: start fresh
  }
}

/** Saves the preferences whenever they change (at most once per tick). Returns an unsubscribe function. */
export function persistPrefs(store: Store<RootState>): () => void {
  let last = "";
  let timer: ReturnType<typeof setTimeout> | null = null;
  const unsubscribe = store.subscribe(() => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      try {
        const next = JSON.stringify(pickPrefs(store.getState()));
        if (next !== last) {
          window.localStorage.setItem(KEY, next);
          last = next;
        }
      } catch {
        /* storage unavailable: preferences just will not persist */
      }
    }, 250);
  });
  return () => {
    unsubscribe();
    if (timer) clearTimeout(timer);
  };
}
