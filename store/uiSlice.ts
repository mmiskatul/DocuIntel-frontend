import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export type ViewMode = "preview" | "page_text" | "all_text";
export type Connection = "unknown" | "online" | "offline";

export interface UiState {
  /** document viewer preferences (kept between visits) */
  zoom: number;
  viewMode: ViewMode;
  /** is the backend reachable? Set by the sync loop, shown in the top bar */
  connection: Connection;
  /** slow work the user is waiting for (for example a delete): shown as a centred spinner with its label */
  pending: { id: string; label: string }[];
}

const initialState: UiState = { zoom: 100, viewMode: "preview", connection: "unknown", pending: [] };

export const uiSlice = createSlice({
  name: "ui",
  initialState,
  reducers: {
    setZoom(state, action: PayloadAction<number>) {
      state.zoom = Math.min(200, Math.max(50, Math.round(action.payload)));
    },
    setViewMode(state, action: PayloadAction<ViewMode>) {
      state.viewMode = action.payload;
    },
    setConnection(state, action: PayloadAction<Connection>) {
      state.connection = action.payload;
    },
    startPending(state, action: PayloadAction<{ id: string; label: string }>) {
      state.pending = [...state.pending.filter((p) => p.id !== action.payload.id), action.payload];
    },
    updatePending(state, action: PayloadAction<{ id: string; label: string }>) {
      const p = state.pending.find((x) => x.id === action.payload.id);
      if (p) p.label = action.payload.label;
    },
    endPending(state, action: PayloadAction<string>) {
      state.pending = state.pending.filter((p) => p.id !== action.payload);
    },
  },
});

export const { setZoom, setViewMode, setConnection, startPending, updatePending, endPending } = uiSlice.actions;
export default uiSlice.reducer;
