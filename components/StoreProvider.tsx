"use client";

import { useEffect, useRef } from "react";
import { Provider } from "react-redux";
import { BusyOverlay } from "@/components/BusyOverlay";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Sync } from "@/components/Sync";
import { Toaster } from "@/components/Toaster";
import { makeStore, type AppStore } from "@/store";
import { hydratePrefs as hydrateDocs } from "@/store/documentsSlice";
import { loadPrefs, persistPrefs } from "@/store/persist";
import { hydratePrefs as hydrateSearch } from "@/store/searchSlice";
import { setViewMode, setZoom } from "@/store/uiSlice";

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const storeRef = useRef<AppStore | null>(null);
  if (!storeRef.current) storeRef.current = makeStore();
  const store = storeRef.current;

  // Restore saved preferences after the first render (so the server HTML and the first client render match), then keep saving them
  useEffect(() => {
    const prefs = loadPrefs();
    if (prefs?.documents) store.dispatch(hydrateDocs(prefs.documents));
    if (prefs?.search) store.dispatch(hydrateSearch(prefs.search));
    if (prefs?.ui) {
      if (prefs.ui.zoom) store.dispatch(setZoom(prefs.ui.zoom));
      if (prefs.ui.viewMode) store.dispatch(setViewMode(prefs.ui.viewMode));
    }
    return persistPrefs(store as any);
  }, [store]);

  return (
    <Provider store={store}>
      <Sync />
      {children}
      <Toaster />
      <BusyOverlay />
      <ConfirmDialog />
    </Provider>
  );
}
