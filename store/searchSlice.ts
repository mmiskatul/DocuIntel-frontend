import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import { api } from "@/lib/api";
import type { SearchHit, RAGResult, DocumentOut, DocFilters } from "@/lib/types";

export type SearchMode = "rag" | "hybrid" | "filters" | "semantic" | "keyword" | "exact";

export interface SearchState {
  query: string;
  mode: SearchMode;
  hits: SearchHit[] | null;
  docs: DocumentOut[] | null;
  ragResult: RAGResult | null;
  loading: boolean;
  ragLoading: boolean;
  error: string | null;
  /** the search whose answer is still wanted: a slower, older search must not overwrite a newer one */
  activeRequest: string | null;
  /** the last few searches, newest first (kept between visits) */
  recent: string[];
}

const MAX_RECENT = 6;
const remember = (state: SearchState, q: string) => {
  const t = q.trim();
  if (t) state.recent = [t, ...state.recent.filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, MAX_RECENT);
};

const initialState: SearchState = {
  query: "",
  mode: "rag",
  hits: null,
  docs: null,
  ragResult: null,
  loading: false,
  ragLoading: false,
  error: null,
  activeRequest: null,
  recent: [],
};

/** Results belong to the search that produced them: a new search (or another tab) starts from a clean page. */
const clearResults = (state: SearchState) => {
  state.hits = null;
  state.docs = null;
  state.ragResult = null;
  state.error = null;
};

export const runSearch = createAsyncThunk(
  "search/runSearch",
  async (
    { q, mode }: { q: string; mode: "keyword" | "semantic" | "hybrid" | "exact" },
    { rejectWithValue }
  ) => {
    try {
      return await api.search(q, mode, 20);
    } catch (err: any) {
      return rejectWithValue(err.message || "Search failed");
    }
  }
);

export const runRagQuery = createAsyncThunk(
  "search/runRagQuery",
  async (
    { q }: { q: string },
    { rejectWithValue }
  ) => {
    try {
      return await api.ragSearch(q);
    } catch (err: any) {
      return rejectWithValue(err.message || "AI answer generation failed");
    }
  }
);

export const runFilterSearch = createAsyncThunk(
  "search/runFilterSearch",
  async (filters: DocFilters, { rejectWithValue }) => {
    try {
      return await api.listDocuments(filters);
    } catch (err: any) {
      return rejectWithValue(err.message || "Filter search failed");
    }
  }
);

export const searchSlice = createSlice({
  name: "search",
  initialState,
  reducers: {
    setQuery(state, action: PayloadAction<string>) {
      state.query = action.payload;
    },
    setMode(state, action: PayloadAction<SearchMode>) {
      if (state.mode === action.payload) return;
      state.mode = action.payload;
      clearResults(state); // answers and results from the other tab must not stay on screen
      state.loading = false;
      state.ragLoading = false;
      state.activeRequest = null;
    },
    hydratePrefs(state, action: PayloadAction<Partial<Pick<SearchState, "mode" | "recent">>>) {
      Object.assign(state, action.payload);
    },
    clearRecent(state) {
      state.recent = [];
    },
    setHits(state, action: PayloadAction<SearchHit[] | null>) {
      state.hits = action.payload;
    },
    setDocs(state, action: PayloadAction<DocumentOut[] | null>) {
      state.docs = action.payload;
    },
    setRagResult(state, action: PayloadAction<RAGResult | null>) {
      state.ragResult = action.payload;
    },
    clearSearch(state) {
      state.query = "";
      clearResults(state);
      state.loading = false;
      state.ragLoading = false;
      state.activeRequest = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // find documents (keyword + meaning)
      .addCase(runSearch.pending, (state, action) => {
        clearResults(state);
        state.loading = true;
        state.ragLoading = false;
        state.activeRequest = action.meta.requestId;
      })
      .addCase(runSearch.fulfilled, (state, action) => {
        if (action.meta.requestId !== state.activeRequest) return; // an older search finishing late
        state.loading = false;
        state.hits = action.payload || [];
        remember(state, action.meta.arg.q);
      })
      .addCase(runSearch.rejected, (state, action) => {
        if (action.meta.requestId !== state.activeRequest) return;
        state.loading = false;
        state.error = (action.payload as string) ?? "Search failed";
      })

      // ask a question
      .addCase(runRagQuery.pending, (state, action) => {
        clearResults(state);
        state.ragLoading = true;
        state.loading = false;
        state.activeRequest = action.meta.requestId;
      })
      .addCase(runRagQuery.fulfilled, (state, action) => {
        if (action.meta.requestId !== state.activeRequest) return;
        state.ragLoading = false;
        state.ragResult = action.payload;
        state.hits = action.payload?.hits || [];
        remember(state, action.meta.arg.q);
      })
      .addCase(runRagQuery.rejected, (state, action) => {
        if (action.meta.requestId !== state.activeRequest) return;
        state.ragLoading = false;
        state.error = (action.payload as string) ?? "The answer could not be generated";
      })

      // filter
      .addCase(runFilterSearch.pending, (state, action) => {
        clearResults(state);
        state.loading = true;
        state.ragLoading = false;
        state.activeRequest = action.meta.requestId;
      })
      .addCase(runFilterSearch.fulfilled, (state, action) => {
        if (action.meta.requestId !== state.activeRequest) return;
        state.loading = false;
        state.docs = action.payload || [];
      })
      .addCase(runFilterSearch.rejected, (state, action) => {
        if (action.meta.requestId !== state.activeRequest) return;
        state.loading = false;
        state.error = (action.payload as string) ?? "Filter search failed";
      });
  },
});

export const {
  setQuery,
  setMode,
  hydratePrefs,
  clearRecent,
  setHits,
  setDocs,
  setRagResult,
  clearSearch,
} = searchSlice.actions;

export default searchSlice.reducer;
