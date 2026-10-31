import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export type ViewMode = "preview" | "page_text" | "all_text";
export type Connection = "unknown" | "online" | "offline";

export interface UiState {
  /** document viewer preferences (kept between visits) */
  zoom: number;
  viewMode: ViewMode;
  /** is the backend reachable? Set by the sync loop, shown in the top bar */
  connection: Connection;
}

const initialState: UiState = { zoom: 100, viewMode: "preview", connection: "unknown" };

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
  },
});

export const { setZoom, setViewMode, setConnection } = uiSlice.actions;
export default uiSlice.reducer;
