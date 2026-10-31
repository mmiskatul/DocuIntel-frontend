"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, Info, RefreshCw, Search, X } from "lucide-react";
import { DocTable } from "@/components/DocTable";
import { UploadZone } from "@/components/UploadZone";
import { api } from "@/lib/api";
import { duration, fileKind } from "@/lib/format";
import { IN_FLIGHT, type DocumentOut } from "@/lib/types";
import { usePolling } from "@/lib/usePolling";
import { useAppDispatch, useAppSelector } from "@/store";
import {
  deleteDocument,
  fetchDocuments,
  fetchStats,
  selectAllIds,
  setPage,
  setSearchQuery,
  setStatusFilter,
  setTypeFilter,
  toggleSelectId,
} from "@/store/documentsSlice";

type Notice = { type: "success" | "info" | "error"; text: string };

export default function DocumentsPage() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { statusFilter, typeFilter, searchQuery, page, pageSize, selectedIds } = useAppSelector((s) => s.documents);
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    dispatch(fetchDocuments());
    dispatch(fetchStats());
  }, [dispatch]);

  // Poll quickly while anything is being processed, slowly otherwise
  const docs = usePolling<DocumentOut[]>(
    () => api.listDocuments({ q: searchQuery || undefined, limit: 200 }),
    (d) => (d?.some((x) => IN_FLIGHT.includes(x.status)) ? 1500 : 5000),
    [searchQuery],
  );
  const stats = usePolling(() => api.stats(), () => 5000);
  const rawList = docs.data ?? [];
  const s = stats.data;

  const filtered = useMemo(() => rawList.filter((d) => {
    if (statusFilter === "Processing" && !IN_FLIGHT.includes(d.status)) return false;
    if (statusFilter === "Needs Review" && d.status !== "needs_review") return false;
    if (statusFilter === "Completed" && d.status !== "completed") return false;
    if (statusFilter === "Failed" && d.status !== "failed" && d.status !== "rejected") return false;
    if (typeFilter !== "All" && fileKind(d.file_type, d.filename).kind !== typeFilter) return false;
    return true;
  }), [rawList, statusFilter, typeFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = useMemo(() => filtered.slice((safePage - 1) * pageSize, safePage * pageSize), [filtered, safePage, pageSize]);

  const refresh = () => { void docs.refresh(); void stats.refresh(); };

  const toggleAll = () => {
    const ids = pageRows.map((d) => d.id);
    dispatch(selectAllIds(ids.every((id) => selectedIds.includes(id)) ? [] : ids));
  };

  const exportCsv = () => {
    const target = selectedIds.length ? rawList.filter((d) => selectedIds.includes(d.id)) : filtered;
    if (!target.length) return;
    const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = target.map((d) => [d.id, d.filename, d.summary?.supplier_name, d.summary?.invoice_number, d.summary?.invoice_date,
      d.summary?.total, d.summary?.currency, d.status].map(cell).join(","));
    const csv = [["Document ID", "Filename", "Supplier", "Invoice number", "Invoice date", "Total", "Currency", "Status"].map(cell).join(","), ...rows].join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `docuintel_export_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setNotice({ type: "success", text: `Exported ${target.length} document${target.length === 1 ? "" : "s"} to CSV.` });
  };

  const remove = async (d: DocumentOut) => {
    if (!confirm(`Delete ${d.filename}? This cannot be undone.`)) return;
    try {
      await dispatch(deleteDocument(d.id)).unwrap();
      refresh();
      setNotice({ type: "success", text: `Deleted ${d.filename}.` });
    } catch (err: any) {
      setNotice({ type: "error", text: `Could not delete ${d.filename}: ${err.message}` });
    }
  };

  const by = s?.by_status;
  const count = {
    all: s?.total ?? rawList.length,
    review: by?.needs_review ?? rawList.filter((d) => d.status === "needs_review").length,
    done: by?.completed ?? rawList.filter((d) => d.status === "completed").length,
    work: ((by?.processing ?? 0) + (by?.queued ?? 0)) || rawList.filter((d) => IN_FLIGHT.includes(d.status)).length,
    bad: ((by?.failed ?? 0) + (by?.rejected ?? 0)) || rawList.filter((d) => d.status === "failed" || d.status === "rejected").length,
  };
  const STRIP = [
    { key: "All", label: "All documents", n: count.all, tone: "" },
    { key: "Needs Review", label: "Needs review", n: count.review, tone: count.review ? "review" : "" },
    { key: "Completed", label: "Verified", n: count.done, tone: count.done ? "ok" : "" },
    { key: "Processing", label: "In progress", n: count.work, tone: count.work ? "work" : "" },
    { key: "Failed", label: "Failed or rejected", n: count.bad, tone: count.bad ? "bad" : "" },
  ] as const;

  const NoticeIcon = notice?.type === "error" ? AlertTriangle : notice?.type === "info" ? Info : CheckCircle2;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Documents</h1>
          <p className="page-sub">
            Upload invoices and waybills. Each one is read, checked against its own arithmetic, and held for review if the numbers do not add up.
          </p>
        </div>
        <div className="muted small mono">
          {s?.avg_processing_ms != null ? `Average processing time ${duration(s.avg_processing_ms)}` : ""}
        </div>
      </div>

      <UploadZone onUploaded={refresh} />

      <div className="strip" role="group" aria-label="Filter by status" style={{ margin: "20px 0 14px" }}>
        {STRIP.map((t) => (
          <button key={t.key} type="button" aria-pressed={statusFilter === t.key}
            onClick={() => { dispatch(setStatusFilter(t.key)); dispatch(setPage(1)); }}>
            <span className="eyebrow">{t.label}</span>
            <span className={`n ${t.tone}`}>{t.n.toLocaleString()}</span>
          </button>
        ))}
      </div>

      {notice && (
        <div className={`alert alert-${notice.type === "error" ? "error" : notice.type === "info" ? "info" : "ok"}`} role="status">
          <NoticeIcon size={16} />
          <div>{notice.text}</div>
          <button type="button" className="btn-icon" aria-label="Dismiss" onClick={() => setNotice(null)}><X size={15} /></button>
        </div>
      )}

      <div className="card">
        <div className="card-head" style={{ gap: 10, flexWrap: "wrap" }}>
          <label className="search-box">
            <Search size={15} />
            <input className="input" type="search" placeholder="Search by file name, supplier or invoice number"
              value={searchQuery} aria-label="Search documents"
              onChange={(e) => { dispatch(setSearchQuery(e.target.value)); dispatch(setPage(1)); }} />
          </label>
          <select className="select" style={{ width: 150 }} value={typeFilter} aria-label="File type"
            onChange={(e) => { dispatch(setTypeFilter(e.target.value)); dispatch(setPage(1)); }}>
            <option value="All">All file types</option>
            <option value="pdf">PDF</option>
            <option value="image">Images</option>
            <option value="sheet">Spreadsheets</option>
          </select>
          <button type="button" className="btn-icon" title="Refresh now" aria-label="Refresh" onClick={refresh}><RefreshCw size={16} /></button>
          <button type="button" className="btn" onClick={exportCsv} disabled={!filtered.length}>
            <Download size={15} /> {selectedIds.length ? `Export ${selectedIds.length} selected` : "Export CSV"}
          </button>
        </div>

        <DocTable
          docs={pageRows}
          selectedIds={selectedIds}
          onToggleSelect={(id) => dispatch(toggleSelectId(id))}
          onSelectAll={toggleAll}
          onViewDoc={(d) => router.push(`/documents/${d.id}`)}
          onChatDoc={(d) => router.push(`/search?q=${encodeURIComponent(d.filename)}`)}
          onDeleteDoc={remove}
          loading={docs.loading && !docs.data}
          emptyHint={searchQuery || statusFilter !== "All" || typeFilter !== "All"
            ? "Nothing matches these filters." : "Upload an invoice above to see it here."}
        />

        <div className="table-foot">
          <span className="muted small">
            {filtered.length === 0 ? "0 documents" : `${(safePage - 1) * pageSize + 1}–${Math.min(safePage * pageSize, filtered.length)} of ${filtered.length}`}
          </span>
          <div className="pager" role="navigation" aria-label="Pages">
            <button type="button" disabled={safePage <= 1} onClick={() => dispatch(setPage(safePage - 1))}>Prev</button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((n) => n === 1 || n === totalPages || Math.abs(n - safePage) <= 1)
              .map((n, i, arr) => (
                <span key={n} style={{ display: "contents" }}>
                  {i > 0 && n - arr[i - 1] > 1 && <span className="muted">…</span>}
                  <button type="button" aria-current={n === safePage ? "page" : undefined} onClick={() => dispatch(setPage(n))}>{n}</button>
                </span>
              ))}
            <button type="button" disabled={safePage >= totalPages} onClick={() => dispatch(setPage(safePage + 1))}>Next</button>
          </div>
        </div>
      </div>
    </div>
  );
}
