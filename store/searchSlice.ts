import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import { api } from "@/lib/api";
import type { SearchHit, RAGResult, DocumentOut, DocFilters } from "@/lib/types";

export type SearchMode = "rag" | "hybrid" | "filters" | "semantic" | "keyword";

export interface SearchState {
  query: string;
  mode: SearchMode;
  hits: SearchHit[] | null;
  docs: DocumentOut[] | null;
  ragResult: RAGResult | null;
  loading: boolean;
  ragLoading: boolean;
  error: string | null;
}

const initialState: SearchState = {
  query: "",
  mode: "rag",
  hits: null,
  docs: null,
  ragResult: null,
  loading: false,
  ragLoading: false,
  error: null,
};

export const runSearch = createAsyncThunk(
  "search/runSearch",
  async (
    { q, mode }: { q: string; mode: "keyword" | "semantic" | "hybrid" },
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
      state.mode = action.payload;
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
      state.hits = null;
      state.docs = null;
      state.ragResult = null;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // runSearch
      .addCase(runSearch.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(runSearch.fulfilled, (state, action) => {
        state.loading = false;
        state.hits = action.payload || [];
      })
      .addCase(runSearch.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })

      // runRagQuery
      .addCase(runRagQuery.pending, (state) => {
        state.ragLoading = true;
        state.error = null;
      })
      .addCase(runRagQuery.fulfilled, (state, action) => {
        state.ragLoading = false;
        state.ragResult = action.payload;
        state.hits = action.payload?.hits || [];
      })
      .addCase(runRagQuery.rejected, (state, action) => {
        state.ragLoading = false;
        state.error = action.payload as string;
      })

      // runFilterSearch
      .addCase(runFilterSearch.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(runFilterSearch.fulfilled, (state, action) => {
        state.loading = false;
        state.docs = action.payload || [];
      })
      .addCase(runFilterSearch.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });
  },
});

export const {
  setQuery,
  setMode,
  setHits,
  setDocs,
  setRagResult,
  clearSearch,
} = searchSlice.actions;

export default searchSlice.reducer;
