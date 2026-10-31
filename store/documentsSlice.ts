import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";
import { api } from "@/lib/api";
import type { DocumentOut, Stats, ResultOut } from "@/lib/types";

export interface DocumentsState {
  items: DocumentOut[];
  stats: Stats | null;
  loading: boolean;
  error: string | null;

  // Selected document details (for /documents/[id])
  currentDoc: DocumentOut | null;
  currentResults: ResultOut[];
  currentHistory: any[];
  detailsLoading: boolean;

  // Filters & Pagination
  statusFilter: "All" | "Needs Review" | "Completed" | "Processing" | "Failed";
  typeFilter: string;
  searchQuery: string;
  page: number;
  pageSize: number;
  selectedIds: string[];
}

const initialState: DocumentsState = {
  items: [],
  stats: null,
  loading: false,
  error: null,

  currentDoc: null,
  currentResults: [],
  currentHistory: [],
  detailsLoading: false,

  statusFilter: "All",
  typeFilter: "All",
  searchQuery: "",
  page: 1,
  pageSize: 10,
  selectedIds: [],
};

// Async Thunks
export const fetchDocuments = createAsyncThunk(
  "documents/fetchDocuments",
  async (_, { rejectWithValue }) => {
    try {
      return await api.listDocuments({ limit: 100 });
    } catch (err: any) {
      return rejectWithValue(err.message || "Failed to load documents");
    }
  }
);

export const fetchStats = createAsyncThunk(
  "documents/fetchStats",
  async (_, { rejectWithValue }) => {
    try {
      return await api.stats();
    } catch (err: any) {
      return rejectWithValue(err.message || "Failed to load stats");
    }
  }
);

export const fetchDocumentDetails = createAsyncThunk(
  "documents/fetchDocumentDetails",
  async (docId: string, { rejectWithValue }) => {
    try {
      const [doc, results, history] = await Promise.all([
        api.getDocument(docId),
        api.getResults(docId).catch(() => []),
        api.getHistory(docId).catch(() => []),
      ]);
      return { doc, results, history };
    } catch (err: any) {
      return rejectWithValue(err.message || "Failed to load document details");
    }
  }
);

export const approveDocument = createAsyncThunk(
  "documents/approveDocument",
  async ({ docId, reviewer }: { docId: string; reviewer?: string }, { dispatch, rejectWithValue }) => {
    try {
      const res = await api.approve(docId, reviewer);
      dispatch(fetchDocuments());
      dispatch(fetchStats());
      return res;
    } catch (err: any) {
      return rejectWithValue(err.message || "Approval failed");
    }
  }
);

export const reconcileDocument = createAsyncThunk(
  "documents/reconcileDocument",
  async (
    {
      docId,
      payload,
    }: {
      docId: string;
      payload: { subtotal?: number; tax?: number; total?: number; action?: string; reviewer?: string };
    },
    { dispatch, rejectWithValue }
  ) => {
    try {
      const res = await api.reconcile(docId, payload);
      dispatch(fetchDocuments());
      dispatch(fetchStats());
      return res;
    } catch (err: any) {
      return rejectWithValue(err.message || "Reconciliation failed");
    }
  }
);

export const rejectDocument = createAsyncThunk(
  "documents/rejectDocument",
  async (
    { docId, reason, reviewer }: { docId: string; reason?: string; reviewer?: string },
    { dispatch, rejectWithValue }
  ) => {
    try {
      const res = await api.reject(docId, reason, reviewer);
      dispatch(fetchDocuments());
      dispatch(fetchStats());
      return res;
    } catch (err: any) {
      return rejectWithValue(err.message || "Rejection failed");
    }
  }
);

export const deleteDocument = createAsyncThunk(
  "documents/deleteDocument",
  async (docId: string, { dispatch, rejectWithValue }) => {
    try {
      await api.deleteDocument(docId);
      dispatch(fetchDocuments());
      dispatch(fetchStats());
      return docId;
    } catch (err: any) {
      return rejectWithValue(err.message || "Delete failed");
    }
  }
);

export const documentsSlice = createSlice({
  name: "documents",
  initialState,
  reducers: {
    setStatusFilter(state, action: PayloadAction<"All" | "Needs Review" | "Completed" | "Processing" | "Failed">) {
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
      state.page = action.payload;
    },
    toggleSelectId(state, action: PayloadAction<string>) {
      const id = action.payload;
      if (state.selectedIds.includes(id)) {
        state.selectedIds = state.selectedIds.filter((x) => x !== id);
      } else {
        state.selectedIds.push(id);
      }
    },
    selectAllIds(state, action: PayloadAction<string[]>) {
      state.selectedIds = action.payload;
    },
    clearSelection(state) {
      state.selectedIds = [];
    },
  },
  extraReducers: (builder) => {
    builder
      // fetchDocuments
      .addCase(fetchDocuments.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchDocuments.fulfilled, (state, action) => {
        state.loading = false;
        state.items = action.payload || [];
      })
      .addCase(fetchDocuments.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })

      // fetchStats
      .addCase(fetchStats.fulfilled, (state, action) => {
        state.stats = action.payload;
      })

      // fetchDocumentDetails
      .addCase(fetchDocumentDetails.pending, (state) => {
        state.detailsLoading = true;
        state.error = null;
      })
      .addCase(fetchDocumentDetails.fulfilled, (state, action) => {
        state.detailsLoading = false;
        state.currentDoc = action.payload.doc;
        state.currentResults = action.payload.results;
        state.currentHistory = action.payload.history;
      })
      .addCase(fetchDocumentDetails.rejected, (state, action) => {
        state.detailsLoading = false;
        state.error = action.payload as string;
      })

      // deleteDocument
      .addCase(deleteDocument.fulfilled, (state, action) => {
        state.items = state.items.filter((d) => d.id !== action.payload);
        if (state.currentDoc?.id === action.payload) {
          state.currentDoc = null;
        }
      });
  },
});

export const {
  setStatusFilter,
  setTypeFilter,
  setSearchQuery,
  setPage,
  toggleSelectId,
  selectAllIds,
  clearSelection,
} = documentsSlice.actions;

export default documentsSlice.reducer;

