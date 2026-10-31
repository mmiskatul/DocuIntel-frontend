import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { api } from "@/lib/api";
import type { CrossVerifyReport } from "@/lib/types";
import { fetchDocuments, fetchStats } from "./documentsSlice";
import { notify } from "./notificationsSlice";

export interface VerifyState {
  left: string;
  right: string;
  flag: boolean;
  report: CrossVerifyReport | null;
  running: boolean;
  error: string | null;
}

const initialState: VerifyState = { left: "", right: "", flag: true, report: null, running: false, error: null };

export const runCrossVerify = createAsyncThunk<CrossVerifyReport, void, { state: { verify: VerifyState }; rejectValue: string }>(
  "verify/run",
  async (_, { getState, dispatch, rejectWithValue }) => {
    const { left, right, flag } = getState().verify;
    try {
      const report = await api.crossVerify(left, right, flag);
      if (report.flagged_results > 0) {
        dispatch(notify("info", `${report.flagged_results} invoice${report.flagged_results === 1 ? "" : "s"} sent to review.`));
        dispatch(fetchDocuments() as any);
        dispatch(fetchStats() as any);
      }
      return report;
    } catch (err) {
      return rejectWithValue(err instanceof Error ? err.message : "The comparison failed");
    }
  },
);

/** The comparison stays on screen when you leave the page and come back. */
export const verifySlice = createSlice({
  name: "verify",
  initialState,
  reducers: {
    setLeft(state, action: PayloadAction<string>) {
      state.left = action.payload;
      state.report = null;
    },
    setRight(state, action: PayloadAction<string>) {
      state.right = action.payload;
      state.report = null;
    },
    setFlag(state, action: PayloadAction<boolean>) {
      state.flag = action.payload;
    },
    clearReport(state) {
      state.report = null;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(runCrossVerify.pending, (state) => {
        state.running = true;
        state.error = null;
        state.report = null;
      })
      .addCase(runCrossVerify.fulfilled, (state, action) => {
        state.running = false;
        state.report = action.payload;
      })
      .addCase(runCrossVerify.rejected, (state, action) => {
        state.running = false;
        state.error = action.payload ?? "The comparison failed";
      });
  },
});

export const { setLeft, setRight, setFlag, clearReport } = verifySlice.actions;
export default verifySlice.reducer;
