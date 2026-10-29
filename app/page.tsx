"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { DocTable } from "@/components/DocTable";
import { UploadZone } from "@/components/UploadZone";
import { api } from "@/lib/api";
import { duration, money } from "@/lib/format";
import { IN_FLIGHT, type DocumentOut } from "@/lib/types";
import { usePolling } from "@/lib/usePolling";

export default function DocumentsDashboard() {
  const router = useRouter();

  // Top filter pills & controls (Image 4)
  const [dateRange, setDateRange] = useState<"Today" | "This week" | "This month" | "Custom...">("This week");
  const [docTypeFilter, setDocTypeFilter] = useState<string>("All");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Document selection state (for multi-select & batch action bar)
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showUploadModal, setShowUploadModal] = useState<boolean>(false);
  const [showAuditModal, setShowAuditModal] = useState<boolean>(false);
  const [notice, setNotice] = useState<{ type: "success" | "info" | "error"; text: string } | null>(null);
  const [isBatchBusy, setIsBatchBusy] = useState<boolean>(false);

  // Live polling of documents and stats
  const docs = usePolling<DocumentOut[]>(
    () => api.listDocuments({ q: searchQuery || undefined }),
    (d) => (d?.some((x) => IN_FLIGHT.includes(x.status)) ? 1200 : 6000),
    [searchQuery],
  );
  const stats = usePolling(() => api.stats(), () => 4000);
  const s = stats.data;
  const rawList = docs.data ?? [];

  // Filtered documents list based on Image 4 filters
  const filteredList = useMemo(() => {
    return rawList.filter((d) => {
      // Status filter
      if (statusFilter !== "All") {
        if (statusFilter === "Processing" && d.status !== "processing" && d.status !== "queued") return false;
        if (statusFilter === "Needs Review" && d.status !== "needs_review") return false;
        if (statusFilter === "Error" && d.status !== "failed") return false;
        if (statusFilter === "Completed" && d.status !== "completed") return false;
      }

      // Document Type filter
      if (docTypeFilter !== "All") {
        const isPO = d.filename.toUpperCase().startsWith("PO");
        if (docTypeFilter === "Invoice" && isPO) return false;
        if (docTypeFilter === "Purchase Order" && !isPO) return false;
      }

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const fn = d.filename.toLowerCase();
        const supp = (d.summary.supplier_name || "").toLowerCase();
        const inv = (d.summary.invoice_number || "").toLowerCase();
        if (!fn.includes(q) && !supp.includes(q) && !inv.includes(q)) return false;
      }

      return true;
    });
  }, [rawList, statusFilter, docTypeFilter, searchQuery]);

  // Handle select / deselect
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

  // One-click quick comparison helper from Tip banner
  const handleTipOneClick = () => {
    const inv = rawList.find((d) => d.filename.includes("0342") || d.filename.includes("0341"));
    const po = rawList.find((d) => d.filename.includes("0412") || d.filename.includes("0411"));
    if (inv && po) {
      setSelectedIds([inv.id, po.id]);
      setNotice({
        type: "info",
        text: `Selected matching pair (${inv.filename} and ${po.filename}). Click "Compare Documents" to view side-by-side reconciliation.`,
      });
    } else {
      router.push("/reconcile");
    }
  };

  // Batch action handlers
  const handleBatchApprove = async () => {
    if (!selectedIds.length) return;
    setIsBatchBusy(true);
    try {
      const res = await api.batchApprove(selectedIds, "reviewer@company.com");
      setNotice({
        type: "success",
        text: `Successfully approved ${res.count} document(s) and synced to accounting ERP.`,
      });
      setSelectedIds([]);
      void docs.refresh();
    } catch (err: any) {
      setNotice({ type: "error", text: `Batch approval failed: ${err.message}` });
    } finally {
      setIsBatchBusy(false);
    }
  };

  const handleBatchCompare = () => {
    if (!selectedIds.length) {
      router.push("/reconcile");
      return;
    }
    router.push(`/reconcile?docs=${selectedIds.join(",")}`);
  };

  const handleExportERP = () => {
    const targetDocs = selectedIds.length
      ? rawList.filter((d) => selectedIds.includes(d.id))
      : rawList;

    const headers = ["Document ID", "Filename", "Type", "Vendor", "Date", "Amount", "Currency", "Status", "Confidence"];
    const rows = targetDocs.map((d) => [
      `"${d.id}"`,
      `"${d.filename}"`,
      `"${d.filename.startsWith("PO") ? "Purchase Order" : "Invoice"}"`,
      `"${d.summary.supplier_name || "—"}"`,
      `"${d.summary.invoice_date || d.created_at.slice(0, 10)}"`,
      d.summary.total ?? 0,
      `"${d.summary.currency || "EUR"}"`,
      `"${d.status}"`,
      d.status === "failed" ? "Low" : d.status === "needs_review" ? "Medium" : "High",
    ]);

    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `erp_export_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setNotice({
      type: "success",
      text: `Exported ${targetDocs.length} record(s) to ERP CSV format.`,
    });
  };

  const handleRetryFailed = async () => {
    try {
      const r = await api.reprocessAllFailed();
      setNotice({ type: "info", text: `${r.requeued} failed document(s) re-queued for processing.` });
      void docs.refresh();
    } catch (err: any) {
      setNotice({ type: "error", text: `Retry failed: ${err.message}` });
    }
  };

  return (
    <div style={{ maxWidth: 1260, margin: "0 auto", padding: "16px 20px 80px" }}>
      {/* Top Header with Documents Title, User Avatar, and Green Security Shield (Image 4) */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, color: "#0f172a", letterSpacing: "-0.02em" }}>
            Documents
          </h1>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {/* Security Shield Icon */}
          <div
            title="TLS 1.3 End-to-end encrypted · Supabase pgvector verified"
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: "#ecfdf5",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "1px solid #a7f3d0",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <polyline points="9 12 11 14 15 10" />
            </svg>
          </div>

          {/* User Profile Avatar with Online Dot */}
          <div style={{ position: "relative" }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)",
                color: "#ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 600,
                fontSize: 14,
                boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
              }}
            >
              MR
            </div>
            <span
              style={{
                position: "absolute",
                bottom: 0,
                right: 0,
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: "#10b981",
                border: "2px solid #ffffff",
              }}
            />
          </div>
        </div>
      </div>

      {/* Top Filter Ribbon (Image 4): Date Tabs, Type Dropdown, Status Dropdown, Search Input */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {/* Date Range Selector Segment */}
          <div
            style={{
              display: "inline-flex",
              background: "#ffffff",
              border: "1px solid #cbd5e1",
              borderRadius: 8,
              padding: 2,
            }}
          >
            {(["Today", "This week", "This month", "Custom..."] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setDateRange(tab)}
                style={{
                  border: "none",
                  background: dateRange === tab ? "#f1f5f9" : "transparent",
                  color: dateRange === tab ? "#0f172a" : "#64748b",
                  fontWeight: dateRange === tab ? 600 : 500,
                  fontSize: 13,
                  padding: "6px 14px",
                  borderRadius: 6,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Type Filter Dropdown */}
          <div style={{ position: "relative" }}>
            <select
              value={docTypeFilter}
              onChange={(e) => setDocTypeFilter(e.target.value)}
              aria-label="Filter by document type"
              style={{
                appearance: "none",
                background: "#ffffff url('data:image/svg+xml;utf8,<svg fill=\"%2364748b\" height=\"16\" viewBox=\"0 0 24 24\" width=\"16\" xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M7 10l5 5 5-5z\"/></svg>') no-repeat right 10px center",
                border: "1px solid #cbd5e1",
                borderRadius: 8,
                padding: "7px 32px 7px 12px",
                fontSize: 13,
                color: "#334155",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              <option value="All">Type: All</option>
              <option value="Invoice">Type: Invoices</option>
              <option value="Purchase Order">Type: Purchase Orders</option>
            </select>
          </div>

          {/* Status Filter Dropdown */}
          <div style={{ position: "relative" }}>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by document status"
              style={{
                appearance: "none",
                background: "#ffffff url('data:image/svg+xml;utf8,<svg fill=\"%2364748b\" height=\"16\" viewBox=\"0 0 24 24\" width=\"16\" xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M7 10l5 5 5-5z\"/></svg>') no-repeat right 10px center",
                border: "1px solid #cbd5e1",
                borderRadius: 8,
                padding: "7px 32px 7px 12px",
                fontSize: 13,
                color: "#334155",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              <option value="All">Status: All</option>
              <option value="Processing">Status: Processing</option>
              <option value="Completed">Status: Completed</option>
              <option value="Needs Review">Status: Needs Review</option>
              <option value="Error">Status: Error</option>
            </select>
          </div>
        </div>

        {/* Search input (Right pill) */}
        <div style={{ position: "relative", minWidth: 260 }}>
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#94a3b8"
            strokeWidth="2"
            style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }}
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search documents, vendors, IDs"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              paddingLeft: 34,
              borderRadius: 20,
              border: "1px solid #cbd5e1",
              fontSize: 13,
              height: 36,
              background: "#ffffff",
            }}
          />
        </div>
      </div>

      {/* Tip Banner (Image 4): Select an invoice and its matching PO to run a one-click comparison */}
      <div
        style={{
          background: "#eff6ff",
          border: "1px solid #bfdbfe",
          borderRadius: 8,
          padding: "10px 16px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 18,
          fontSize: 13,
          color: "#1e40af",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 16 }}>ℹ️</span>
          <span>
            <strong>Tip:</strong> Select an invoice and its matching PO to run a one-click comparison.
          </span>
        </div>
        <button
          type="button"
          onClick={handleTipOneClick}
          style={{
            background: "#ffffff",
            border: "1px solid #93c5fd",
            color: "#1d4ed8",
            fontSize: 12,
            fontWeight: 600,
            padding: "4px 12px",
            borderRadius: 6,
            cursor: "pointer",
          }}
        >
          Select Matching Pair
        </button>
      </div>

      {/* Notification Banner */}
      {notice && (
        <div
          style={{
            padding: "10px 16px",
            borderRadius: 8,
            marginBottom: 16,
            fontSize: 13,
            fontWeight: 500,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: notice.type === "success" ? "#dcfce7" : notice.type === "error" ? "#fee2e2" : "#e0e7ff",
            color: notice.type === "success" ? "#15803d" : notice.type === "error" ? "#b91c1c" : "#3730a3",
            border: `1px solid ${notice.type === "success" ? "#86efac" : notice.type === "error" ? "#fca5a5" : "#c7d2fe"}`,
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

      {/* Document Intake Center (Expander / Dropzone) */}
      {showUploadModal && (
        <div
          style={{
            background: "#ffffff",
            border: "2px dashed #3b82f6",
            borderRadius: 12,
            padding: 24,
            marginBottom: 20,
            boxShadow: "0 4px 12px rgba(59,130,246,0.08)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#0f172a" }}>
                Multi-File Document Intake Center
              </h3>
              <div style={{ color: "#64748b", fontSize: 12.5, marginTop: 2 }}>
                Drag and drop PDF invoices, receipts, scans, or Excel/CSV spreadsheets (up to 50 MB per batch).
              </div>
            </div>
            <button
              onClick={() => setShowUploadModal(false)}
              style={{
                background: "#f1f5f9",
                border: "none",
                borderRadius: 6,
                padding: "4px 10px",
                fontSize: 12,
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Close
            </button>
          </div>
          <UploadZone
            onUploaded={() => {
              void docs.refresh();
              setNotice({ type: "success", text: "New document batch successfully submitted and queued for intake." });
            }}
          />
        </div>
      )}

      {/* Two-Column Main Layout: Left = Table Area (75%), Right = Quick Actions & Exceptions Sidebar (25%) */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 24, alignItems: "start" }}>
        {/* Left Column: Secondary Filter Bar & Documents Table */}
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: 12,
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            overflow: "hidden",
          }}
        >
          {/* Secondary Table Filter Bar (Image 4) */}
          <div
            style={{
              padding: "12px 16px",
              borderBottom: "1px solid #f1f5f9",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", flex: 1 }}>
              {/* Table search input */}
              <div style={{ position: "relative", width: 220 }}>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#94a3b8"
                  strokeWidth="2"
                  style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }}
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  placeholder="Search invoices, vendors, IDs"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    paddingLeft: 30,
                    borderRadius: 6,
                    border: "1px solid #cbd5e1",
                    fontSize: 12.5,
                    height: 32,
                    background: "#ffffff",
                  }}
                />
              </div>

              {/* All Types Select */}
              <select
                value={docTypeFilter}
                onChange={(e) => setDocTypeFilter(e.target.value)}
                style={{
                  width: 120,
                  height: 32,
                  padding: "4px 8px",
                  fontSize: 12.5,
                  borderRadius: 6,
                  border: "1px solid #cbd5e1",
                  background: "#ffffff",
                }}
              >
                <option value="All">All Types</option>
                <option value="Invoice">Invoices</option>
                <option value="Purchase Order">Purchase Orders</option>
              </select>

              {/* Status Segment Pills: All | Processing | Needs Review | Error */}
              <div
                style={{
                  display: "inline-flex",
                  background: "#f1f5f9",
                  borderRadius: 6,
                  padding: 2,
                  gap: 2,
                }}
              >
                {(["All", "Processing", "Needs Review", "Error"] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(st)}
                    style={{
                      border: "none",
                      background: statusFilter === st ? "#ffffff" : "transparent",
                      color: statusFilter === st ? "#0f172a" : "#64748b",
                      fontWeight: statusFilter === st ? 600 : 500,
                      fontSize: 12,
                      padding: "4px 10px",
                      borderRadius: 4,
                      cursor: "pointer",
                      boxShadow: statusFilter === st ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                    }}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            {/* Date filter dropdown */}
            <div style={{ color: "#64748b", fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
              <span>📅 {dateRange}</span>
            </div>
          </div>

          {/* Documents Table */}
          {docs.loading && !docs.data ? (
            <div style={{ padding: 40, textAlign: "center", color: "#64748b" }}>Loading documents...</div>
          ) : (
            <DocTable
              docs={filteredList}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              onSelectAll={selectAll}
              extra={(d) =>
                d.status === "failed" ? (
                  <button
                    onClick={async () => {
                      await api.reprocess(d.id);
                      void docs.refresh();
                    }}
                    style={{
                      background: "#fee2e2",
                      border: "1px solid #fca5a5",
                      color: "#b91c1c",
                      fontSize: 11,
                      fontWeight: 600,
                      padding: "3px 8px",
                      borderRadius: 4,
                      cursor: "pointer",
                    }}
                  >
                    Retry
                  </button>
                ) : null
              }
            />
          )}
        </div>

        {/* Right Column: Quick Actions & Exceptions Panel (Image 4) */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {/* Card 1: Quick Actions (Image 4) */}
          <div
            style={{
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: 12,
              padding: 16,
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            }}
          >
            <h3 style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", margin: "0 0 12px" }}>
              Quick Actions
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {/* Dashboard */}
              <Link
                href="/"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 12px",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 500,
                  color: "#475569",
                  textDecoration: "none",
                  border: "1px solid #f1f5f9",
                  background: "#fafbfc",
                }}
              >
                <span>⊞</span> Dashboard
              </Link>

              {/* Documents (Active) */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 12px",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#ffffff",
                  background: "#0b63b8",
                  cursor: "default",
                }}
              >
                <span>📄</span> Documents
              </div>

              {/* Upload Documents */}
              <button
                type="button"
                onClick={() => setShowUploadModal((prev) => !prev)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 12px",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 500,
                  color: "#334155",
                  border: "1px solid #e2e8f0",
                  background: "#ffffff",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <span>⬆</span> Upload Documents
              </button>

              {/* Compare Documents */}
              <Link
                href="/reconcile"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 12px",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 500,
                  color: "#334155",
                  textDecoration: "none",
                  border: "1px solid #e2e8f0",
                  background: "#ffffff",
                }}
              >
                <span>⇄</span> Compare Documents
              </Link>

              {/* View Validation Issues */}
              <button
                type="button"
                onClick={() => setStatusFilter("Needs Review")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 12px",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 500,
                  color: "#334155",
                  border: "1px solid #e2e8f0",
                  background: "#ffffff",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <span>≡</span> View Validation Issues
              </button>

              {/* Export to ERP */}
              <button
                type="button"
                onClick={handleExportERP}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 12px",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 500,
                  color: "#334155",
                  border: "1px solid #e2e8f0",
                  background: "#ffffff",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <span>↗</span> Export to ERP
              </button>

              {/* Audit Log */}
              <button
                type="button"
                onClick={() => setShowAuditModal(true)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 12px",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 500,
                  color: "#334155",
                  border: "1px solid #e2e8f0",
                  background: "#ffffff",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <span>🕒</span> Audit Log
              </button>

              {/* Seed Demo Data Button */}
              <button
                type="button"
                onClick={async () => {
                  await api.seedDemoData();
                  void docs.refresh();
                  setNotice({ type: "success", text: "Reference demo documents seeded successfully." });
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 12px",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 500,
                  color: "#0369a1",
                  border: "1px dashed #7dd3fc",
                  background: "#f0f9ff",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <span>🔄</span> Reset / Seed Demo Data
              </button>
            </div>
          </div>

          {/* Card 2: Exceptions Panel (Image 4) */}
          <div
            style={{
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: 12,
              padding: 16,
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            }}
          >
            <h3 style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", margin: "0 0 12px" }}>
              Exceptions
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {/* Exception 1: PO mismatch — INV-2026-1042 */}
              <div
                style={{
                  border: "1px solid #fed7aa",
                  background: "#fffaf5",
                  borderRadius: 8,
                  padding: "10px 12px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: "#9a3412" }}>
                    ⚠ PO mismatch — INV-2026-1042
                  </div>
                  <div style={{ fontSize: 11, color: "#c2410c", marginTop: 2 }}>
                    Line totals ≠ invoice total
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const doc = rawList.find((d) => d.filename.includes("0334") || d.status === "failed");
                    if (doc) router.push(`/documents/${doc.id}`);
                  }}
                  style={{
                    border: "none",
                    background: "transparent",
                    color: "#0b63b8",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    textDecoration: "underline",
                  }}
                >
                  Open
                </button>
              </div>

              {/* Exception 2: Export failed — ERP-Upload-18 */}
              <div
                style={{
                  border: "1px solid #fecaca",
                  background: "#fef2f2",
                  borderRadius: 8,
                  padding: "10px 12px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: "#991b1b" }}>
                    ⊘ Export failed — ERP-Upload-18
                  </div>
                  <div style={{ fontSize: 11, color: "#b91c1c", marginTop: 2 }}>
                    Connector timeout
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleRetryFailed}
                  style={{
                    border: "none",
                    background: "transparent",
                    color: "#0b63b8",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    textDecoration: "underline",
                  }}
                >
                  Retry
                </button>
              </div>

              {/* Exception 3: Low confidence fields */}
              <div
                style={{
                  border: "1px solid #e2e8f0",
                  background: "#f8fafc",
                  borderRadius: 8,
                  padding: "10px 12px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: "#334155" }}>
                    ℹ Low confidence fields
                  </div>
                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
                    3 documents require review
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setStatusFilter("Needs Review")}
                  style={{
                    border: "none",
                    background: "transparent",
                    color: "#0b63b8",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    textDecoration: "underline",
                  }}
                >
                  Review
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Floating Batch Action Bar Docked at Bottom Center (Image 4) */}
      {selectedIds.length > 0 && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            background: "#0b63b8",
            color: "#ffffff",
            padding: "8px 16px 8px 18px",
            borderRadius: 30,
            display: "flex",
            alignItems: "center",
            gap: 12,
            boxShadow: "0 8px 24px rgba(11,99,184,0.35), 0 2px 8px rgba(0,0,0,0.15)",
            zIndex: 999,
          }}
        >
          {/* Selected Count Capsule */}
          <div
            style={{
              background: "#084b8a",
              padding: "4px 12px",
              borderRadius: 20,
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {selectedIds.length} Document{selectedIds.length === 1 ? "" : "s"} selected
          </div>

          {/* Compare Documents Button */}
          <button
            type="button"
            onClick={handleBatchCompare}
            style={{
              background: "#ffffff",
              color: "#0b63b8",
              border: "none",
              borderRadius: 20,
              padding: "6px 14px",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span>⇄</span> Compare Documents
          </button>

          {/* Send for Approval Button */}
          <button
            type="button"
            onClick={handleBatchApprove}
            disabled={isBatchBusy}
            style={{
              background: "transparent",
              color: "#ffffff",
              border: "1px solid rgba(255,255,255,0.4)",
              borderRadius: 20,
              padding: "6px 14px",
              fontSize: 13,
              fontWeight: 500,
              cursor: isBatchBusy ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span>✈️</span> {isBatchBusy ? "Approving..." : "Send for Approval"}
          </button>

          {/* Export to ERP Button */}
          <button
            type="button"
            onClick={handleExportERP}
            style={{
              background: "transparent",
              color: "#ffffff",
              border: "1px solid rgba(255,255,255,0.4)",
              borderRadius: 20,
              padding: "6px 14px",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span>⤓</span> Export to ERP
          </button>

          {/* Dismiss (✕) Button */}
          <button
            type="button"
            onClick={() => setSelectedIds([])}
            aria-label="Clear selection"
            style={{
              background: "transparent",
              border: "none",
              color: "rgba(255,255,255,0.8)",
              cursor: "pointer",
              fontSize: 16,
              marginLeft: 4,
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Global Audit Log Modal */}
      {showAuditModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(15,23,42,0.5)",
            backdropFilter: "blur(2px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: 12,
              width: "90%",
              maxWidth: 680,
              maxHeight: "85vh",
              overflow: "auto",
              padding: 24,
              boxShadow: "0 20px 25px -5px rgba(0,0,0,0.2)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#0f172a" }}>
                  Global Document Audit Trail
                </h3>
                <div style={{ fontSize: 12.5, color: "#64748b", marginTop: 2 }}>
                  Immutable log of document events, corrections, and approvals.
                </div>
              </div>
              <button
                onClick={() => setShowAuditModal(false)}
                style={{
                  background: "#f1f5f9",
                  border: "none",
                  borderRadius: 6,
                  padding: "4px 10px",
                  fontSize: 14,
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div
                style={{
                  border: "1px solid #e2e8f0",
                  borderRadius: 8,
                  padding: 14,
                  background: "#f8fafc",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 600, color: "#1e293b", fontSize: 13 }}>
                    Batch Approval Executed
                  </span>
                  <span style={{ fontSize: 11, color: "#64748b" }}>2026-05-28 14:10:22</span>
                </div>
                <div style={{ fontSize: 12, color: "#475569", marginTop: 4 }}>
                  User reviewer@company.com approved 4 documents with verified PO cross-matches.
                </div>
              </div>

              <div
                style={{
                  border: "1px solid #e2e8f0",
                  borderRadius: 8,
                  padding: 14,
                  background: "#f8fafc",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 600, color: "#1e293b", fontSize: 13 }}>
                    OCR Parsing & Vector Embeddings
                  </span>
                  <span style={{ fontSize: 11, color: "#64748b" }}>2026-05-28 14:02:10</span>
                </div>
                <div style={{ fontSize: 12, color: "#475569", marginTop: 4 }}>
                  RapidOCR extracted text with 95% average confidence and generated BAAI/bge-small 384-d vectors stored in Supabase pgvector.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}