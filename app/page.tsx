"use client";

import { useRouter } from "next/navigation";
import { Download, RefreshCw, Search, TriangleAlert } from "lucide-react";
import { DocTable } from "@/components/DocTable";
import { UploadZone } from "@/components/UploadZone";
import { duration } from "@/lib/format";
import { useAppDispatch, useAppSelector } from "@/store";
import {
  deleteDocument,
  selectAllIds,
  selectCounts,
  selectItems,
  selectPageInfo,
  setPage,
  setSearchQuery,
  setStatusFilter,
  setTypeFilter,
  syncNow,
  toggleSelectId,
  type StatusFilter,
} from "@/store/documentsSlice";
import { notify } from "@/store/notificationsSlice";
import type { DocumentOut } from "@/lib/types";

export default function DocumentsPage() {
  const router = useRouter();
  const dispatch = useAppDispatch();

  // Everything on this page is read from the store; the sync loop keeps it current, so coming back to this page is instant.
  const { statusFilter, typeFilter, searchQuery, selectedIds, listLoaded, listLoading, error, stats } = useAppSelector((s) => s.documents);
  const items = useAppSelector(selectItems);
  const { rows, total, totalPages, page, pageSize } = useAppSelector(selectPageInfo);
  const count = useAppSelector(selectCounts);

  const toggleAll = () => {
    const ids = rows.map((d) => d.id);
    dispatch(selectAllIds(ids.every((id) => selectedIds.includes(id)) ? [] : ids));
  };

  const exportCsv = () => {
    const target = selectedIds.length ? items.filter((d) => selectedIds.includes(d.id)) : items;
    if (!target.length) return;
    const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const head = ["Document ID", "Filename", "Supplier", "Invoice number", "Invoice date", "Total", "Currency", "Status"].map(cell).join(",");
    const lines = target.map((d) => [d.id, d.filename, d.summary?.supplier_name, d.summary?.invoice_number, d.summary?.invoice_date, d.summary?.total, d.summary?.currency, d.status].map(cell).join(","));
    const url = URL.createObjectURL(new Blob([[head, ...lines].join("\r\n")], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `docuintel_export_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    dispatch(notify("success", `Exported ${target.length} document${target.length === 1 ? "" : "s"} to CSV.`));
  };

  const remove = (d: DocumentOut) => {
    if (confirm(`Delete ${d.filename}? This cannot be undone.`)) void dispatch(deleteDocument({ id: d.id, filename: d.filename }));
  };

  const STRIP: { key: StatusFilter; label: string; n: number; tone: string }[] = [
    { key: "All", label: "All documents", n: count.all, tone: "" },
    { key: "Needs Review", label: "Needs review", n: count.review, tone: count.review ? "review" : "" },
    { key: "Completed", label: "Verified", n: count.done, tone: count.done ? "ok" : "" },
    { key: "Processing", label: "In progress", n: count.work, tone: count.work ? "work" : "" },
    { key: "Failed", label: "Failed or rejected", n: count.bad, tone: count.bad ? "bad" : "" },
  ];

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
          {stats?.avg_processing_ms != null ? `Average processing time ${duration(stats.avg_processing_ms)}` : ""}
        </div>
      </div>

      <UploadZone />

      <div className="strip" role="group" aria-label="Filter by status" style={{ margin: "20px 0 14px" }}>
        {STRIP.map((t) => (
          <button key={t.key} type="button" aria-pressed={statusFilter === t.key} onClick={() => dispatch(setStatusFilter(t.key))}>
            <span className="eyebrow">{t.label}</span>
            <span className={`n ${t.tone}`}>{t.n.toLocaleString()}</span>
          </button>
        ))}
      </div>

      {error && listLoaded && items.length > 0 && (
        <div className="alert alert-warn" role="status">
          <TriangleAlert size={16} />
          <div>Could not refresh the list ({error}). Showing the last version we have; it will retry automatically.</div>
        </div>
      )}

      <div className="card">
        <div className="card-head" style={{ gap: 10, flexWrap: "wrap" }}>
          <label className="search-box">
            <Search size={15} />
            <input className="input" type="search" placeholder="Search by file name, supplier or invoice number" value={searchQuery}
              aria-label="Search documents" onChange={(e) => dispatch(setSearchQuery(e.target.value))} />
          </label>
          <select className="select" style={{ width: 150 }} value={typeFilter} aria-label="File type" onChange={(e) => dispatch(setTypeFilter(e.target.value))}>
            <option value="All">All file types</option>
            <option value="pdf">PDF</option>
            <option value="image">Images</option>
            <option value="sheet">Spreadsheets</option>
          </select>
          <button type="button" className="btn-icon" title="Refresh now" aria-label="Refresh" onClick={() => void dispatch(syncNow())}>
            <RefreshCw size={16} className={listLoading ? "spin" : undefined} />
          </button>
          <button type="button" className="btn" onClick={exportCsv} disabled={!items.length}>
            <Download size={15} /> {selectedIds.length ? `Export ${selectedIds.length} selected` : "Export CSV"}
          </button>
        </div>

        <DocTable
          docs={rows}
          selectedIds={selectedIds}
          onToggleSelect={(id) => dispatch(toggleSelectId(id))}
          onSelectAll={toggleAll}
          onViewDoc={(d) => router.push(`/documents/${d.id}`)}
          onChatDoc={(d) => router.push(`/search?q=${encodeURIComponent(d.filename)}`)}
          onDeleteDoc={remove}
          loading={!listLoaded}
          emptyHint={error && !items.length ? `Could not load documents: ${error}` : searchQuery || statusFilter !== "All" || typeFilter !== "All"
            ? "Nothing matches these filters." : "Upload an invoice above to see it here."}
        />

        <div className="table-foot">
          <span className="muted small">{total === 0 ? "0 documents" : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}`}</span>
          <div className="pager" role="navigation" aria-label="Pages">
            <button type="button" disabled={page <= 1} onClick={() => dispatch(setPage(page - 1))}>Prev</button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((n) => n === 1 || n === totalPages || Math.abs(n - page) <= 1)
              .map((n, i, arr) => (
                <span key={n} style={{ display: "contents" }}>
                  {i > 0 && n - arr[i - 1] > 1 && <span className="muted">…</span>}
                  <button type="button" aria-current={n === page ? "page" : undefined} onClick={() => dispatch(setPage(n))}>{n}</button>
                </span>
              ))}
            <button type="button" disabled={page >= totalPages} onClick={() => dispatch(setPage(page + 1))}>Next</button>
          </div>
        </div>
      </div>
    </div>
  );
}
