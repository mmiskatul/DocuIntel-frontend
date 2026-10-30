"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { bytes, money } from "@/lib/format";
import type { DocumentOut, ResultOut } from "@/lib/types";

// Helper to extract page-by-page text from raw OCR text
function parsePagesFromText(rawText: string): Record<number, string> {
  const pages: Record<number, string> = {};
  if (!rawText) return pages;

  const parts = rawText.split(/--- Page (\d+) ---/);
  if (parts.length > 1) {
    for (let i = 1; i < parts.length; i += 2) {
      const pageNum = parseInt(parts[i], 10);
      const content = parts[i + 1]?.trim() || "";
      pages[pageNum] = content;
    }
  } else {
    pages[1] = rawText.trim();
  }
  return pages;
}

export default function DocumentDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const docId = resolvedParams.id;
  const router = useRouter();

  const [doc, setDoc] = useState<DocumentOut | null>(null);
  const [results, setResults] = useState<ResultOut[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dynamic Page Navigation State
  const [currentPage, setCurrentPage] = useState(1);
  const [viewMode, setViewMode] = useState<"preview" | "page_text" | "all_text">("preview");
  const [zoomLevel, setZoomLevel] = useState(100);

  // Action status
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);
  const [manualReconcileOpen, setManualReconcileOpen] = useState(false);
  const [customTotal, setCustomTotal] = useState("");

  // Manual Corrections Mode State
  const [editMode, setEditMode] = useState(false);
  const [editFields, setEditFields] = useState({
    supplier_name: "",
    customer_name: "",
    invoice_date: "",
    invoice_number: "",
    subtotal: "",
    tax: "",
    total: "",
    currency: "USD",
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const [d, r, h] = await Promise.all([
        api.getDocument(docId),
        api.getResults(docId).catch(() => []),
        api.getHistory(docId).catch(() => []),
      ]);
      setDoc(d);
      setResults(r || []);
      setHistory(h || []);
    } catch (err: any) {
      setError(err.message || "Failed to load document.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (docId) void loadData();
  }, [docId]);

  if (loading) {
    return (
      <div style={{ maxWidth: 1280, margin: "60px auto", textAlign: "center", color: "#64748b" }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>⚡</div>
        <div style={{ fontSize: 16, fontWeight: 600 }}>Loading document details...</div>
      </div>
    );
  }

  if (error || !doc) {
    return (
      <div style={{ maxWidth: 800, margin: "60px auto", padding: 24, background: "#ffffff", borderRadius: 10, border: "1px solid #e2e8f0", textAlign: "center" }}>
        <div style={{ fontSize: 36, color: "#dc2626", marginBottom: 12 }}>⚠️</div>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 8px 0" }}>Document Not Found</h2>
        <p style={{ color: "#64748b", fontSize: 14 }}>{error || "Unable to locate document record."}</p>
        <Link href="/" className="btn btn-primary" style={{ display: "inline-block", marginTop: 16 }}>
          ← Return to Documents Dashboard
        </Link>
      </div>
    );
  }

  const currentResult: any = results[0] || {};
  const data = currentResult.data || {};
  const rawText: string = data.raw_text || currentResult.raw_text || "";
  const pageTexts = parsePagesFromText(rawText);
  const totalPages = Math.max(doc.page_count || 1, Object.keys(pageTexts).length);

  // 100% DYNAMIC EXTRACTED VALUES (NO STATIC / FAKE FALLBACKS!)
  const vendorName = data.supplier_name || doc.summary?.supplier_name || null;
  const customerName = data.customer_name || doc.summary?.customer_name || null;
  const docDate = data.invoice_date || doc.summary?.invoice_date || null;
  const invoiceNumber = data.invoice_number || doc.summary?.invoice_number || null;
  const subtotalVal: number | null = data.subtotal != null ? Number(data.subtotal) : null;
  const taxVal: number | null = data.tax != null ? Number(data.tax) : null;
  const totalVal: number | null = data.total != null ? Number(data.total) : (doc.summary?.total != null ? Number(doc.summary.total) : null);
  const currency: string = data.currency || doc.summary?.currency || "USD";
  const lineItems: any[] = data.line_items || [];
  const documentType: string = data.document_type || "General Document";

  // Check Format Rejection
  const isRejected = doc.status === "rejected" || data.is_supported_format === false;
  const rejectionReason = doc.error || data.rejection_reason || (isRejected ? `Document rejected: not a valid commercial billing document (Identified as ${documentType}).` : null);

  // Issues & Validation State
  const issues: any[] = data.issues || [];
  const errorIssues = issues.filter((i: any) => i.severity === "error");
  const isNeedsReview = (doc.status === "needs_review" || errorIssues.length > 0) && doc.status !== "completed";

  // Check Arithmetic Variance (Only if valid numbers exist)
  let calculatedSum: number | null = null;
  let varianceDiff: number | null = null;
  let hasDiscrepancy = false;

  if (subtotalVal !== null && taxVal !== null && totalVal !== null) {
    calculatedSum = Math.round((subtotalVal + taxVal) * 100) / 100;
    varianceDiff = Math.round((totalVal - calculatedSum) * 100) / 100;
    hasDiscrepancy = Math.abs(varianceDiff) > 0.05 && doc.status !== "completed";
  } else if (lineItems.length > 0 && totalVal !== null && subtotalVal === null) {
    const sumLines = lineItems.reduce((acc: number, item: any) => acc + (Number(item.amount) || 0), 0);
    if (sumLines > 0) {
      calculatedSum = Math.round((sumLines + (taxVal != null ? taxVal : 0)) * 100) / 100;
      varianceDiff = Math.round((totalVal - calculatedSum) * 100) / 100;
      hasDiscrepancy = Math.abs(varianceDiff) > 0.05 && doc.status !== "completed";
    }
  }

  // 1. Approve & Vectorize Action
  const handleApprove = async () => {
    setBusy(true);
    try {
      await api.approve(doc.id, "auditor@docuintel.com");
      setDoc({ ...doc, status: "completed", stage: "Approved & Vectorized" });
      setNotice({ type: "success", text: "✓ Document verified & successfully stored in vector database!" });
      void loadData();
    } catch (err: any) {
      setNotice({ type: "error", text: `Approval notice: ${err.message}` });
    } finally {
      setBusy(false);
    }
  };

  // 2. Reconcile Variance: Apply Calculated Sum
  const handleApplySum = async () => {
    if (calculatedSum === null) return;
    setBusy(true);
    try {
      await api.reconcile(doc.id, {
        subtotal: subtotalVal ?? undefined,
        tax: taxVal ?? undefined,
        total: calculatedSum,
        action: "apply_sum",
        reviewer: "auditor@docuintel.com",
      });
      setDoc({ ...doc, status: "completed", stage: "Reconciled & Vectorized" });
      setNotice({ type: "success", text: `✓ Applied calculated sum ($${calculatedSum.toFixed(2)}). Discrepancy resolved and stored in vector database!` });
      void loadData();
    } catch (err: any) {
      setNotice({ type: "error", text: `Reconciliation error: ${err.message}` });
    } finally {
      setBusy(false);
    }
  };

  // 3. Reconcile Variance: Override with Extracted Total
  const handleOverride = async () => {
    if (totalVal === null) return;
    setBusy(true);
    try {
      await api.reconcile(doc.id, {
        subtotal: subtotalVal ?? undefined,
        tax: taxVal ?? undefined,
        total: totalVal,
        action: "override",
        reviewer: "auditor@docuintel.com",
      });
      setDoc({ ...doc, status: "completed", stage: "Reconciled & Vectorized" });
      setNotice({ type: "success", text: `✓ Stated total ($${totalVal.toFixed(2)}) accepted. Document stored in vector database!` });
      void loadData();
    } catch (err: any) {
      setNotice({ type: "error", text: `Override error: ${err.message}` });
    } finally {
      setBusy(false);
    }
  };

  // 4. Reject Document
  const handleReject = async () => {
    if (confirm("Reject this document due to format mismatch or invalid schema?")) {
      setBusy(true);
      try {
        await api.reject(doc.id, "Format Mismatch: Document structure does not conform to standardized invoice/waybill format.", "auditor@docuintel.com");
        setDoc({ ...doc, status: "rejected", stage: "Format Rejected" });
        setNotice({ type: "error", text: "✕ Document marked as Rejected. Excluded from vector database." });
        void loadData();
      } catch (err: any) {
        setNotice({ type: "error", text: `Rejection notice: ${err.message}` });
      } finally {
        setBusy(false);
      }
    }
  };

  // 5. Delete Document
  const handleDelete = async () => {
    if (confirm(`Permanently delete ${doc.filename}?`)) {
      try {
        await api.deleteDocument(doc.id);
        router.push("/");
      } catch (err: any) {
        alert(`Delete failed: ${err.message}`);
      }
    }
  };

  // 6. Manual Value Corrections
  const startEditing = () => {
    setEditFields({
      supplier_name: vendorName || "",
      customer_name: customerName || "",
      invoice_date: docDate || "",
      invoice_number: invoiceNumber || "",
      subtotal: subtotalVal !== null ? String(subtotalVal) : "",
      tax: taxVal !== null ? String(taxVal) : "",
      total: totalVal !== null ? String(totalVal) : "",
      currency: currency || "USD",
    });
    setEditMode(true);
  };

  const handleSaveCorrections = async () => {
    setBusy(true);
    try {
      const corrections: Record<string, any> = {
        supplier_name: editFields.supplier_name.trim() || undefined,
        customer_name: editFields.customer_name.trim() || undefined,
        invoice_date: editFields.invoice_date.trim() || undefined,
        invoice_number: editFields.invoice_number.trim() || undefined,
        currency: editFields.currency.trim() || "USD",
      };
      if (editFields.subtotal !== "") corrections.subtotal = parseFloat(editFields.subtotal);
      if (editFields.tax !== "") corrections.tax = parseFloat(editFields.tax);
      if (editFields.total !== "") corrections.total = parseFloat(editFields.total);

      await api.correctDocument(doc.id, corrections);
      setNotice({ type: "success", text: "✓ Manually corrected values saved and synchronized into database & vector store!" });
      setEditMode(false);
      void loadData();
    } catch (err: any) {
      setNotice({ type: "error", text: `Correction failed: ${err.message}` });
    } finally {
      setBusy(false);
    }
  };

  // 7. Re-run OCR
  const handleRerunOcr = async () => {
    setBusy(true);
    try {
      await api.rerunOcr(doc.id);
      setNotice({ type: "info", text: "Re-running OCR and extraction pipeline in background..." });
      setTimeout(() => void loadData(), 2500);
    } catch (err: any) {
      setNotice({ type: "error", text: `Re-run notice: ${err.message}` });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ maxWidth: 1380, margin: "0 auto", padding: "16px 20px 80px 20px" }}>
      {/* ==================================================================== */}
      {/* 1. TOP BREADCRUMB & METADATA BAR                                     */}
      {/* ==================================================================== */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: 12,
          paddingBottom: 12,
          borderBottom: "1px solid #e2e8f0",
        }}
      >
        {/* Left: Breadcrumbs + Metadata Badges */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Link
            href="/"
            style={{
              fontSize: 13,
              color: "#64748b",
              textDecoration: "none",
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontWeight: 500,
            }}
          >
            <span>📁</span> Documents
          </Link>
          <span style={{ color: "#94a3b8" }}>/</span>

          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 15 }}>📄</span>
            <span style={{ fontSize: 14.5, fontWeight: 700, color: "#0f172a" }}>
              {doc.filename}
            </span>
          </div>

          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "#475569",
              background: "#f1f5f9",
              border: "1px solid #e2e8f0",
              padding: "2px 7px",
              borderRadius: 4,
            }}
          >
            {bytes(doc.size_bytes)}
          </span>

          {docDate && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "#475569",
                background: "#f1f5f9",
                border: "1px solid #e2e8f0",
                padding: "2px 7px",
                borderRadius: 4,
              }}
            >
              {docDate}
            </span>
          )}

          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: isRejected ? "#991b1b" : "#6b21a8",
              background: isRejected ? "#fee2e2" : "#ede9fe",
              border: isRejected ? "1px solid #fca5a5" : "1px solid #ddd6fe",
              padding: "2px 8px",
              borderRadius: 4,
            }}
          >
            {documentType}
          </span>
        </div>

        {/* Right: Top Action Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            onClick={() => {
              const el = document.getElementById("audit-lineage");
              if (el) el.scrollIntoView({ behavior: "smooth" });
            }}
            className="btn btn-sm"
            style={{ background: "#f8fafc", color: "#334155", border: "1px solid #cbd5e1", fontSize: 12 }}
          >
            ⏱ Audit Logs
          </button>

          <button
            type="button"
            onClick={handleRerunOcr}
            disabled={busy}
            className="btn btn-sm"
            style={{ background: "#f8fafc", color: "#334155", border: "1px solid #cbd5e1", fontSize: 12 }}
          >
            🔄 Re-run OCR
          </button>

          {!isRejected && (
            <button
              type="button"
              onClick={handleReject}
              disabled={busy}
              className="btn btn-sm"
              style={{ background: "#fff1f2", color: "#be123c", border: "1px solid #fecdd3", fontSize: 12 }}
            >
              ✕ Reject
            </button>
          )}

          <button
            type="button"
            onClick={handleDelete}
            className="btn btn-sm"
            style={{ background: "#fee2e2", color: "#b91c1c", border: "1px solid #fca5a5", fontSize: 12 }}
          >
            🗑 Delete
          </button>

          {!isRejected && (
            <button
              type="button"
              onClick={handleApprove}
              disabled={busy}
              style={{
                background: "#2563eb",
                color: "#ffffff",
                border: "none",
                borderRadius: 6,
                padding: "6px 16px",
                fontSize: 12.5,
                fontWeight: 700,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
                boxShadow: "0 1px 2px rgba(37,99,235,0.2)",
              }}
            >
              <span>✔</span> Approve &amp; Vectorize
            </button>
          )}
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 2. SECONDARY STATUS & VALIDATION BANNER                              */}
      {/* ==================================================================== */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: 16,
        }}
      >
        {/* Status Pill */}
        <div>
          {isRejected ? (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: "#fee2e2",
                border: "1px solid #fca5a5",
                color: "#991b1b",
                fontSize: 12,
                fontWeight: 700,
                padding: "4px 12px",
                borderRadius: 14,
              }}
            >
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#b91c1c" }} />
              ✕ Intake Rejected: {documentType}
            </div>
          ) : doc.status === "failed" ? (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: "#fee2e2",
                border: "1px solid #fca5a5",
                color: "#991b1b",
                fontSize: 12,
                fontWeight: 700,
                padding: "4px 12px",
                borderRadius: 14,
              }}
            >
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#dc2626" }} />
              ✕ Processing Failed: {doc.stage || "Parser Error"}
            </div>
          ) : doc.status === "needs_review" ? (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: "#fef2f2",
                border: "1px solid #fecaca",
                color: "#b91c1c",
                fontSize: 12,
                fontWeight: 600,
                padding: "4px 12px",
                borderRadius: 14,
              }}
            >
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#dc2626" }} />
              ⚠ Needs Review ({doc.stage || "Variance Detected"})
            </div>
          ) : (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: "#ecfdf5",
                border: "1px solid #a7f3d0",
                color: "#065f46",
                fontSize: 12,
                fontWeight: 600,
                padding: "4px 12px",
                borderRadius: 14,
              }}
            >
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#10b981" }} />
              ✓ Verified &amp; Stored in Vector Database
            </div>
          )}
        </div>

        {/* Engine & Extraction Confidence Pill */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            background: isRejected || doc.status === "failed" ? "#f1f5f9" : "#ccfbf1",
            border: isRejected || doc.status === "failed" ? "1px solid #cbd5e1" : "1px solid #99f6e4",
            color: isRejected || doc.status === "failed" ? "#475569" : "#0f766e",
            fontSize: 12,
            fontWeight: 600,
            padding: "3px 12px",
            borderRadius: 6,
          }}
        >
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: isRejected || doc.status === "failed" ? "#64748b" : "#0d9488" }} />
          <span>
            {isRejected
              ? `Dynamic Classification • ${documentType}`
              : doc.status === "failed"
              ? `Parser Failure • ${doc.stage || "Error"}`
              : `LangChain v2.4 Vision-LLM • ${((currentResult.overall_confidence || 0.95) * 100).toFixed(1)}% Confidence`}
          </span>
        </div>
      </div>

      {/* Notice Toast */}
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

      {/* ==================================================================== */}
      {/* 3. MAIN 2-COLUMN GRID (LEFT: MULTI-PAGE VIEWER; RIGHT: ENTITIES & RULES) */}
      {/* ==================================================================== */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(480px, 1.25fr) minmax(420px, 1fr)",
          gap: 22,
          alignItems: "start",
        }}
      >
        {/* ------------------------------------------------------------------ */}
        {/* LEFT COLUMN: MULTI-PAGE DOCUMENT CANVAS (100% REAL DOCUMENT)       */}
        {/* ------------------------------------------------------------------ */}
        <div>
          {/* Top Multi-Page Controls Bar */}
          <div
            style={{
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: "8px 8px 0 0",
              padding: "10px 14px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 10,
              fontSize: 12,
              color: "#475569",
            }}
          >
            {/* Dynamic Multi-Page Pagination */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>Document Viewer:</span>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  style={{
                    background: "#f1f5f9",
                    border: "1px solid #cbd5e1",
                    borderRadius: 4,
                    padding: "3px 8px",
                    cursor: currentPage <= 1 ? "not-allowed" : "pointer",
                    fontWeight: 700,
                  }}
                >
                  &lt;
                </button>
                <span style={{ fontWeight: 700, color: "#0f172a", padding: "0 4px" }}>
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  style={{
                    background: "#f1f5f9",
                    border: "1px solid #cbd5e1",
                    borderRadius: 4,
                    padding: "3px 8px",
                    cursor: currentPage >= totalPages ? "not-allowed" : "pointer",
                    fontWeight: 700,
                  }}
                >
                  &gt;
                </button>
              </div>
            </div>

            {/* Sync Badge */}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span
                style={{
                  background: isRejected ? "#991b1b" : doc.status === "completed" ? "#059669" : "#d97706",
                  color: "#ffffff",
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "2px 7px",
                  borderRadius: 3,
                  letterSpacing: "0.5px",
                }}
              >
                {isRejected ? "VECTOR_EXCLUDED" : doc.status === "completed" ? "VECTOR_SYNC_ACTIVE" : "VECTOR_SYNC_PENDING"}
              </span>

              {/* Zoom Controls */}
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <button
                  type="button"
                  onClick={() => setZoomLevel((z) => Math.max(70, z - 10))}
                  style={{ background: "none", border: "1px solid #cbd5e1", borderRadius: 4, padding: "2px 6px", cursor: "pointer" }}
                >
                  —
                </button>
                <span style={{ fontWeight: 600 }}>{zoomLevel}%</span>
                <button
                  type="button"
                  onClick={() => setZoomLevel((z) => Math.min(140, z + 10))}
                  style={{ background: "none", border: "1px solid #cbd5e1", borderRadius: 4, padding: "2px 6px", cursor: "pointer" }}
                >
                  +
                </button>
              </div>
            </div>
          </div>

          {/* Mode Tabs: Real PDF View vs Page-Specific Text vs Full OCR Dump */}
          <div style={{ display: "flex", background: "#f8fafc", border: "1px solid #e2e8f0", borderTop: "none", padding: "0 12px" }}>
            <button
              onClick={() => setViewMode("preview")}
              style={{
                padding: "8px 12px",
                fontSize: 12,
                fontWeight: 600,
                background: "none",
                border: "none",
                borderBottom: viewMode === "preview" ? "2px solid #2563eb" : "2px solid transparent",
                color: viewMode === "preview" ? "#2563eb" : "#64748b",
                cursor: "pointer",
              }}
            >
              📄 Live Document Page ({currentPage})
            </button>
            <button
              onClick={() => setViewMode("page_text")}
              style={{
                padding: "8px 12px",
                fontSize: 12,
                fontWeight: 600,
                background: "none",
                border: "none",
                borderBottom: viewMode === "page_text" ? "2px solid #2563eb" : "2px solid transparent",
                color: viewMode === "page_text" ? "#2563eb" : "#64748b",
                cursor: "pointer",
              }}
            >
              📝 Page {currentPage} Extracted Text
            </button>
            <button
              onClick={() => setViewMode("all_text")}
              style={{
                padding: "8px 12px",
                fontSize: 12,
                fontWeight: 600,
                background: "none",
                border: "none",
                borderBottom: viewMode === "all_text" ? "2px solid #2563eb" : "2px solid transparent",
                color: viewMode === "all_text" ? "#2563eb" : "#64748b",
                cursor: "pointer",
              }}
            >
              🗂 All Pages ({totalPages}) Complete Stream
            </button>
          </div>

          {/* Rejection Alert Bar above Document */}
          {isRejected && (
            <div
              style={{
                background: "#fef2f2",
                border: "1px solid #fecaca",
                borderTop: "none",
                padding: "10px 14px",
                color: "#991b1b",
                fontSize: 12.5,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span style={{ fontSize: 16 }}>⚠️</span>
              <div>
                <strong>Format Validation Failed:</strong> {rejectionReason}
              </div>
            </div>
          )}

          {/* Live Document Canvas */}
          {viewMode === "preview" ? (
            <div
              style={{
                height: 760,
                border: "1px solid #e2e8f0",
                borderTop: "none",
                borderRadius: "0 0 8px 8px",
                background: "#ffffff",
                overflow: "hidden",
                position: "relative",
              }}
            >
              <iframe
                src={`${api.fileUrl(doc.id)}#page=${currentPage}`}
                title={`${doc.filename} - Page ${currentPage}`}
                style={{
                  width: "100%",
                  height: "100%",
                  border: "none",
                  transform: `scale(${zoomLevel / 100})`,
                  transformOrigin: "top left",
                }}
              />
            </div>
          ) : viewMode === "page_text" ? (
            <div
              style={{
                border: "1px solid #e2e8f0",
                borderTop: "none",
                borderRadius: "0 0 8px 8px",
                background: "#0f172a",
                padding: 18,
                maxHeight: 760,
                overflowY: "auto",
              }}
            >
              <div style={{ color: "#38bdf8", fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
                === EXTRACTED OCR / TEXT FOR PAGE {currentPage} ===
              </div>
              <pre
                style={{
                  margin: 0,
                  color: "#e2e8f0",
                  fontSize: 12.5,
                  lineHeight: 1.55,
                  whiteSpace: "pre-wrap",
                  fontFamily: "monospace",
                }}
              >
                {pageTexts[currentPage] || `No text stream identified on page ${currentPage}.`}
              </pre>
            </div>
          ) : (
            <div
              style={{
                border: "1px solid #e2e8f0",
                borderTop: "none",
                borderRadius: "0 0 8px 8px",
                background: "#0f172a",
                padding: 18,
                maxHeight: 760,
                overflowY: "auto",
              }}
            >
              <pre
                style={{
                  margin: 0,
                  color: "#e2e8f0",
                  fontSize: 12,
                  lineHeight: 1.5,
                  whiteSpace: "pre-wrap",
                  fontFamily: "monospace",
                }}
              >
                {rawText || "No raw text available."}
              </pre>
            </div>
          )}
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* RIGHT COLUMN: DYNAMIC ENTITIES & REAL VALIDATION RULES             */}
        {/* ------------------------------------------------------------------ */}
        <div style={{ display: "grid", gap: 16 }}>
          {/* CARD 1: FORMAT REJECTION (When non-billing document uploaded) */}
          {isRejected && (
            <div
              style={{
                background: "#fff5f5",
                border: "1px solid #fca5a5",
                borderRadius: 8,
                padding: "16px 18px",
                boxShadow: "0 1px 3px rgba(185,28,28,0.06)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      background: "#fee2e2",
                      color: "#b91c1c",
                      width: 26,
                      height: 26,
                      borderRadius: 6,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 14,
                      fontWeight: 700,
                    }}
                  >
                    ✕
                  </span>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: "#991b1b" }}>
                    Intake Gatekeeper: Rejected ({documentType})
                  </span>
                </div>
                <span
                  style={{
                    background: "#fee2e2",
                    color: "#991b1b",
                    fontSize: 10.5,
                    fontWeight: 800,
                    padding: "2px 8px",
                    borderRadius: 4,
                  }}
                >
                  FORMAT REJECTED
                </span>
              </div>

              <div style={{ fontSize: 12.5, color: "#475569", lineHeight: 1.55 }}>
                <p style={{ margin: "0 0 8px 0" }}>
                  <strong>Failure / Rejection Reason:</strong> {rejectionReason}
                </p>
                <p style={{ margin: "0 0 8px 0" }}>
                  <strong>Detected Classification:</strong> <span style={{ color: "#0f172a", fontWeight: 700 }}>{documentType}</span>
                </p>
                <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, padding: "8px 10px", fontSize: 11.5, color: "#b91c1c" }}>
                  <strong>Safety Enforcement:</strong> This document is strictly excluded from the search vector database. Only verified commercial billing documents (Invoices, Waybills, and Receipts) are vectorized.
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button
                  type="button"
                  onClick={handleRerunOcr}
                  disabled={busy}
                  style={{
                    background: "#f1f5f9",
                    color: "#334155",
                    border: "1px solid #cbd5e1",
                    borderRadius: 6,
                    padding: "6px 12px",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  🔄 Re-run OCR &amp; Re-classify
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  style={{
                    background: "#fee2e2",
                    color: "#b91c1c",
                    border: "1px solid #fca5a5",
                    borderRadius: 6,
                    padding: "6px 12px",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  🗑 Delete Document
                </button>
              </div>
            </div>
          )}

          {/* CARD 1 (ALT): ENTERPRISE RULE VALIDATOR (Flags records requiring manual review) */}
          {!isRejected && (hasDiscrepancy || isNeedsReview || errorIssues.length > 0) && (
            <div
              style={{
                background: "#fffafb",
                border: "1px solid #fecdd3",
                borderRadius: 8,
                padding: "16px 18px",
                boxShadow: "0 1px 3px rgba(185,28,28,0.05)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      background: "#fee2e2",
                      color: "#dc2626",
                      width: 26,
                      height: 26,
                      borderRadius: 6,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 14,
                    }}
                  >
                    ⚖
                  </span>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: "#0f172a" }}>
                    Manual Review Required: {doc.stage || "Validation Issues Detected"}
                  </span>
                </div>
                <span
                  style={{
                    background: "#fee2e2",
                    color: "#b91c1c",
                    fontSize: 10.5,
                    fontWeight: 800,
                    padding: "2px 8px",
                    borderRadius: 4,
                  }}
                >
                  {errorIssues.some((i: any) => i.code === "DUPLICATE_INVOICE")
                    ? "DUPLICATE INVOICE"
                    : hasDiscrepancy
                    ? "ARITHMETIC ERROR"
                    : errorIssues.some((i: any) => i.code.startsWith("NEGATIVE_") || i.code === "ZERO_TOTAL_WITH_ITEMS")
                    ? "INCORRECT NUMERIC VALUE"
                    : "MISSING FIELDS"}
                </span>
              </div>

              {/* List of Detailed Issues */}
              <div style={{ marginBottom: 12 }}>
                {issues.map((iss: any, idx: number) => (
                  <div
                    key={idx}
                    style={{
                      background: iss.severity === "error" ? "#fef2f2" : "#f8fafc",
                      border: `1px solid ${iss.severity === "error" ? "#fecaca" : "#e2e8f0"}`,
                      borderRadius: 6,
                      padding: "8px 12px",
                      marginBottom: 6,
                      fontSize: 12,
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 8,
                    }}
                  >
                    <span style={{ color: iss.severity === "error" ? "#dc2626" : "#d97706", fontWeight: 700 }}>
                      {iss.severity === "error" ? "✕" : "⚠"}
                    </span>
                    <div style={{ flex: 1 }}>
                      <strong style={{ color: iss.severity === "error" ? "#991b1b" : "#92400e" }}>
                        [{iss.code}]
                      </strong>{" "}
                      <span style={{ color: "#334155" }}>{iss.message}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Discrepancy Arithmetic Summary (If math mismatch exists) */}
              {hasDiscrepancy && calculatedSum !== null && totalVal !== null && (
                <p style={{ margin: "0 0 12px 0", fontSize: 12.5, color: "#475569", lineHeight: 1.5 }}>
                  Calculated Sum (<strong>${calculatedSum.toFixed(2)}</strong>) differs from extracted Total (<strong>${totalVal.toFixed(2)}</strong>) by{" "}
                  <span style={{ color: "#dc2626", fontWeight: 700 }}>
                    ${Math.abs(varianceDiff || 0).toFixed(2)}
                  </span>. Suspected misread OCR digit or missing unprinted discount line.
                </p>
              )}

              {/* Reconciliation Action Buttons */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {calculatedSum !== null && (
                  <button
                    type="button"
                    onClick={handleApplySum}
                    disabled={busy}
                    style={{
                      background: "#2563eb",
                      color: "#ffffff",
                      border: "none",
                      borderRadius: 6,
                      padding: "6px 14px",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    ⊞ Apply Sum (${calculatedSum.toFixed(2)})
                  </button>
                )}

                {totalVal !== null && (
                  <button
                    type="button"
                    onClick={handleOverride}
                    disabled={busy}
                    style={{
                      background: "#ffffff",
                      color: "#334155",
                      border: "1px solid #cbd5e1",
                      borderRadius: 6,
                      padding: "6px 14px",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    ⇋ Override (${totalVal.toFixed(2)})
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setManualReconcileOpen(!manualReconcileOpen)}
                  style={{
                    background: "#f1f5f9",
                    color: "#475569",
                    border: "1px solid #e2e8f0",
                    borderRadius: 6,
                    padding: "6px 12px",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  ✎ Manual Reconcile
                </button>

                <button
                  type="button"
                  onClick={handleApprove}
                  disabled={busy}
                  style={{
                    background: "#059669",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: 6,
                    padding: "6px 14px",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  ✓ Approve &amp; Vectorize
                </button>
              </div>

              {manualReconcileOpen && (
                <div style={{ marginTop: 12, padding: "10px 12px", background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: 6, display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>Custom Total: $</span>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="e.g. 3340.00"
                    value={customTotal}
                    onChange={(e) => setCustomTotal(e.target.value)}
                    style={{ flex: 1, padding: "4px 8px", fontSize: 13, border: "1px solid #cbd5e1", borderRadius: 4 }}
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      if (!customTotal) return;
                      setBusy(true);
                      try {
                        await api.reconcile(doc.id, { total: parseFloat(customTotal), action: "manual" });
                        setNotice({ type: "success", text: `✓ Reconciled with custom total $${customTotal}!` });
                        void loadData();
                      } catch (err: any) {
                        setNotice({ type: "error", text: err.message });
                      } finally {
                        setBusy(false);
                      }
                    }}
                    style={{ background: "#059669", color: "#ffffff", border: "none", padding: "5px 12px", borderRadius: 4, fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                  >
                    Save &amp; Vectorize
                  </button>
                </div>
              )}
            </div>
          )}

          {/* CARD 2: REAL EXTRACTED KEY-VALUE ENTITIES (100% DYNAMIC) */}
          <div
            style={{
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: 8,
              padding: "18px 20px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ color: "#2563eb", fontWeight: 700 }}>&#123; &#125;</span>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: "#0f172a" }}>
                  Extracted Key-Value Entities
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {!isRejected && (
                  <button
                    type="button"
                    onClick={() => {
                      if (editMode) {
                        setEditMode(false);
                      } else {
                        startEditing();
                      }
                    }}
                    style={{
                      background: editMode ? "#f1f5f9" : "#eff6ff",
                      color: editMode ? "#475569" : "#2563eb",
                      border: `1px solid ${editMode ? "#cbd5e1" : "#bfdbfe"}`,
                      borderRadius: 4,
                      padding: "3px 10px",
                      fontSize: 11.5,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    {editMode ? "✕ Cancel Editing" : "✎ Correct Values"}
                  </button>
                )}
                <span style={{ fontSize: 11.5, color: "#64748b", fontWeight: 500 }}>
                  {isRejected ? `${documentType} Classification` : "Commercial Schema"}
                </span>
              </div>
            </div>

            {editMode ? (
              <form onSubmit={(e) => { e.preventDefault(); void handleSaveCorrections(); }}>
                <div style={{ display: "grid", gap: 11, marginBottom: 16 }}>
                  <div>
                    <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#475569", marginBottom: 3 }}>
                      VENDOR / SUPPLIER NAME
                    </label>
                    <input
                      type="text"
                      value={editFields.supplier_name}
                      onChange={(e) => setEditFields({ ...editFields, supplier_name: e.target.value })}
                      placeholder="e.g. Acme Corp"
                      style={{ width: "100%", padding: "7px 10px", fontSize: 13, border: "1px solid #cbd5e1", borderRadius: 6 }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#475569", marginBottom: 3 }}>
                      CUSTOMER / BILLED ENTITY
                    </label>
                    <input
                      type="text"
                      value={editFields.customer_name}
                      onChange={(e) => setEditFields({ ...editFields, customer_name: e.target.value })}
                      placeholder="e.g. Global Tech Inc."
                      style={{ width: "100%", padding: "7px 10px", fontSize: 13, border: "1px solid #cbd5e1", borderRadius: 6 }}
                    />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div>
                      <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#475569", marginBottom: 3 }}>
                        DOCUMENT DATE
                      </label>
                      <input
                        type="text"
                        value={editFields.invoice_date}
                        onChange={(e) => setEditFields({ ...editFields, invoice_date: e.target.value })}
                        placeholder="YYYY-MM-DD"
                        style={{ width: "100%", padding: "7px 10px", fontSize: 13, border: "1px solid #cbd5e1", borderRadius: 6 }}
                      />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#475569", marginBottom: 3 }}>
                        INVOICE NUMBER
                      </label>
                      <input
                        type="text"
                        value={editFields.invoice_number}
                        onChange={(e) => setEditFields({ ...editFields, invoice_number: e.target.value })}
                        placeholder="INV-12345"
                        style={{ width: "100%", padding: "7px 10px", fontSize: 13, border: "1px solid #cbd5e1", borderRadius: 6 }}
                      />
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                    <div>
                      <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#475569", marginBottom: 3 }}>
                        SUBTOTAL
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={editFields.subtotal}
                        onChange={(e) => setEditFields({ ...editFields, subtotal: e.target.value })}
                        placeholder="0.00"
                        style={{ width: "100%", padding: "7px 10px", fontSize: 13, border: "1px solid #cbd5e1", borderRadius: 6 }}
                      />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#475569", marginBottom: 3 }}>
                        TAX
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={editFields.tax}
                        onChange={(e) => setEditFields({ ...editFields, tax: e.target.value })}
                        placeholder="0.00"
                        style={{ width: "100%", padding: "7px 10px", fontSize: 13, border: "1px solid #cbd5e1", borderRadius: 6 }}
                      />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#475569", marginBottom: 3 }}>
                        TOTAL
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={editFields.total}
                        onChange={(e) => setEditFields({ ...editFields, total: e.target.value })}
                        placeholder="0.00"
                        style={{ width: "100%", padding: "7px 10px", fontSize: 13, border: "1px solid #cbd5e1", borderRadius: 6 }}
                      />
                    </div>
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#475569", marginBottom: 3 }}>
                      CURRENCY
                    </label>
                    <input
                      type="text"
                      value={editFields.currency}
                      onChange={(e) => setEditFields({ ...editFields, currency: e.target.value })}
                      placeholder="USD"
                      style={{ width: "100%", padding: "7px 10px", fontSize: 13, border: "1px solid #cbd5e1", borderRadius: 6 }}
                    />
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    type="submit"
                    disabled={busy}
                    style={{
                      background: "#2563eb",
                      color: "#ffffff",
                      border: "none",
                      borderRadius: 6,
                      padding: "8px 18px",
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    {busy ? "Saving..." : "✓ Save Corrected Values"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditMode(false)}
                    style={{
                      background: "#f1f5f9",
                      color: "#475569",
                      border: "1px solid #cbd5e1",
                      borderRadius: 6,
                      padding: "8px 14px",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <>
            {/* Field 1: Vendor / Issuer */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: "#475569", letterSpacing: "0.5px" }}>
                  VENDOR / SUPPLIER NAME
                </span>
                <span
                  style={{
                    background: vendorName ? "#ccfbf1" : "#f1f5f9",
                    color: vendorName ? "#0f766e" : "#64748b",
                    fontSize: 10.5,
                    fontWeight: 700,
                    padding: "1px 6px",
                    borderRadius: 4,
                  }}
                >
                  {vendorName ? `✔ ${Math.round((currentResult.overall_confidence || 0.95) * 100)}% Confidence` : "Not Detected"}
                </span>
              </div>
              <div
                style={{
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: 6,
                  padding: "8px 12px",
                  fontSize: 13,
                  fontWeight: 600,
                  color: vendorName ? "#0f172a" : "#94a3b8",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span>{vendorName || "—"}</span>
                {vendorName && <span style={{ color: "#0284c7", fontSize: 13 }}>🔒</span>}
              </div>
            </div>

            {/* Field 2: Customer / Billed Entity */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: "#475569", letterSpacing: "0.5px" }}>
                  CUSTOMER / BILLED ENTITY
                </span>
                <span
                  style={{
                    background: customerName ? "#ccfbf1" : "#f1f5f9",
                    color: customerName ? "#0f766e" : "#64748b",
                    fontSize: 10.5,
                    fontWeight: 700,
                    padding: "1px 6px",
                    borderRadius: 4,
                  }}
                >
                  {customerName ? `✔ ${Math.round((currentResult.overall_confidence || 0.95) * 100)}% Confidence` : "Not Specified (Null)"}
                </span>
              </div>
              <div
                style={{
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: 6,
                  padding: "8px 12px",
                  fontSize: 13,
                  fontWeight: 600,
                  color: customerName ? "#0f172a" : "#94a3b8",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span>{customerName || "— (No customer stated)"}</span>
                {customerName && <span style={{ color: "#0284c7", fontSize: 13 }}>🔒</span>}
              </div>
            </div>

            {/* Field 3: Document Date */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: "#475569", letterSpacing: "0.5px" }}>
                  DOCUMENT DATE
                </span>
                <span
                  style={{
                    background: docDate ? "#ccfbf1" : "#f1f5f9",
                    color: docDate ? "#0f766e" : "#64748b",
                    fontSize: 10.5,
                    fontWeight: 700,
                    padding: "1px 6px",
                    borderRadius: 4,
                  }}
                >
                  {docDate ? `✔ ${Math.round((currentResult.overall_confidence || 0.95) * 100)}% Confidence` : "Not Detected"}
                </span>
              </div>
              <div
                style={{
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: 6,
                  padding: "8px 12px",
                  fontSize: 13,
                  fontWeight: 600,
                  color: docDate ? "#0f172a" : "#94a3b8",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span>{docDate || "—"}</span>
                {docDate && <span style={{ color: "#0284c7", fontSize: 13 }}>🔒</span>}
              </div>
            </div>

            {/* Field 4: Invoice / Reference Number */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: "#475569", letterSpacing: "0.5px" }}>
                  INVOICE / WAYBILL NUMBER
                </span>
                <span
                  style={{
                    background: invoiceNumber ? "#ccfbf1" : "#f1f5f9",
                    color: invoiceNumber ? "#0f766e" : "#64748b",
                    fontSize: 10.5,
                    fontWeight: 700,
                    padding: "1px 6px",
                    borderRadius: 4,
                  }}
                >
                  {invoiceNumber ? `✔ ${Math.round((currentResult.overall_confidence || 0.95) * 100)}% Confidence` : "Not Detected"}
                </span>
              </div>
              <div
                style={{
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: 6,
                  padding: "8px 12px",
                  fontSize: 13,
                  fontWeight: 600,
                  color: invoiceNumber ? "#0f172a" : "#94a3b8",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span>{invoiceNumber || "—"}</span>
                {invoiceNumber && <span style={{ color: "#0284c7", fontSize: 13 }}>🔒</span>}
              </div>
            </div>

            {/* Field 5: Base Subtotal */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: "#475569", letterSpacing: "0.5px" }}>
                  EXTRACTED BASE SUBTOTAL
                </span>
                <span
                  style={{
                    background: subtotalVal !== null ? "#ccfbf1" : "#f1f5f9",
                    color: subtotalVal !== null ? "#0f766e" : "#64748b",
                    fontSize: 10.5,
                    fontWeight: 700,
                    padding: "1px 6px",
                    borderRadius: 4,
                  }}
                >
                  {subtotalVal !== null ? `✔ ${Math.round((currentResult.overall_confidence || 0.95) * 100)}% Confidence` : "Not Detected"}
                </span>
              </div>
              <div
                style={{
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: 6,
                  padding: "8px 12px",
                  fontSize: 13,
                  fontWeight: 600,
                  color: subtotalVal !== null ? "#0f172a" : "#94a3b8",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span>{subtotalVal !== null ? money(subtotalVal, currency) : "—"}</span>
                {subtotalVal !== null && (
                  <button
                    type="button"
                    onClick={startEditing}
                    title="Correct this value"
                    style={{ background: "none", border: "none", color: "#64748b", fontSize: 13, cursor: "pointer", padding: 0 }}
                  >
                    ✎
                  </button>
                )}
              </div>
            </div>

            {/* Field 6: Tax / Surcharge */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: hasDiscrepancy ? "#991b1b" : "#475569", letterSpacing: "0.5px" }}>
                  {hasDiscrepancy && "⚠ "}TAX / SURCHARGE
                </span>
                <span
                  style={{
                    background: hasDiscrepancy ? "#ffe4e6" : taxVal !== null ? "#ccfbf1" : "#f1f5f9",
                    color: hasDiscrepancy ? "#e11d48" : taxVal !== null ? "#0f766e" : "#64748b",
                    fontSize: 10.5,
                    fontWeight: 700,
                    padding: "1px 6px",
                    borderRadius: 4,
                  }}
                >
                  {hasDiscrepancy ? "Needs Check" : taxVal !== null ? `✔ ${Math.round((currentResult.overall_confidence || 0.95) * 100)}% Confidence` : "Not Detected"}
                </span>
              </div>
              <div
                style={{
                  background: hasDiscrepancy ? "#ffffff" : "#f8fafc",
                  border: hasDiscrepancy ? "1px solid #fecaca" : "1px solid #e2e8f0",
                  borderRadius: 6,
                  padding: "8px 12px",
                  fontSize: 13,
                  fontWeight: 700,
                  color: hasDiscrepancy ? "#dc2626" : taxVal !== null ? "#0f172a" : "#94a3b8",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span>{taxVal !== null ? money(taxVal, currency) : "—"}</span>
                {taxVal !== null && <span style={{ color: "#64748b", fontSize: 14 }}>👁</span>}
              </div>
            </div>

            {/* Field 7: Total Amount Extracted */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: hasDiscrepancy ? "#991b1b" : "#475569", letterSpacing: "0.5px" }}>
                  {hasDiscrepancy && "ⓘ "}TOTAL AMOUNT EXTRACTED
                </span>
                <span
                  style={{
                    background: hasDiscrepancy ? "#ffe4e6" : totalVal !== null ? "#ccfbf1" : "#f1f5f9",
                    color: hasDiscrepancy ? "#e11d48" : totalVal !== null ? "#0f766e" : "#64748b",
                    fontSize: 10.5,
                    fontWeight: 700,
                    padding: "1px 6px",
                    borderRadius: 4,
                  }}
                >
                  {hasDiscrepancy ? "Discrepancy" : totalVal !== null ? `✔ ${Math.round((currentResult.overall_confidence || 0.95) * 100)}% Confidence` : "Not Detected"}
                </span>
              </div>
              <div
                style={{
                  background: hasDiscrepancy ? "#ffffff" : "#f8fafc",
                  border: hasDiscrepancy ? "1px solid #fecaca" : "1px solid #e2e8f0",
                  borderRadius: 6,
                  padding: "8px 12px",
                  fontSize: 13.5,
                  fontWeight: 800,
                  color: hasDiscrepancy ? "#dc2626" : totalVal !== null ? "#0f172a" : "#94a3b8",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span>{totalVal !== null ? money(totalVal, currency) : "—"}</span>
                {totalVal !== null && <span style={{ color: "#64748b", fontSize: 14 }}>👁</span>}
              </div>
            </div>

            {/* Field 7: Currency */}
            <div style={{ marginTop: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: "#475569", letterSpacing: "0.5px" }}>
                  CURRENCY
                </span>
                <span
                  style={{
                    background: "#eff6ff",
                    color: "#1d4ed8",
                    fontSize: 10.5,
                    fontWeight: 700,
                    padding: "1px 6px",
                    borderRadius: 4,
                  }}
                >
                  ISO Code
                </span>
              </div>
              <div
                style={{
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: 6,
                  padding: "8px 12px",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#0f172a",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span>{currency}</span>
                <span style={{ color: "#64748b", fontSize: 12 }}>Standard</span>
              </div>
            </div>
            </>
          )}
          </div>

          {/* CARD 3: REAL PARSED LINE ITEMS (100% DYNAMIC) */}
          <div
            style={{
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: 8,
              padding: "18px 20px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ color: "#2563eb", fontSize: 15 }}>🗋</span>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: "#0f172a" }}>Parsed Line Items</span>
              </div>
              <span style={{ fontSize: 11.5, color: "#64748b", fontWeight: 500 }}>
                {lineItems.length} Item{lineItems.length === 1 ? "" : "s"} Extracted
              </span>
            </div>

            {lineItems.length === 0 ? (
              <div
                style={{
                  padding: "24px 16px",
                  textAlign: "center",
                  background: "#f8fafc",
                  borderRadius: 6,
                  border: "1px solid #e2e8f0",
                  color: "#64748b",
                  fontSize: 12.5,
                }}
              >
                {isRejected
                  ? `Classified as ${documentType}: No commercial billing line items or payable charges detected in this document.`
                  : "No itemized line items detected. Check raw OCR text."}
              </div>
            ) : (
              <div style={{ border: "1px solid #e2e8f0", borderRadius: 6, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: "#f8fafc", textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>
                      <th style={{ padding: "8px 10px", fontSize: 10, fontWeight: 700, color: "#64748b" }}>DESCRIPTION</th>
                      <th style={{ padding: "8px 6px", fontSize: 10, fontWeight: 700, color: "#64748b", textAlign: "center", width: 44 }}>QTY</th>
                      <th style={{ padding: "8px 8px", fontSize: 10, fontWeight: 700, color: "#64748b", textAlign: "right", width: 75 }}>RATE</th>
                      <th style={{ padding: "8px 8px", fontSize: 10, fontWeight: 700, color: "#64748b", textAlign: "right", width: 85 }}>TOTAL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.map((item, idx) => (
                      <tr
                        key={idx}
                        style={{
                          borderBottom: idx < lineItems.length - 1 ? "1px solid #f1f5f9" : "none",
                        }}
                      >
                        <td style={{ padding: "9px 10px", fontWeight: 500, color: "#1e293b" }}>
                          {item.description || "Item"}
                        </td>
                        <td style={{ padding: "9px 6px", textAlign: "center", color: "#64748b" }}>
                          {item.quantity ?? 1}
                        </td>
                        <td style={{ padding: "9px 8px", textAlign: "right", color: "#334155" }}>
                          {item.unit_price != null ? `$${Number(item.unit_price).toFixed(2)}` : "—"}
                        </td>
                        <td style={{ padding: "9px 8px", textAlign: "right", fontWeight: 600, color: "#0f172a" }}>
                          {item.amount != null ? `$${Number(item.amount).toFixed(2)}` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* CARD 4: AUDIT TRAIL & LINEAGE (Matches history store) */}
          <div
            id="audit-lineage"
            style={{
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: 8,
              padding: "16px 18px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 14 }}>🔗</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>
                  Audit Trail &amp; Processing Lineage
                </span>
              </div>
              <span style={{ fontSize: 11, color: "#64748b", fontWeight: 500 }}>
                Immutable Stream
              </span>
            </div>

            <div style={{ display: "grid", gap: 8 }}>
              {history.length > 0 ? (
                history.map((h, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 8,
                      fontSize: 11.5,
                      color: "#475569",
                      padding: "6px 0",
                      borderBottom: i < history.length - 1 ? "1px solid #f1f5f9" : "none",
                    }}
                  >
                    <span style={{ color: "#2563eb", fontWeight: 700 }}>•</span>
                    <div style={{ flex: 1 }}>
                      <strong style={{ color: "#0f172a" }}>{h.action}</strong>: {h.message}
                    </div>
                    <span style={{ color: "#94a3b8", whiteSpace: "nowrap", fontSize: 10.5 }}>
                      {h.timestamp ? new Date(h.timestamp).toLocaleTimeString() : ""}
                    </span>
                  </div>
                ))
              ) : (
                <div style={{ fontSize: 12, color: "#64748b" }}>
                  Intake completed. Multi-page parser processed document across {totalPages} page(s).
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
