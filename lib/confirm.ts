import type { AppDispatch } from "@/store";
import { closeConfirm, openConfirm, type ConfirmRequest } from "@/store/uiSlice";

/**
 * Asks the user to confirm something in the in-app popup (components/ConfirmDialog.tsx) and resolves to true or false.
 * The store holds only the text to show; the pending answer lives here, because a promise is not serialisable state.
 *
 *   if (await askConfirm(dispatch, { title: "Delete this document?", ... })) { ... }
 */
let pending: ((ok: boolean) => void) | null = null;

export function askConfirm(dispatch: AppDispatch, request: Omit<ConfirmRequest, "tone"> & { tone?: ConfirmRequest["tone"] }): Promise<boolean> {
  pending?.(false); // a newer question replaces an unanswered one
  dispatch(openConfirm({ tone: "danger", ...request }));
  return new Promise<boolean>((resolve) => { pending = resolve; });
}

/** Called by the popup when the user answers (or dismisses it). */
export function settleConfirm(dispatch: AppDispatch, ok: boolean): void {
  const resolve = pending;
  pending = null;
  dispatch(closeConfirm());
  resolve?.(ok);
}
