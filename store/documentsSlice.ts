import { createAsyncThunk, createSelector, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { api } from "@/lib/api";
import { REVIEWER } from "@/lib/constants";
import { fileKind, money } from "@/lib/format";
import { IN_FLIGHT, type DocumentOut, type ResultOut, type Stats } from "@/lib/types";
import type { AppDispatch, RootState } from "./index";
import { notify } from "./notificationsSlice";
import { setConnection } from "./uiSlice";

export type StatusFilter = "All" | "Needs Review" | "Completed" | "Processing" | "Failed";

export interface DocumentDetail {
  doc: DocumentOut;
  results: ResultOut[];
  history: any[];
  loadedAt: number;
}

export interface DocumentsState {
  /** the list shown on the Documents page, kept fresh by the sync loop */
  items: DocumentOut[];
  stats: Stats | null;
  listLoaded: boolean; // false until the first answer arrives (drives the skeleton)
  listLoading: boolean;
  listRequestId: string | null; // only the newest list request may write its answer
  error: string | null;
  lastSyncedAt: number | null;

  /** documents opened before: shown instantly, then refreshed quietly */
  details: Record<string, DocumentDetail>;
  detailState: Record<string, "loading" | "ready" | "error">;
  detailError: Record<string, string>;
  /** documents with an action in flight (their buttons are disabled) */
  busyIds: string[];
  /** just-uploaded documents a refresh may not know about yet (id -> when added) */
  justAdded: Record<string, number>;

  statusFilter: StatusFilter;
  typeFilter: string;
  searchQuery: string;
  page: number;
  pageSize: number;
  selectedIds: string[];
}

const initialState: DocumentsState = {
  items: [],
  stats: null,
  listLoaded: false,
  listLoading: false,
  listRequestId: null,
  error: null,
  lastSyncedAt: null,
  details: {},
  detailState: {},
  detailError: {},
  busyIds: [],
  justAdded: {},
  statusFilter: "All",
  typeFilter: "All",
  searchQuery: "",
  page: 1,
  pageSize: 10,
  selectedIds: [],
};

const JUST_ADDED_MS = 15000;

const message = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

// ------------------------------------------------------------------ loading

export const fetchDocuments = createAsyncThunk<DocumentOut[], void, { state: RootState; rejectValue: string }>(
  "documents/fetchDocuments",
  async (_, { getState, rejectWithValue }) => {
    try {
      const q = getState().documents.searchQuery.trim();
      return await api.listDocuments({ q: q || undefined, limit: 200 });
    } catch (err) {
      return rejectWithValue(message(err, "Could not load documents"));
    }
  },
);

export const fetchStats = createAsyncThunk<Stats, void, { rejectValue: string }>("documents/fetchStats", async (_, { rejectWithValue }) => {
  try {
    return await api.stats();
  } catch (err) {
    return rejectWithValue(message(err, "Could not load statistics"));
  }
});

/** One round of the sync loop: refresh the list and the statistics, and record whether the backend answered. */
export const syncNow = createAsyncThunk<void, void, { state: RootState }>("documents/syncNow", async (_, thunkApi) => {
  const dispatch = thunkApi.dispatch as unknown as AppDispatch;
  const [list, stats] = await Promise.all([dispatch(fetchDocuments()), dispatch(fetchStats())]);
  dispatch(setConnection(list.meta.requestStatus === "fulfilled" || stats.meta.requestStatus === "fulfilled" ? "online" : "offline"));
});

export const fetchDocumentDetails = createAsyncThunk<
  { id: string; doc: DocumentOut; results: ResultOut[]; history: any[] },
  { id: string; silent?: boolean },
  { rejectValue: string }
>("documents/fetchDocumentDetails", async ({ id }, { rejectWithValue }) => {
  try {
    const [doc, results, history] = await Promise.all([
      api.getDocument(id),
      api.getResults(id).catch(() => [] as ResultOut[]),
      api.getHistory(id).catch(() => [] as any[]),
    ]);
    return { id, doc, results: results || [], history: history || [] };
  } catch (err) {
    return rejectWithValue(message(err, "Could not open this document"));
  }
});

// ------------------------------------------------------------------ actions (optimistic, with rollback and a toast)

type Ctx = { dispatch: any; rejectWithValue: (v: string) => any };

/** Runs an action on one document: marks it busy, applies `optimistic` immediately, and on failure restores the truth from the server. */
async function act<T>(
  id: string,
  { dispatch, rejectWithValue }: Ctx,
  opts: { optimistic?: Partial<DocumentOut>; run: () => Promise<T>; onDone?: (r: T) => string | null; failure: string },
) {
  dispatch(setBusy({ id, busy: true }));
  if (opts.optimistic) dispatch(patchDocument({ id, patch: opts.optimistic }));
  try {
    const result = await opts.run();
    const text = opts.onDone?.(result);
    if (text) dispatch(notify("success", text));
    return result;
  } catch (err) {
    const reason = message(err, opts.failure);
    dispatch(notify("error", `${opts.failure}: ${reason}`));
    return rejectWithValue(reason);
  } finally {
    dispatch(setBusy({ id, busy: false }));
    // whichever way it went, the server is the source of truth
    dispatch(fetchDocumentDetails({ id, silent: true }));
    dispatch(syncNow());
  }
}

export const approveDocument = createAsyncThunk<any, { id: string }, { rejectValue: string }>("documents/approve", async ({ id }, ctx) =>
  act(id, ctx, {
    optimistic: { status: "completed", stage: "Approved & Vectorized" },
    run: () => api.approve(id, REVIEWER),
    onDone: (r) => (r.original_removed
      ? "Approved. The document is verified and searchable, and its original file was deleted from storage."
      : "Approved. The document is verified and now searchable."),
    failure: "Could not approve",
  }),
);

export const reconcileDocument = createAsyncThunk<
  any,
  { id: string; payload: { subtotal?: number; tax?: number; total?: number; action?: string }; currency?: string },
  { rejectValue: string }
>("documents/reconcile", async ({ id, payload, currency }, ctx) =>
  act(id, ctx, {
    optimistic: { status: "completed", stage: "Reconciled & Vectorized" },
    run: () => api.reconcile(id, { ...payload, reviewer: REVIEWER }),
    onDone: () => `Total set to ${money(payload.total ?? null, currency)} and the document is verified.`,
    failure: "Could not save the total",
  }),
);

export const rejectDocument = createAsyncThunk<any, { id: string }, { rejectValue: string }>("documents/reject", async ({ id }, ctx) =>
  act(id, ctx, {
    optimistic: { status: "rejected", stage: "Format Rejected" },
    run: () => api.reject(id, "Not a supported invoice, waybill or receipt.", REVIEWER),
    onDone: () => "Rejected. The document is excluded from search.",
    failure: "Could not reject",
  }),
);

export const rerunDocument = createAsyncThunk<any, { id: string }, { rejectValue: string }>("documents/rerun", async ({ id }, ctx) =>
  act(id, ctx, {
    optimistic: { status: "queued", stage: "Reprocessing Queued" },
    run: () => api.rerunOcr(id),
    onDone: () => "Reading the document again. This page updates when it finishes.",
    failure: "Could not restart processing",
  }),
);

export const correctDocument = createAsyncThunk<any, { id: string; corrections: Record<string, any>; resultId?: number }, { rejectValue: string }>(
  "documents/correct",
  async ({ id, corrections, resultId }, ctx) =>
    act(id, ctx, {
      run: () => api.correctDocument(id, corrections, REVIEWER, resultId),
      onDone: () => "Corrections saved.",
      failure: "Could not save corrections",
    }),
);

export const deleteDocument = createAsyncThunk<string, { id: string; filename?: string }, { rejectValue: string }>(
  "documents/delete",
  async ({ id, filename }, thunkApi) => {
    const dispatch = thunkApi.dispatch as unknown as AppDispatch;
    const { rejectWithValue } = thunkApi;
    dispatch(removeDocument(id)); // gone from the screen at once
    try {
      await api.deleteDocument(id);
      dispatch(notify("success", `Deleted ${filename ?? "the document"}.`));
      return id;
    } catch (err) {
      const reason = message(err, "Delete failed");
      dispatch(notify("error", `Could not delete ${filename ?? "the document"}: ${reason}`));
      return rejectWithValue(reason);
    } finally {
      dispatch(syncNow()); // restores the row if the delete failed
    }
  },
);

export const uploadDocuments = createAsyncThunk<number, File[], { rejectValue: string }>("documents/upload", async (files, thunkApi) => {
  const dispatch = thunkApi.dispatch as unknown as AppDispatch;
  const { rejectWithValue } = thunkApi;
  try {
    const items = await api.upload(files);
    const accepted = items.filter((i) => i.id && i.status !== "rejected");
    const byName = new Map(files.map((f) => [f.name, f]));
    dispatch(addQueued(accepted.map((i) => ({ id: i.id as string, filename: i.filename, size_bytes: byName.get(i.filename)?.size, file_type: byName.get(i.filename)?.type }))));
    const refused = items.length - accepted.length;
    dispatch(notify("success", `${accepted.length} file${accepted.length === 1 ? "" : "s"} queued. They update here as each page is read.`));
    if (refused) dispatch(notify("error", `${refused} file${refused === 1 ? " was" : "s were"} refused by the server.`));
    dispatch(syncNow());
    return accepted.length;
  } catch (err) {
    const reason = message(err, "Upload failed");
    dispatch(notify("error", `Upload failed: ${reason}`));
    return rejectWithValue(reason);
  }
});

// ------------------------------------------------------------------ slice

export const documentsSlice = createSlice({
  name: "documents",
  initialState,
  reducers: {
    setStatusFilter(state, action: PayloadAction<StatusFilter>) {
      state.statusFilter = action.payload;
      state.page = 1;
    },
    setTypeFilter(state, action: PayloadAction<string>) {
      state.typeFilter = action.payload;
      state.page = 1;
    },
    setSearchQuery(state, action: PayloadAction<string>) {
      state.searchQuery = action.payload;
      state.page = 1;
    },
    setPage(state, action: PayloadAction<number>) {
      state.page = Math.max(1, action.payload);
    },
    toggleSelectId(state, action: PayloadAction<string>) {
      const id = action.payload;
      state.selectedIds = state.selectedIds.includes(id) ? state.selectedIds.filter((x) => x !== id) : [...state.selectedIds, id];
    },
    selectAllIds(state, action: PayloadAction<string[]>) {
      state.selectedIds = action.payload;
    },
    clearSelection(state) {
      state.selectedIds = [];
    },
    /** Restores saved filters when the page loads in the browser. */
    hydratePrefs(state, action: PayloadAction<Partial<Pick<DocumentsState, "statusFilter" | "typeFilter" | "searchQuery" | "pageSize">>>) {
      Object.assign(state, action.payload);
    },
    setBusy(state, action: PayloadAction<{ id: string; busy: boolean }>) {
      const { id, busy } = action.payload;
      state.busyIds = busy ? (state.busyIds.includes(id) ? state.busyIds : [...state.busyIds, id]) : state.busyIds.filter((x) => x !== id);
    },
    /** Shows the expected result of an action before the server confirms it. */
    patchDocument(state, action: PayloadAction<{ id: string; patch: Partial<DocumentOut> }>) {
      const { id, patch } = action.payload;
      const row = state.items.find((d) => d.id === id);
      if (row) Object.assign(row, patch);
      const detail = state.details[id];
      if (detail) Object.assign(detail.doc, patch);
    },
    removeDocument(state, action: PayloadAction<string>) {
      const id = action.payload;
      state.items = state.items.filter((d) => d.id !== id);
      state.selectedIds = state.selectedIds.filter((x) => x !== id);
      delete state.details[id];
      delete state.detailState[id];
      if (state.stats) state.stats.total = Math.max(0, state.stats.total - 1);
    },
    /** New uploads appear in the list immediately, before the next sync. */
    addQueued(state, action: PayloadAction<{ id: string; filename: string; size_bytes?: number; file_type?: string }[]>) {
      const now = new Date().toISOString();
      for (const f of action.payload) {
        if (state.items.some((d) => d.id === f.id)) continue;
        state.justAdded[f.id] = Date.now();
        state.items.unshift({
          id: f.id, filename: f.filename, file_type: f.file_type || "", size_bytes: f.size_bytes ?? 0, status: "queued", stage: "Uploaded", progress: 0.1,
          page_count: 1, pages_done: 0, error: null, attempts: 0, processing_ms: null, created_at: now, updated_at: now,
          invoice_count: 0, needs_review: false, summary: {},
        } as DocumentOut);
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchDocuments.pending, (state, action) => {
        state.listLoading = true;
        state.listRequestId = action.meta.requestId;
      })
      .addCase(fetchDocuments.fulfilled, (state, action) => {
        if (action.meta.requestId !== state.listRequestId) return; // a newer request (for example a new search) is on its way
        state.listLoading = false;
        state.listLoaded = true;
        state.error = null;
        const fresh = action.payload || [];
        const seen = new Set(fresh.map((d) => d.id));
        // A refresh that started before an upload finished must not make the new row vanish for a moment
        const now = Date.now();
        const keep = state.searchQuery.trim()
          ? []
          : state.items.filter((d) => !seen.has(d.id) && state.justAdded[d.id] && now - state.justAdded[d.id] < JUST_ADDED_MS);
        for (const id of Object.keys(state.justAdded)) if (seen.has(id) || now - state.justAdded[id] >= JUST_ADDED_MS) delete state.justAdded[id];
        state.items = [...keep, ...fresh];
        state.lastSyncedAt = now;
        // forget selections of documents that no longer exist
        const ids = new Set(state.items.map((d) => d.id));
        state.selectedIds = state.selectedIds.filter((id) => ids.has(id));
      })
      .addCase(fetchDocuments.rejected, (state, action) => {
        if (action.meta.requestId !== state.listRequestId) return;
        state.listLoading = false;
        state.listLoaded = true;
        state.error = action.payload ?? "Could not load documents";
      })
      .addCase(fetchStats.fulfilled, (state, action) => {
        state.stats = action.payload;
      })
      .addCase(fetchDocumentDetails.pending, (state, action) => {
        const { id, silent } = action.meta.arg;
        if (!silent && !state.details[id]) state.detailState[id] = "loading";
        delete state.detailError[id];
      })
      .addCase(fetchDocumentDetails.fulfilled, (state, action) => {
        const { id, doc, results, history } = action.payload;
        state.details[id] = { doc, results, history, loadedAt: Date.now() };
        state.detailState[id] = "ready";
        const row = state.items.find((d) => d.id === id);
        if (row) Object.assign(row, doc);
      })
      .addCase(fetchDocumentDetails.rejected, (state, action) => {
        const { id, silent } = action.meta.arg;
        if (silent && state.details[id]) return; // keep showing what we have
        state.detailState[id] = "error";
        state.detailError[id] = action.payload ?? "Could not open this document";
      });
  },
});

export const {
  setStatusFilter, setTypeFilter, setSearchQuery, setPage, toggleSelectId, selectAllIds, clearSelection,
  hydratePrefs, setBusy, patchDocument, removeDocument, addQueued,
} = documentsSlice.actions;

// ------------------------------------------------------------------ selectors

const selectDocs = (s: RootState) => s.documents;
export const selectItems = (s: RootState) => s.documents.items;

export const selectFiltered = createSelector([selectItems, (s: RootState) => s.documents.statusFilter, (s: RootState) => s.documents.typeFilter], (items, status, type) =>
  items.filter((d) => {
    if (status === "Processing" && !IN_FLIGHT.includes(d.status)) return false;
    if (status === "Needs Review" && d.status !== "needs_review") return false;
    if (status === "Completed" && d.status !== "completed") return false;
    if (status === "Failed" && d.status !== "failed" && d.status !== "rejected") return false;
    if (type !== "All" && fileKind(d.file_type, d.filename).kind !== type) return false;
    return true;
  }),
);

export const selectPageInfo = createSelector([selectFiltered, (s: RootState) => s.documents.page, (s: RootState) => s.documents.pageSize], (filtered, page, pageSize) => {
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  return { rows: filtered.slice((safePage - 1) * pageSize, safePage * pageSize), total: filtered.length, totalPages, page: safePage, pageSize };
});

/** Counts for the status strip: the server's numbers when we have them, otherwise counted from the list. */
export const selectCounts = createSelector([selectItems, (s: RootState) => s.documents.stats], (items, stats) => {
  const by = stats?.by_status;
  const n = (status: string) => items.filter((d) => d.status === status).length;
  return {
    all: stats?.total ?? items.length,
    review: by?.needs_review ?? n("needs_review"),
    done: by?.completed ?? n("completed"),
    work: by ? (by.processing ?? 0) + (by.queued ?? 0) : n("processing") + n("queued"),
    bad: by ? (by.failed ?? 0) + (by.rejected ?? 0) : n("failed") + n("rejected"),
  };
});

/** True while any document is being processed: the sync loop polls faster then. */
export const selectAnyInFlight = createSelector([selectItems], (items) => items.some((d) => IN_FLIGHT.includes(d.status)));
export const selectDetail = (id: string) => (s: RootState) => s.documents.details[id];
export const selectIsBusy = (id: string) => (s: RootState) => s.documents.busyIds.includes(id);
export const selectDocsState = selectDocs;

export default documentsSlice.reducer;
