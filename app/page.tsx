"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { DocTable } from "@/components/DocTable";
import { DocModal } from "@/components/DocModal";
import { UploadZone } from "@/components/UploadZone";
import { api } from "@/lib/api";
import { IN_FLIGHT, type DocumentOut } from "@/lib/types";
import { usePolling } from "@/lib/usePolling";

export default function DocumentsDashboard() {
  const router = useRouter();

  // Filters & Search
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [typeFilter, setTypeFilter] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Modal & Selection state
  const [selectedDoc, setSelectedDoc] = useState<DocumentOut | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [notice, setNotice] = useState<{ type: "success" | "info" | "error"; text: string } | null>(null);

  // Pagination state
  const [page, setPage] = useState<number>(1);
  const pageSize = 8;

  // Live polling of documents and stats
  const docs = usePolling<DocumentOut[]>(
    () => api.listDocuments({ q: searchQuery || undefined }),
    (d) => (d?.some((x) => IN_FLIGHT.includes(x.status)) ? 1500 : 5000),
    [searchQuery],
  );
  const stats = usePolling(() => api.stats(), () => 5000);
  const rawList = docs.data ?? [];
  const s = stats.data;

  // Filtered documents
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
        const fn = (d.filename || "").toLowerCase();
        if (typeFilter === "Invoice" && (fn.startsWith("po") || fn.includes("freight") || fn.includes("audit"))) return false;
        if (typeFilter === "Purchase Order" && !fn.startsWith("po")) return false;
        if (typeFilter === "Receipt" && !fn.includes("receipt")) return false;
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

  // Paginated slice
  const paginatedList = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredList.slice(start, start + pageSize);
  }, [filteredList, page]);

  const totalPages = Math.max(1, Math.ceil(filteredList.length / pageSize));

  // Selection handlers
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const selectAll = () => {
    if (selectedIds.length === paginatedList.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(paginatedList.map((d) => d.id));
    }
  };

  const handleExportCSV = () => {
    const targetDocs = selectedIds.length
      ? rawList.filter((d) => selectedIds.includes(d.id))
      : filteredList;

    if (!targetDocs.length) return;

    const headers = ["Document ID", "Filename", "Vendor", "Date", "Amount", "Currency", "Status"];
    const rows = targetDocs.map((d) => [
      `"${d.id}"`,
      `"${d.filename}"`,
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
    a.download = `docuintel_export_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setNotice({ type: "success", text: `Exported ${targetDocs.length} records to CSV.` });
  };

  const handleDelete = async (d: DocumentOut) => {
    if (confirm(`Permanently delete ${d.filename}?`)) {
      try {
        await api.deleteDocument(d.id);
        void docs.refresh();
        void stats.refresh();
        setNotice({ type: "success", text: `Deleted ${d.filename}.` });
      } catch (err: any) {
        setNotice({ type: "error", text: `Delete failed: ${err.message}` });
      }
    }
  };

  // Dynamically computed metrics
  const totalCount = s?.total ?? rawList.length;
  const completedCount = s?.by_status?.completed ?? rawList.filter((d) => d.status === "completed").length;
  const needsReviewCount = s?.open_review_items ?? s?.by_status?.needs_review ?? rawList.filter((d) => d.status === "needs_review").length;
  const processingCount = ((s?.by_status?.processing ?? 0) + (s?.by_status?.queued ?? 0)) || rawList.filter((d) => IN_FLIGHT.includes(d.status)).length;

  // Dynamic percentage and badge calculations
  const totalBadgeText = totalCount > 0 ? "Active repository" : "0 indexed";
  const completedPct = totalCount > 0 ? ((completedCount / totalCount) * 100).toFixed(1) : "0.0";
  const completedBadgeText = `${completedPct}% parsed`;
  const needsReviewBadgeText = needsReviewCount > 0 ? `${needsReviewCount} urgent` : "0 pending";
  const processingBadgeText = processingCount > 0 ? `${processingCount} in queue` : "Queue clear";

  return (
    <div style={{ maxWidth: 1240, margin: "0 auto", paddingBottom: 60 }}>
      {/* 1. Page Header (Matches screenshot top section) */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: "#0f172a", margin: "0 0 6px 0", letterSpacing: "-0.3px" }}>
            Document Intelligence
          </h1>
          <p style={{ margin: 0, fontSize: 13, color: "#64748b", maxWidth: 780, lineHeight: 1.5 }}>
            Upload invoices, receipts, and contracts. Smart extraction isolates key-value tables, verifies totals, and enables instant search.
          </p>
        </div>

        {/* Right Active Engine Pill */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, alignSelf: "center" }}>
          <span style={{ fontSize: 12, color: "#64748b", fontWeight: 500 }}>Active Engine:</span>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: "#eff6ff",
              border: "1px solid #dbeafe",
              color: "#1e40af",
              padding: "4px 10px",
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            <span style={{ fontSize: 13 }}>ℹ</span>
            DocuIntel v2.4 Vision Engine
          </div>
          <Link href="/search" style={{ fontSize: 12, color: "#2563eb", fontWeight: 500, textDecoration: "none" }}>
            Config
          </Link>
        </div>
      </div>

      {/* 2. KPI 4-Card Grid (100% Dynamic data & percentages) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 16,
          marginBottom: 20,
        }}
      >
        {/* Card 1: Total Documents */}
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: 10,
            padding: "16px 20px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b", letterSpacing: "0.5px" }}>TOTAL DOCUMENTS</span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: totalCount > 0 ? "#059669" : "#64748b",
                background: totalCount > 0 ? "#ecfdf5" : "#f1f5f9",
                padding: "2px 8px",
                borderRadius: 12,
              }}
            >
              {totalBadgeText}
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: "#0f172a", letterSpacing: "-0.5px" }}>
              {totalCount.toLocaleString()}
            </div>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: "#eff6ff", display: "flex", alignItems: "center", justifyContent: "center", color: "#2563eb", fontWeight: 800, fontSize: 16 }}>
              D
            </div>
          </div>
          <div style={{ fontSize: 11.5, color: "#94a3b8" }}>
            {totalCount > 0 ? `Indexed across ${totalCount} document record${totalCount === 1 ? "" : "s"}` : "No documents indexed yet"}
          </div>
        </div>

        {/* Card 2: Completed */}
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: 10,
            padding: "16px 20px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#64748b", letterSpacing: "0.5px" }}>COMPLETED</span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: completedCount > 0 ? "#059669" : "#64748b",
                background: completedCount > 0 ? "#ecfdf5" : "#f1f5f9",
                padding: "2px 8px",
                borderRadius: 12,
              }}
            >
              {completedBadgeText}
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: "#16a34a", letterSpacing: "-0.5px" }}>
              {completedCount.toLocaleString()}
            </div>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: "#ecfdf5", display: "flex", alignItems: "center", justifyContent: "center", color: "#16a34a", fontSize: 18 }}>
              ✓
            </div>
          </div>
          <div style={{ fontSize: 11.5, color: "#94a3b8" }}>
            {completedCount > 0 ? `${completedCount} parsed & verified` : "No completed documents yet"}
          </div>
        </div>

        {/* Card 3: Needs Review */}
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: 10,
            padding: "16px 20px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#b45309", letterSpacing: "0.5px" }}>NEEDS REVIEW</span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: needsReviewCount > 0 ? "#b45309" : "#16a34a",
                background: needsReviewCount > 0 ? "#fef3c7" : "#ecfdf5",
                padding: "2px 8px",
                borderRadius: 12,
              }}
            >
              {needsReviewBadgeText}
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: "#d97706", letterSpacing: "-0.5px" }}>
              {needsReviewCount.toLocaleString()}
            </div>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: "#fffbeb", display: "flex", alignItems: "center", justifyContent: "center", color: "#d97706", fontSize: 16 }}>
              ⚠
            </div>
          </div>
          <div style={{ fontSize: 11.5, color: "#b45309" }}>
            {needsReviewCount > 0 ? `${needsReviewCount} document(s) with flagged variances` : "Zero discrepancy flags"}
          </div>
        </div>

        {/* Card 4: Processing */}
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: 10,
            padding: "16px 20px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#1d4ed8", letterSpacing: "0.5px" }}>PROCESSING</span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: processingCount > 0 ? "#2563eb" : "#64748b",
                background: processingCount > 0 ? "#eff6ff" : "#f1f5f9",
                padding: "2px 8px",
                borderRadius: 12,
              }}
            >
              {processingBadgeText}
            </span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: "#2563eb", letterSpacing: "-0.5px" }}>
              {processingCount.toLocaleString()}
            </div>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: "#eff6ff", display: "flex", alignItems: "center", justifyContent: "center", color: "#2563eb", fontSize: 16 }}>
              <span style={{ animation: "spin 1.5s linear infinite", display: "inline-block" }}>◌</span>
            </div>
          </div>
          <div style={{ fontSize: 11.5, color: "#94a3b8" }}>
            {processingCount > 0 ? `${processingCount} file(s) in active queue` : "Intake queue idle"}
          </div>
        </div>
      </div>

      {/* 3. Upload Invoices & Documents Card (Matches screenshot upload box) */}
      <div
        style={{
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: 10,
          padding: "20px 24px",
          marginBottom: 20,
          boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 16 }}>📥</span>
            <span style={{ fontSize: 14.5, fontWeight: 700, color: "#0f172a" }}>Upload Invoices &amp; Documents</span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "#475569",
                background: "#f1f5f9",
                border: "1px solid #e2e8f0",
                padding: "2px 8px",
                borderRadius: 4,
              }}
            >
              Auto-Processing Active
            </span>
          </div>

          <button
            type="button"
            onClick={() => router.push("/search")}
            style={{
              background: "none",
              border: "none",
              fontSize: 12,
              color: "#2563eb",
              fontWeight: 500,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <span>⚙</span> Ingestion Rules
          </button>
        </div>

        <UploadZone
          onUploaded={() => {
            void docs.refresh();
            void stats.refresh();
          }}
        />
      </div>

      {/* Notification Banner */}
      {notice && (
        <div
          style={{
            padding: "10px 16px",
            background: notice.type === "success" ? "#f0fdf4" : notice.type === "error" ? "#fef2f2" : "#eff6ff",
            border: `1px solid ${notice.type === "success" ? "#bbf7d0" : notice.type === "error" ? "#fecaca" : "#bfdbfe"}`,
            color: notice.type === "success" ? "#166534" : notice.type === "error" ? "#991b1b" : "#1e40af",
            borderRadius: 8,
            marginBottom: 16,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 13,
          }}
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

      {/* 4. Filter & Action Control Bar (Matches screenshot filter bar) */}
      <div
        style={{
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          borderBottom: "none",
          borderRadius: "10px 10px 0 0",
          padding: "14px 18px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        {/* Search Input Box */}
        <div style={{ position: "relative", minWidth: 280, flex: "1 1 280px", maxWidth: 360 }}>
          <span style={{ position: "absolute", left: 12, top: 9, color: "#94a3b8", fontSize: 14 }}>🔍</span>
          <input
            type="text"
            placeholder="Search documents, vendors, or invoice #..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              paddingLeft: 36,
              height: 38,
              fontSize: 13,
              borderRadius: 8,
              border: "1px solid #cbd5e1",
              backgroundColor: "#ffffff",
              width: "100%",
            }}
          />
        </div>

        {/* Segmented Filter Pills */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => setStatusFilter("All")}
            style={{
              height: 36,
              padding: "0 14px",
              borderRadius: 6,
              fontSize: 12.5,
              fontWeight: 600,
              cursor: "pointer",
              border: "none",
              background: statusFilter === "All" ? "#2563eb" : "#f1f5f9",
              color: statusFilter === "All" ? "#ffffff" : "#475569",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span>All</span>
            <span style={{ opacity: 0.9 }}>{totalCount.toLocaleString()}</span>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter("Needs Review")}
            style={{
              height: 36,
              padding: "0 14px",
              borderRadius: 6,
              fontSize: 12.5,
              fontWeight: 600,
              cursor: "pointer",
              border: "none",
              background: statusFilter === "Needs Review" ? "#2563eb" : "#f1f5f9",
              color: statusFilter === "Needs Review" ? "#ffffff" : "#475569",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span>Needs Review</span>
            <span style={{ color: statusFilter === "Needs Review" ? "#ffffff" : "#d97706", fontWeight: 700 }}>
              {needsReviewCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter("Completed")}
            style={{
              height: 36,
              padding: "0 14px",
              borderRadius: 6,
              fontSize: 12.5,
              fontWeight: 600,
              cursor: "pointer",
              border: "none",
              background: statusFilter === "Completed" ? "#2563eb" : "#f1f5f9",
              color: statusFilter === "Completed" ? "#ffffff" : "#475569",
            }}
          >
            Completed
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter("Processing")}
            style={{
              height: 36,
              padding: "0 14px",
              borderRadius: 6,
              fontSize: 12.5,
              fontWeight: 600,
              cursor: "pointer",
              border: "none",
              background: statusFilter === "Processing" ? "#2563eb" : "#f1f5f9",
              color: statusFilter === "Processing" ? "#ffffff" : "#475569",
            }}
          >
            Processing
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter("Failed")}
            style={{
              height: 36,
              padding: "0 14px",
              borderRadius: 6,
              fontSize: 12.5,
              fontWeight: 600,
              cursor: "pointer",
              border: "none",
              background: statusFilter === "Failed" ? "#2563eb" : "#f1f5f9",
              color: statusFilter === "Failed" ? "#ffffff" : "#475569",
            }}
          >
            Failed
          </button>
        </div>

        {/* Right Type Selector & Action Buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            style={{
              height: 36,
              fontSize: 12.5,
              padding: "0 10px",
              borderRadius: 6,
              border: "1px solid #cbd5e1",
              color: "#334155",
              cursor: "pointer",
              backgroundColor: "#ffffff",
              width: "auto",
            }}
          >
            <option value="All">All Document Types</option>
            <option value="Invoice">Invoices Only</option>
            <option value="Purchase Order">Purchase Orders</option>
            <option value="Receipt">Receipts</option>
          </select>

          {/* Refresh button */}
          <button
            type="button"
            onClick={() => {
              void docs.refresh();
              void stats.refresh();
            }}
            title="Refresh repository"
            style={{
              width: 36,
              height: 36,
              borderRadius: 6,
              border: "1px solid #cbd5e1",
              background: "#ffffff",
              color: "#475569",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 14,
            }}
          >
            🔄
          </button>

          {/* Export CSV button */}
          <button
            type="button"
            onClick={handleExportCSV}
            style={{
              height: 36,
              borderRadius: 6,
              border: "1px solid #cbd5e1",
              background: "#ffffff",
              color: "#334155",
              fontSize: 12.5,
              fontWeight: 600,
              padding: "0 12px",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span>⤓</span> Export CSV
          </button>
        </div>
      </div>

      {/* 5. Documents Table Box (Bordered & Connected to filter bar) */}
      <div
        style={{
          border: "1px solid #e2e8f0",
          borderTop: "none",
          borderRadius: "0 0 10px 10px",
          background: "#ffffff",
          overflow: "hidden",
          boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
        }}
      >
        <DocTable
          docs={paginatedList}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onSelectAll={selectAll}
          onViewDoc={(d) => router.push(`/documents/${d.id}`)}
          onChatDoc={(d) => router.push(`/search?q=${encodeURIComponent(d.filename)}`)}
          onDeleteDoc={handleDelete}
        />

        {/* 6. Table Footer with Entries Count & Pagination (Matches screenshot bottom of table) */}
        <div
          style={{
            padding: "14px 20px",
            borderTop: "1px solid #f1f5f9",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 12,
            fontSize: 12.5,
            color: "#64748b",
            background: "#ffffff",
          }}
        >
          <div>
            Showing <strong style={{ color: "#0f172a" }}>{filteredList.length === 0 ? 0 : (page - 1) * pageSize + 1}</strong> to{" "}
            <strong style={{ color: "#0f172a" }}>{Math.min(page * pageSize, filteredList.length)}</strong> of{" "}
            <strong style={{ color: "#0f172a" }}>{filteredList.length.toLocaleString()}</strong> entries{" "}
            <span style={{ color: "#94a3b8", marginLeft: 8 }}>| Auto-sync refreshed just now</span>
          </div>

          {/* Pagination buttons */}
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              style={{
                padding: "5px 12px",
                borderRadius: 6,
                border: "1px solid #e2e8f0",
                background: "#ffffff",
                color: page <= 1 ? "#cbd5e1" : "#475569",
                cursor: page <= 1 ? "not-allowed" : "pointer",
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              Previous
            </button>

            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => i + 1).map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => setPage(num)}
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 6,
                  border: num === page ? "none" : "1px solid #e2e8f0",
                  background: num === page ? "#2563eb" : "#ffffff",
                  color: num === page ? "#ffffff" : "#475569",
                  fontWeight: 600,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                {num}
              </button>
            ))}

            {totalPages > 5 && (
              <>
                <span style={{ color: "#94a3b8", padding: "0 4px" }}>...</span>
                <button
                  type="button"
                  onClick={() => setPage(totalPages)}
                  style={{
                    width: 34,
                    height: 30,
                    borderRadius: 6,
                    border: "1px solid #e2e8f0",
                    background: "#ffffff",
                    color: "#475569",
                    fontWeight: 600,
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  {totalPages}
                </button>
              </>
            )}

            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              style={{
                padding: "5px 12px",
                borderRadius: 6,
                border: "1px solid #e2e8f0",
                background: "#ffffff",
                color: page >= totalPages ? "#cbd5e1" : "#475569",
                cursor: page >= totalPages ? "not-allowed" : "pointer",
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* 7. Bottom Global Enterprise Footer (Matches screenshot bottom text) */}
      <div
        style={{
          marginTop: 40,
          paddingTop: 20,
          borderTop: "1px solid #e2e8f0",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
          fontSize: 12,
          color: "#64748b",
        }}
      >
        <div>
          <strong style={{ color: "#334155" }}>DocuIntel Enterprise v3.2</strong> • Document Intelligence Engine Active
        </div>
        <div style={{ display: "flex", gap: 16 }}>
          <a href="#" onClick={(e) => e.preventDefault()} style={{ color: "#64748b", textDecoration: "none" }}>
            API Documentation
          </a>
          <a href="#" onClick={(e) => e.preventDefault()} style={{ color: "#64748b", textDecoration: "none" }}>
            System Status
          </a>
          <a href="#" onClick={(e) => e.preventDefault()} style={{ color: "#64748b", textDecoration: "none" }}>
            Security &amp; Compliance (SOC2)
          </a>
          <a href="#" onClick={(e) => e.preventDefault()} style={{ color: "#64748b", textDecoration: "none" }}>
            Support
          </a>
        </div>
      </div>
    </div>
  );
}
