"use client";

import { useEffect, useRef } from "react";
import { Info, Trash2, TriangleAlert } from "lucide-react";
import { settleConfirm } from "@/lib/confirm";
import { useAppDispatch, useAppSelector } from "@/store";

/**
 * The confirmation popup, centred over a dimmed page. It replaces the browser's plain confirm box.
 * Cancel is focused first (so Enter never destroys anything by accident), Esc or a click outside cancels,
 * Tab stays inside the popup, and focus returns to the button that opened it.
 */
export function ConfirmDialog() {
  const dispatch = useAppDispatch();
  const request = useAppSelector((s) => s.ui.confirm);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const open = request !== null;

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden"; // the page behind must not scroll
    return () => {
      document.body.style.overflow = previousOverflow;
      opener.current?.focus?.();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        settleConfirm(dispatch, false);
      } else if (e.key === "Tab") {
        // keep keyboard focus between the two buttons
        const buttons = [cancelRef.current, confirmRef.current].filter(Boolean) as HTMLElement[];
        const i = buttons.indexOf(document.activeElement as HTMLElement);
        e.preventDefault();
        buttons[(i + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, dispatch]);

  if (!request) return null;
  const danger = request.tone === "danger";
  const Icon = request.icon === "trash" ? Trash2 : danger ? TriangleAlert : Info;

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) settleConfirm(dispatch, false); }}>
      <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message">
        <span className={`modal-icon ${danger ? "danger" : ""}`}><Icon size={22} /></span>
        <h2 id="confirm-title">{request.title}</h2>
        <p id="confirm-message">{request.message}</p>
        <div className="modal-actions">
          <button type="button" ref={cancelRef} className="btn" onClick={() => settleConfirm(dispatch, false)}>{request.cancelLabel ?? "Cancel"}</button>
          <button type="button" ref={confirmRef} className={`btn ${danger ? "btn-danger-solid" : "btn-primary"}`} onClick={() => settleConfirm(dispatch, true)}>
            {request.icon === "trash" && <Trash2 size={15} />}{request.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
