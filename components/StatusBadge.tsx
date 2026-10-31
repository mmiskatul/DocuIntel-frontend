import { STAGE_LABEL, STATUS_LABEL } from "@/lib/format";
import type { DocumentOut } from "@/lib/types";

export function StatusBadge({ status }: { status: string }) {
  return <span className={`badge b-${status}`}>{STATUS_LABEL[status] ?? status}</span>;
}

export function ProgressBar({ doc }: { doc: Pick<DocumentOut, "status" | "progress" | "stage" | "pages_done" | "page_count"> }) {
  const pct = Math.round((doc.status === "completed" || doc.status === "needs_review" ? 1 : doc.progress) * 100);
  const cls = doc.status === "failed" || doc.status === "rejected" ? "fail" : pct >= 100 ? "done" : "";
  const label =
    doc.status === "processing"
      ? `${STAGE_LABEL[doc.stage] ?? doc.stage}${doc.page_count > 1 ? ` · ${doc.pages_done}/${doc.page_count} pages` : ""}`
      : doc.status === "queued" ? "Waiting in queue" : "";
  return (
    <div>
      <div className={`progress ${cls}`} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <i style={{ width: `${cls === "fail" ? 100 : pct}%` }} />
      </div>
      {label && <div className="small muted" style={{ marginTop: 3 }}>{label}</div>}
    </div>
  );
}
