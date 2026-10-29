"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { DocTable } from "@/components/DocTable";
import { DocModal } from "@/components/DocModal";
import { UploadZone } from "@/components/UploadZone";
import { api } from "@/lib/api";
import { IN_FLIGHT, type DocumentOut } from "@/lib/types";
import { usePolling } from "@/lib/usePolling";

export default function DocumentsDashboard() {
  // Filters & Search
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [typeFilter, setTypeFilter] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Document modal & selection state
  const [selectedDoc, setSelectedDoc] = useState<DocumentOut | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [notice, setNotice] = useState<{ type: "success" | "info" | "error"; text: string } | null>(null);
  const [isBatchBusy, setIsBatchBusy] = useState<boolean>(false);

  // Live polling of documents and statistics
  const docs = usePolling<DocumentOut[]>(
    () => api.listDocuments({ q: searchQuery || undefined }),
    (d) => (d?.some((x) => IN_FLIGHT.includes(x.status)) ? 1500 : 5000),
    [searchQuery],
  );
  const stats = usePolling(() => api.stats(), () => 5000);
  const rawList = docs.data ?? [];
  const s = stats.data;

  // Filtered documents list
  const filteredList = useMemo(() => {
    return rawList.filter((d) => {
      // Status filter
      if (statusFilter !== "All") {
        if (statusFilter === "Processing" && d.status !== "processing" && d.status !== "queued") return false;
        if (statusFilter === "Needs Review" && d.status !== "needs_review") return false;
        if (statusFilter === "Completed" && d.status !== "completed") return false;
        if (statusFilter === "Failed" && d.status !== "failed") return false;
      }

      // Document Type filter
      if (typeFilter !== "All") {
        const isPO = (d.filename || "").toUpperCase().startsWith("PO");
        if (typeFilter === "Invoice" && isPO) return false;
        if (typeFilter === "Purchase Order" && !isPO) return false;
      }

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const fn = (d.filename || "").toLowerCase();
        const supp = (d.summary?.supplier_name || "").toLowerCase();
        const inv = (d.summary?.invoice_number || "").toLowerCase();
        if (!fn.includes(q) && !supp.includes(q) && !inv.includes(q)) return false;
      }

      return true;
    });
  }, [rawList, statusFilter, typeFilter, searchQuery]);

  // Selection handlers
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const selectAll = () => {
    if (selectedIds.length === filteredList.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredList.map((d) => d.id));
    }
  };

  // Batch actions
  const handleBatchApprove = async () => {
    if (!selectedIds.length) return;
    setIsBatchBusy(true);
    try {
      const res = await api.batchApprove(selectedIds, "reviewer@docuintel.com");
      setNotice({
        type: "success",
        text: `Successfully approved ${res.count} document(s).`,
      });
      setSelectedIds([]);
      void docs.refresh();
      void stats.refresh();
    } catch (err: any) {
      setNotice({ type: "error", text: `Batch approval failed: ${err.message}` });
    } finally {
      setIsBatchBusy(false);
    }
  };

  const handleBatchDelete = async () => {
    if (!selectedIds.length) return;
    if (!confirm(`Permanently delete ${selectedIds.length} document(s)?`)) return;
    setIsBatchBusy(true);
    try {
      for (const id of selectedIds) {
        await api.deleteDocument(id);
      }
      setNotice({
        type: "success",
        text: `Deleted ${selectedIds.length} document(s).`,
      });
      setSelectedIds([]);
      void docs.refresh();
      void stats.refresh();
    } catch (err: any) {
      setNotice({ type: "error", text: `Delete failed: ${err.message}` });
    } finally {
      setIsBatchBusy(false);
    }
  };

  const handleExportCSV = () => {
    const targetDocs = selectedIds.length
      ? rawList.filter((d) => selectedIds.includes(d.id))
      : rawList;

    if (!targetDocs.length) return;

    const headers = ["Document ID", "Filename", "Type", "Vendor", "Date", "Amount", "Currency", "Status"];
    const rows = targetDocs.map((d) => [
      `"${d.id}"`,
      `"${d.filename}"`,
      `"${(d.filename || "").toUpperCase().startsWith("PO") ? "Purchase Order" : "Invoice"}"`,
      `"${d.summary?.supplier_name || "—"}"`,
      `"${d.summary?.invoice_date || d.created_at?.slice(0, 10) || ""}"`,
      d.summary?.total ?? 0,
      `"${d.summary?.currency || "USD"}"`,
      `"${d.status}"`,
    ]);

    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `documents_export_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setNotice({
      type: "success",
      text: `Exported ${targetDocs.length} document record(s) to CSV.`,
    });
  };

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", paddingBottom: 60 }}>
      {/* Page Header */}
      <div className="page-head">
        <div>
          <h1>Document Intelligence</h1>
          <p className="muted" style={{ margin: "4px 0 0" }}>
            Upload invoices and PDFs. LangChain extracts structured line items, calculates totals, and indexes vector embeddings.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Link href="/search" className="btn btn-primary">
            🔍 AI Search &amp; RAG
          </Link>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid-stats">
        <div className="stat">
          <div className="n">{s?.total ?? rawList.length}</div>
          <div className="l">Total Documents</div>
        </div>
        <div className="stat">
          <div className="n" style={{ color: "var(--green)" }}>
            {s?.by_status?.completed ?? rawList.filter((d) => d.status === "completed").length}
          </div>
          <div className="l">Completed</div>
        </div>
        <div className="stat">
          <div className="n" style={{ color: "var(--amber)" }}>
            {s?.open_review_items ?? s?.by_status?.needs_review ?? rawList.filter((d) => d.status === "needs_review").length}
          </div>
          <div className="l">Needs Review</div>
        </div>
        <div className="stat">
          <div className="n" style={{ color: "var(--primary)" }}>
            {((s?.by_status?.processing ?? 0) + (s?.by_status?.queued ?? 0)) || rawList.filter((d) => IN_FLIGHT.includes(d.status)).length}
          </div>
          <div className="l">Processing</div>
        </div>
      </div>

      {/* Upload Zone Card */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>
          📤 Upload Invoices &amp; Documents
        </h2>
        <UploadZone
          onUploaded={() => {
            void docs.refresh();
            void stats.refresh();
            setNotice({ type: "success", text: "Files uploaded! LangChain OCR and extraction pipeline running in background." });
          }}
        />
      </div>

      {/* Notification Banner */}
      {notice && (
        <div
          className={`alert ${notice.type === "success" ? "alert-ok" : notice.type === "error" ? "alert-error" : "alert-info"}`}
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}
        >
          <span>{notice.text}</span>
          <button
            onClick={() => setNotice(null)}
            style={{ background: "none", border: "none", cursor: "pointer", fontWeight: 700, color: "inherit" }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Batch Action Toolbar */}
      {selectedIds.length > 0 && (
        <div
          style={{
            background: "#1e293b",
            color: "#ffffff",
            padding: "10px 16px",
            borderRadius: 8,
            marginBottom: 16,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>
              {selectedIds.length} document{selectedIds.length > 1 ? "s" : ""} selected
            </span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={handleBatchApprove}
              disabled={isBatchBusy}
              className="btn btn-sm"
              style={{ background: "var(--green)", color: "#ffffff", border: "none" }}
            >
              {isBatchBusy ? "Approving..." : "✓ Approve"}
            </button>
            <button
              onClick={handleExportCSV}
              className="btn btn-sm"
              style={{ background: "#334155", color: "#ffffff", border: "none" }}
            >
              📥 Export CSV
            </button>
            <button
              onClick={handleBatchDelete}
              disabled={isBatchBusy}
              className="btn btn-sm"
              style={{ background: "var(--red)", color: "#ffffff", border: "none" }}
            >
              🗑️ Delete Selected
            </button>
            <button
              onClick={() => setSelectedIds([])}
              className="btn btn-sm"
              style={{ background: "transparent", color: "#94a3b8", border: "1px solid #475569" }}
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Documents Table Container */}
      <div className="card card-flush">
        <div className="card-head">
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", flex: 1 }}>
            {/* Search Input */}
            <input
              type="text"
              placeholder="🔍 Search documents, vendors, or invoice #..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ maxWidth: 300, fontSize: 13 }}
            />

            {/* Status Filter Buttons */}
            <div className="seg">
              {(["All", "Needs Review", "Completed", "Processing", "Failed"] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  className={statusFilter === st ? "on" : ""}
                  onClick={() => setStatusFilter(st)}
                  style={{ fontSize: 12, padding: "5px 12px" }}
                >
                  {st}
                </button>
              ))}
            </div>

            {/* Type Selector */}
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              style={{ width: "auto", fontSize: 12, padding: "5px 10px" }}
            >
              <option value="All">All Document Types</option>
              <option value="Invoice">Invoices Only</option>
              <option value="Purchase Order">Purchase Orders Only</option>
            </select>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={() => void docs.refresh()} className="btn btn-sm" title="Refresh document list">
              🔄 Refresh
            </button>
            <button onClick={handleExportCSV} className="btn btn-sm" title="Export displayed records to CSV">
              📥 Export CSV
            </button>
          </div>
        </div>

        {/* Documents Table */}
        {docs.loading && !docs.data ? (
          <div className="empty" style={{ padding: "30px" }}>Loading documents...</div>
        ) : (
          <DocTable
            docs={filteredList}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onSelectAll={selectAll}
            onViewDoc={(d) => setSelectedDoc(d)}
            extra={(d) => (
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {d.status === "failed" && (
                  <button
                    onClick={async () => {
                      await api.reprocess(d.id);
                      void docs.refresh();
                    }}
                    className="btn btn-sm btn-danger"
                  >
                    Retry
                  </button>
                )}
                <button
                  type="button"
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (confirm(`Permanently delete ${d.filename}?`)) {
                      await api.deleteDocument(d.id);
                      void docs.refresh();
                      void stats.refresh();
                    }
                  }}
                  className="btn btn-sm"
                  style={{ color: "var(--red)", borderColor: "#fecaca", padding: "2px 7px", fontSize: 11 }}
                  title="Delete document"
                >
                  ✕
                </button>
              </div>
            )}
          />
        )}
      </div>

      {/* Document Detail & Preview Modal */}
      {selectedDoc && (
        <DocModal
          doc={selectedDoc}
          onClose={() => setSelectedDoc(null)}
          onDeleted={() => {
            void docs.refresh();
            void stats.refresh();
          }}
        />
      )}
    </div>
  );
}
