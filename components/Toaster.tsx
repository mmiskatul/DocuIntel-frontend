"use client";

import { useEffect, useRef } from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/store";
import { dismissToast, type Toast } from "@/store/notificationsSlice";

const LIFETIME = { success: 5000, info: 6000, error: 9000 } as const;
const ICON = { success: CheckCircle2, info: Info, error: AlertTriangle } as const;

function ToastItem({ toast }: { toast: Toast }) {
  const dispatch = useAppDispatch();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const start = () => { timer.current = setTimeout(() => dispatch(dismissToast(toast.id)), LIFETIME[toast.kind]); };
  const stop = () => { if (timer.current) clearTimeout(timer.current); };
  useEffect(() => { start(); return stop; }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const Icon = ICON[toast.kind];
  return (
    <div className={`toast toast-${toast.kind}`} role={toast.kind === "error" ? "alert" : "status"} onMouseEnter={stop} onMouseLeave={start}>
      <Icon size={17} />
      <div>{toast.text}</div>
      <button type="button" className="btn-icon" aria-label="Dismiss" onClick={() => dispatch(dismissToast(toast.id))}><X size={15} /></button>
    </div>
  );
}

/** Every confirmation and error from every page appears here, in one place, and fades after a few seconds. */
export function Toaster() {
  const toasts = useAppSelector((s) => s.notifications.toasts);
  return (
    <div className="toaster" aria-live="polite">
      {toasts.map((t) => <ToastItem key={t.id} toast={t} />)}
    </div>
  );
}
