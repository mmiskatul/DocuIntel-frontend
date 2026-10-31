import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { api } from "@/lib/api";
import type { CrossVerifyReport } from "@/lib/types";
import { fetchDocuments, fetchStats } from "./documentsSlice";
import { notify } from "./notificationsSlice";

export interface VerifyState {
  left: string;
  right: string;
  report: CrossVerifyReport | null;
  /** "compare" = read-only; "flag" = the user asked to send the differences to review */
  running: "compare" | "flag" | null;
  error: string | null;
}

const initialState: VerifyState = { left: "", right: "", report: null, running: null, error: null };

/**
 * Comparing never changes any document. Only `flag: true` (the "Send to review" button, pressed after the user has seen
 * the differences) marks the mismatching invoices for review.
 */
export const runCrossVerify = createAsyncThunk<CrossVerifyReport, { flag: boolean }, { state: { verify: VerifyState }; rejectValue: string }>(
  "verify/run",
  async ({ flag }, { getState, dispatch, rejectWithValue }) => {
    const { left, right } = getState().verify;
    try {
      const report = await api.crossVerify(left, right, flag);
      if (flag) {
        const n = report.flagged_results;
        dispatch(notify(n > 0 ? "success" : "info", n > 0
          ? `${n} invoice${n === 1 ? "" : "s"} sent to review. They are marked in both documents.`
          : "Nothing needed to be sent: the differing invoices are already in review."));
        dispatch(fetchDocuments() as any);
        dispatch(fetchStats() as any);
      }
      return report;
    } catch (err) {
      return rejectWithValue(err instanceof Error ? err.message : "The comparison failed");
    }
  },
);

/** The choices and the result stay when you leave the page and come back. */
export const verifySlice = createSlice({
  name: "verify",
  initialState,
  reducers: {
    setLeft(state, action: PayloadAction<string>) {
      state.left = action.payload;
      state.report = null;
      state.error = null;
    },
    setRight(state, action: PayloadAction<string>) {
      state.right = action.payload;
      state.report = null;
      state.error = null;
    },
    swapSides(state) {
      [state.left, state.right] = [state.right, state.left];
      state.report = null;
      state.error = null;
    },
    clearReport(state) {
      state.report = null;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(runCrossVerify.pending, (state, action) => {
        state.running = action.meta.arg.flag ? "flag" : "compare";
        state.error = null;
        if (!action.meta.arg.flag) state.report = null; // a fresh comparison starts from a clean page
      })
      .addCase(runCrossVerify.fulfilled, (state, action) => {
        state.running = null;
        state.report = action.payload;
      })
      .addCase(runCrossVerify.rejected, (state, action) => {
        state.running = null;
        state.error = action.payload ?? "The comparison failed";
      });
  },
});

export const { setLeft, setRight, swapSides, clearReport } = verifySlice.actions;
export default verifySlice.reducer;
