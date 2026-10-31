import { createSlice, nanoid, type PayloadAction } from "@reduxjs/toolkit";

export type ToastKind = "success" | "error" | "info";
export interface Toast {
  id: string;
  kind: ToastKind;
  text: string;
}

const MAX_TOASTS = 4;

export const notificationsSlice = createSlice({
  name: "notifications",
  initialState: { toasts: [] as Toast[] },
  reducers: {
    /** Shows a message. The same text is not stacked twice. */
    notify: {
      reducer(state, action: PayloadAction<Toast>) {
        if (state.toasts.some((t) => t.kind === action.payload.kind && t.text === action.payload.text)) return;
        state.toasts.push(action.payload);
        if (state.toasts.length > MAX_TOASTS) state.toasts.shift();
      },
      prepare(kind: ToastKind, text: string) {
        return { payload: { id: nanoid(), kind, text } };
      },
    },
    dismissToast(state, action: PayloadAction<string>) {
      state.toasts = state.toasts.filter((t) => t.id !== action.payload);
    },
  },
});

export const { notify, dismissToast } = notificationsSlice.actions;
export default notificationsSlice.reducer;
