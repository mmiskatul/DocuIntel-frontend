"use client";

import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { useAppSelector } from "@/store";

/** A centred spinner with a label while the user is waiting for something slow (a delete, for example). It blocks clicks behind it. */
export function BusyOverlay() {
  const pending = useAppSelector((s) => s.ui.pending);
  const ref = useRef<HTMLDivElement>(null);
  const active = pending.length > 0;

  useEffect(() => {
    if (active) ref.current?.focus(); // keeps the keyboard from wandering behind the overlay
  }, [active]);

  if (!active) return null;
  const label = pending.length === 1 ? pending[0].label : `${pending.length} tasks running…`;
  return (
    <div className="overlay" role="alertdialog" aria-modal="true" aria-live="assertive" aria-busy="true" aria-label={label}>
      <div className="overlay-card" ref={ref} tabIndex={-1}>
        <Loader2 size={34} className="spin" />
        <strong>{label}</strong>
        <span>Please wait. This takes a few seconds.</span>
      </div>
    </div>
  );
}
