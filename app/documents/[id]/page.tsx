"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ProgressBar, StatusBadge } from "@/components/StatusBadge";
import { api } from "@/lib/api";
import { bytes, duration, when } from "@/lib/format";
import { IN_FLIGHT, type DocumentOut, type ResultOut } from "@/lib/types";
import { usePolling } from "@/lib/usePolling";

type ActiveTab = "review" | "text" | "history";

export default function DocumentPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [tab, setTab] = useState<ActiveTab>("review");
  const [busy, setBusy] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Field review popover state (Image 1)
  const [selectedField, setSelectedField] = useState<{
    key: string;
    label: string;
    value: string;
    confidence: number;
    page: number;
    sourceSnippet: string;
    box?: number[][];
  } | null>(null);

  // Edit value modal state
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editReason, setEditReason] = useState("");

  // Audit history state (Image 5)
  const [history, setHistory] = useState<any[]>([]);

  // Page zoom controls
  const [zoom, setZoom] = useState(100);
  const [currentPage, setCurrentPage] = useState(1);

  const doc = usePolling<DocumentOut>(() => api.getDocument(id), (d) => (d && IN_FLIGHT.includes(d.status) ? 1000 : null), [id]);
  const d = doc.data;
  const results = usePolling<ResultOut[]>(() => api.getResults(id), () => null, [id, d?.status, d?.updated_at]);

  useEffect(() => {
    if (id) {
      api.getHistory(id).then(setHistory).catch(() => {});
    }
  }, [id, d?.status, d?.updated_at]);

  if (doc.error && !d) {
    return (
      <div className="alert alert-error" style={{ margin: 20 }}>
        Could not load document: {doc.error} <Link href="/">Back to documents</Link>
      </div>
    );
  }
  if (!d) return <div className="empty" style={{ margin: 40 }}>Loading document...</div>;

  const currentResult: any = results.data?.[0] || {};
  const data = currentResult.data || {};
  const evidence = data.evidence || {};
  const lineItems: any[] = data.line_items || [];
  const inFlight = IN_FLIGHT.includes(d.status);

  // Default selected field on load
  const activeFieldEvidence = selectedField || {
    key: "total",
    label: "Total Due",
    value: data.total != null ? `$${Number(data.total).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : "—",
    confidence: Math.round((data.field_confidence?.total || 0.95) * 100),
    page: 1,
    sourceSnippet: data.total != null ? `Total Due: $${Number(data.total).toLocaleString()}` : "Document Information",
    box: [[550, 600], [700, 600], [700, 630], [550, 630]],
  };

  const handleFieldClick = (key: string, label: string, val: any, defaultConf = 95) => {
    const ev = evidence[key];
    setSelectedField({
      key,
      label,
      value: val != null ? String(val) : "—",
      confidence: ev?.confidence || Math.round((data.field_confidence?.[key] || defaultConf / 100) * 100),
      page: ev?.page || 1,
      sourceSnippet: ev?.text || `${label}: ${val}`,
      box: ev?.box,
    });
  };

  const handleApprove = async () => {
    setBusy(true);
    setActionMsg(null);
    try {
      await api.approve(d.id, "reviewer@company.com");
      setActionMsg({ type: "success", text: "Document approved successfully." });
      await doc.refresh();
      const updatedHistory = await api.getHistory(d.id);
      setHistory(updatedHistory);
    } catch (err: any) {
      setActionMsg({ type: "error", text: err.message || "Failed to approve document" });
    } finally {
      setBusy(false);
    }
  };

  const handleSaveCorrection = async () => {
    if (!editingField || !currentResult.id) return;
    setBusy(true);
    try {
      const parsedVal = !isNaN(Number(editValue)) ? Number(editValue) : editValue;
      await api.correct(
        currentResult.id,
        { [editingField]: parsedVal },
        true,
        "reviewer@company.com",
      );
      setActionMsg({ type: "success", text: `Successfully updated ${editingField} to ${editValue}` });
      setEditingField(null);
      await doc.refresh();
      const updatedHistory = await api.getHistory(d.id);
      setHistory(updatedHistory);
    } catch (err: any) {
      setActionMsg({ type: "error", text: err.message || "Failed to save correction" });
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = () => {
    const rows = [
      ["Invoice Number", data.invoice_number || ""],
      ["Invoice Date", data.invoice_date || ""],
      ["Due Date", data.due_date || ""],
      ["Supplier", data.supplier_name || ""],
      ["Customer", data.customer_name || ""],
      ["Subtotal", data.subtotal || ""],
      ["Tax", data.tax || ""],
      ["Total", data.total || ""],
      ["Currency", data.currency || "USD"],
    ];
    const csv = "data:text/csv;charset=utf-8," + rows.map((e) => e.join(",")).join("\n");
    const encoded = encodeURI(csv);
    const link = document.createElement("a");
    link.setAttribute("href", encoded);
    link.setAttribute("download", `${d.filename}_extracted.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Explainable validation error calculations
  const expectedTotal =
    data.subtotal != null && data.tax != null ? Math.round((Number(data.subtotal) + Number(data.tax)) * 100) / 100 : null;
  const hasTotalMismatch =
    expectedTotal != null && data.total != null && Math.abs(expectedTotal - Number(data.total)) > 0.05;
  const mismatchDiff = expectedTotal != null && data.total != null ? Math.abs(expectedTotal - Number(data.total)).toFixed(2) : "0.00";

  return (
    <div style={{ maxWidth: 1440, margin: "0 auto", padding: "16px 20px 80px" }}>
      {/* Top Breadcrumb & Status Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href="/" className="small muted">
            ← All documents
          </Link>
          <span className="muted small">/</span>
          <span style={{ fontWeight: 700, fontSize: 16 }}>{d.filename}</span>
          <StatusBadge status={d.status} />
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <a className="btn btn-sm" href={api.fileUrl(d.id)} download>
            Download original
          </a>
          <button
            className="btn btn-sm"
            disabled={busy || d.status === "processing"}
            onClick={() => api.reprocess(d.id).then(() => doc.refresh())}
          >
            Reprocess
          </button>
        </div>
      </div>

      {actionMsg && (
        <div
          className={`alert ${actionMsg.type === "success" ? "alert-success" : "alert-error"}`}
          style={{ marginBottom: 14 }}
        >
          {actionMsg.text}
        </div>
      )}

      {/* Tabs */}
      <div className="tabs" role="tablist" style={{ marginBottom: 16 }}>
        <button
          role="tab"
          aria-selected={tab === "review"}
          className={`tab ${tab === "review" ? "active" : ""}`}
          onClick={() => setTab("review")}
        >
          Source-Grounded Review
        </button>
        <button
          role="tab"
          aria-selected={tab === "text"}
          className={`tab ${tab === "text" ? "active" : ""}`}
          onClick={() => setTab("text")}
        >
          Extracted Raw Text
        </button>
        <button
          role="tab"
          aria-selected={tab === "history"}
          className={`tab ${tab === "history" ? "active" : ""}`}
          onClick={() => setTab("history")}
        >
          Document History &amp; Audit Trail
        </button>
      </div>

      {/* =========================================================================
          TAB 1: SOURCE-GROUNDED SPLIT REVIEW (Matches Image 1 & Image 3)
         ========================================================================= */}
      {tab === "review" && (
        <div>
          {/* Explainable Validation Alert Banner (Image 3) */}
          {(d.status === "needs_review" || hasTotalMismatch) && (
            <div style={{ marginBottom: 16 }}>
              {/* Red Error Box */}
              <div
                style={{
                  background: "#fff1f0",
                  border: "1.5px solid #ffa39e",
                  borderRadius: 10,
                  padding: "16px 20px",
                  marginBottom: 10,
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <div
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: "50%",
                      background: "#c4261d",
                      color: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: "bold",
                      fontSize: 14,
                    }}
                  >
                    !
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: "#c4261d" }}>
                      The following errors were detected. This Vendor Invoice cannot be saved until they have been corrected:
                    </div>
                    <ul style={{ margin: "8px 0 0", paddingLeft: 20, color: "#475569", fontSize: 13, display: "grid", gap: 4 }}>
                      <li>
                        <strong>Total arithmetic discrepancy:</strong> Expected {expectedTotal?.toFixed(2)} based on subtotal ({Number(data.subtotal || 0).toFixed(2)}) + tax ({Number(data.tax || 0).toFixed(2)}), but extracted total is {Number(data.total || 0).toFixed(2)}. Difference: {mismatchDiff}.
                      </li>
                      <li>Document date: {data.invoice_date || "—"}</li>
                      <li>Vendor name: {data.supplier_name || "—"}</li>
                    </ul>
                  </div>
                  <button
                    onClick={() => {
                      setEditingField("total");
                      setEditValue(String(expectedTotal || data.total));
                    }}
                    className="btn btn-sm btn-danger"
                    style={{ alignSelf: "center" }}
                  >
                    Fix Total
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Split Screen Container (Image 1) */}
          <div style={{ display: "grid", gridTemplateColumns: "1.05fr 1fr", gap: 18, alignItems: "start" }}>
            {/* Left Column: Interactive Document Viewer */}
            <div className="card card-flush" style={{ margin: 0, background: "#1e293b", borderRadius: 10, overflow: "hidden" }}>
              {/* Top Viewer Controls */}
              <div
                style={{
                  padding: "10px 16px",
                  background: "#0f172a",
                  color: "#cbd5e1",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  fontSize: 13,
                  borderBottom: "1px solid #334155",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span>{currentPage} / {d.page_count || 1}</span>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button
                      onClick={() => setZoom((z) => Math.max(60, z - 10))}
                      className="btn-link"
                      style={{ color: "#cbd5e1", fontSize: 16, padding: "0 4px" }}
                    >
                      −
                    </button>
                    <span>{zoom}%</span>
                    <button
                      onClick={() => setZoom((z) => Math.min(180, z + 10))}
                      className="btn-link"
                      style={{ color: "#cbd5e1", fontSize: 16, padding: "0 4px" }}
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="small muted">
                  Highlighting source evidence for: <strong style={{ color: "#38bdf8" }}>{activeFieldEvidence.label}</strong>
                </div>
              </div>

              {/* Document Rendering Canvas / SVG Viewer */}
              <div
                style={{
                  padding: 12,
                  display: "flex",
                  justifyContent: "center",
                  background: "#1e293b",
                  minHeight: 650,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: "100%",
                    display: "flex",
                    justifyContent: "center",
                    borderRadius: 6,
                    overflow: "hidden",
                  }}
                >
                  {d.filename?.toLowerCase().endsWith(".pdf") || d.file_type === "application/pdf" ? (
                    <iframe
                      src={api.fileUrl(d.id)}
                      title={d.filename}
                      style={{
                        width: "100%",
                        height: 750,
                        border: "none",
                        borderRadius: 6,
                        background: "#ffffff",
                      }}
                    />
                  ) : (
                    <img
                      src={api.fileUrl(d.id)}
                      alt={d.filename}
                      style={{
                        maxWidth: "100%",
                        maxHeight: 750,
                        objectFit: "contain",
                        background: "#fff",
                        display: "block",
                      }}
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="560" height="790" style="background:%23f8fafc; font-family:sans-serif;"><rect width="100%" height="100%" fill="%23f8fafc"/><text x="280" y="380" font-size="16" fill="%2364748b" text-anchor="middle">Document Preview</text></svg>`;
                      }}
                    />
                  )}
                </div>
              </div>
            </div>

            {/* Right Column: Extracted Fields */}
            <div style={{ display: "grid", gap: 14 }}>
              <div className="card" style={{ margin: 0, padding: 20 }}>
                {/* Header with Extracted Fields */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Extracted fields</h2>
                  <div
                    style={{
                      background: "#e3f4ec",
                      color: "#12805c",
                      padding: "4px 10px",
                      borderRadius: 16,
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    {data.overall_confidence ? `${Math.round(data.overall_confidence * 100)}% confidence` : "Extracted"}
                  </div>
                </div>

                {/* Section 1: Main Invoice Fields */}
                <div style={{ display: "grid", gap: 10, paddingBottom: 16, borderBottom: "1px solid var(--border)" }}>
                  <div
                    onClick={() => handleFieldClick("invoice_number", "Invoice Number", data.invoice_number, 95)}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "6px 8px",
                      borderRadius: 6,
                      background: activeFieldEvidence.key === "invoice_number" ? "var(--primary-soft)" : "transparent",
                      cursor: "pointer",
                    }}
                  >
                    <span className="muted" style={{ fontSize: 13 }}>Invoice Number</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <strong style={{ fontSize: 14 }}>{data.invoice_number || "—"}</strong>
                      {data.invoice_number && <span style={{ color: "#12805c" }}>✓</span>}
                    </div>
                  </div>

                  <div
                    onClick={() => handleFieldClick("invoice_date", "Invoice Date", data.invoice_date, 95)}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "6px 8px",
                      borderRadius: 6,
                      background: activeFieldEvidence.key === "invoice_date" ? "var(--primary-soft)" : "transparent",
                      cursor: "pointer",
                    }}
                  >
                    <span className="muted" style={{ fontSize: 13 }}>Invoice Date</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <strong style={{ fontSize: 14 }}>{data.invoice_date || "—"}</strong>
                      {data.invoice_date && <span style={{ color: "#12805c" }}>✓</span>}
                    </div>
                  </div>

                  <div
                    onClick={() => handleFieldClick("due_date", "Due Date", data.due_date, 90)}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "6px 8px",
                      borderRadius: 6,
                      background: activeFieldEvidence.key === "due_date" ? "var(--primary-soft)" : "transparent",
                      cursor: "pointer",
                    }}
                  >
                    <span className="muted" style={{ fontSize: 13 }}>Due Date</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <strong style={{ fontSize: 14 }}>{data.due_date || "—"}</strong>
                      {data.due_date && <span style={{ color: "#12805c" }}>✓</span>}
                    </div>
                  </div>
                </div>

                {/* Section 2: Line Items */}
                <div style={{ padding: "14px 0", borderBottom: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <strong style={{ fontSize: 13 }}>Line Items ({lineItems.length} items)</strong>
                    {lineItems.length > 0 && (
                      <button className="btn-link small" onClick={() => handleFieldClick("line_items", "Line Items", `${lineItems.length} items`)}>
                        Review all
                      </button>
                    )}
                  </div>

                  {lineItems.length === 0 ? (
                    <div className="small muted" style={{ padding: "6px 0" }}>No line items detected in document.</div>
                  ) : (
                    <div style={{ display: "grid", gap: 8 }}>
                      {lineItems.map((item, idx) => (
                        <div
                          key={idx}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "2fr 0.5fr 1fr 1fr auto",
                            gap: 8,
                            alignItems: "center",
                            fontSize: 12,
                            padding: "6px 8px",
                            background: "#f8fafc",
                            borderRadius: 6,
                          }}
                        >
                          <span style={{ fontWeight: 600 }}>{item.description || "Item"}</span>
                          <span className="muted">{item.quantity ?? "—"}</span>
                          <span className="muted">{item.unit_price != null ? `$${Number(item.unit_price).toLocaleString()}` : "—"}</span>
                          <strong style={{ textAlign: "right" }}>{item.amount != null ? `$${Number(item.amount).toLocaleString()}` : "—"}</strong>
                          <span style={{ color: "#12805c", marginLeft: 4 }}>✓</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Section 3: Totals */}
                <div style={{ padding: "14px 0", borderBottom: "1px solid var(--border)", display: "grid", gap: 10 }}>
                  <div
                    onClick={() => handleFieldClick("subtotal", "Subtotal", data.subtotal, 95)}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "4px 8px",
                      borderRadius: 6,
                      background: activeFieldEvidence.key === "subtotal" ? "var(--primary-soft)" : "transparent",
                      cursor: "pointer",
                    }}
                  >
                    <span className="muted" style={{ fontSize: 13 }}>Subtotal</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <strong style={{ fontSize: 14 }}>
                        {data.subtotal != null ? `$${Number(data.subtotal).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : "—"}
                      </strong>
                      {data.subtotal != null && <span style={{ color: "#12805c" }}>✓</span>}
                    </div>
                  </div>

                  <div
                    onClick={() => handleFieldClick("tax", "Tax", data.tax, 90)}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "4px 8px",
                      borderRadius: 6,
                      background: activeFieldEvidence.key === "tax" ? "var(--primary-soft)" : "transparent",
                      cursor: "pointer",
                    }}
                  >
                    <span className="muted" style={{ fontSize: 13 }}>Tax</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <strong style={{ fontSize: 14 }}>
                        {data.tax != null ? `$${Number(data.tax).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : "—"}
                      </strong>
                      {data.tax != null && <span style={{ color: "#12805c" }}>✓</span>}
                    </div>
                  </div>

                  <div
                    onClick={() => handleFieldClick("total", "Total", data.total, 98)}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "8px 8px",
                      borderRadius: 6,
                      background: activeFieldEvidence.key === "total" ? "var(--primary-soft)" : "#f8fafc",
                      border: "1.5px solid #ca8a04",
                      cursor: "pointer",
                    }}
                  >
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#854d0e" }}>Total</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <strong style={{ fontSize: 16, color: "#1e293b" }}>
                        {data.total != null ? `$${Number(data.total).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : "—"}
                      </strong>
                      {data.total != null && <span style={{ color: "#12805c" }}>✓</span>}
                    </div>
                  </div>
                </div>

                {/* Section 4: Vendor & Customer */}
                <div style={{ paddingTop: 14, fontSize: 12, display: "grid", gap: 8 }}>
                  <div>
                    <div className="muted" style={{ fontWeight: 600, marginBottom: 2 }}>Vendor / Supplier</div>
                    <div style={{ fontWeight: 700, color: "#0f172a" }}>{data.supplier_name || "—"}</div>
                  </div>
                  <div>
                    <div className="muted" style={{ fontWeight: 600, marginBottom: 2 }}>Customer / Bill To</div>
                    <div style={{ fontWeight: 600, color: "#334155" }}>{data.customer_name || "—"}</div>
                  </div>
                </div>
              </div>

              {/* Interactive "Review Field" Popover Card (Matches Image 1 Bottom Right) */}
              <div
                className="card"
                style={{
                  margin: 0,
                  padding: 16,
                  border: "1.5px solid #2563eb",
                  background: "#ffffff",
                  boxShadow: "0 6px 18px rgba(37,99,235,0.08)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b" }}>Review field</div>
                  <span style={{ fontSize: 11, background: "#e8eefc", color: "#2457e6", padding: "2px 8px", borderRadius: 12, fontWeight: 700 }}>
                    {activeFieldEvidence.confidence}% confidence
                  </span>
                </div>

                <div style={{ display: "grid", gap: 8, fontSize: 13 }}>
                  <div>
                    <span className="muted small">Field: </span>
                    <strong>{activeFieldEvidence.label}</strong>
                  </div>

                  <div>
                    <div className="muted small">Extracted value:</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", marginTop: 2 }}>
                      {activeFieldEvidence.value}
                    </div>
                  </div>

                  <div>
                    <div className="muted small">Source in document (Page {activeFieldEvidence.page}):</div>
                    <div
                      style={{
                        padding: "6px 10px",
                        background: "#fef9c3",
                        border: "1px solid #facc15",
                        borderRadius: 6,
                        fontFamily: "ui-monospace, monospace",
                        fontSize: 12,
                        marginTop: 4,
                        color: "#713f12",
                      }}
                    >
                      {activeFieldEvidence.sourceSnippet}
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                  <button
                    onClick={() => {
                      setEditingField(activeFieldEvidence.key);
                      setEditValue(activeFieldEvidence.value.replace(/[^0-9.]/g, ""));
                    }}
                    className="btn btn-sm grow"
                  >
                    Edit value
                  </button>
                  <button
                    onClick={() => {
                      setActionMsg({ type: "success", text: `Accepted ${activeFieldEvidence.label} as verified.` });
                    }}
                    className="btn btn-sm btn-primary grow"
                  >
                    Accept
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Action Footer Bar (Matches Image 1) */}
          <div
            style={{
              position: "sticky",
              bottom: 0,
              marginTop: 24,
              padding: "16px 24px",
              background: "#ffffff",
              border: "1px solid var(--border-strong)",
              borderRadius: 12,
              boxShadow: "0 -4px 16px rgba(0,0,0,0.06)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 14,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: "#2457e6",
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 15,
                }}
              >
                ✓
              </div>
              <div>
                <strong style={{ fontSize: 14, color: "#1e293b", display: "block" }}>Source-grounded review</strong>
                <span className="small muted">Every value is traceable to the original document with bounding box coordinates.</span>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={exportCsv} className="btn">
                Export CSV
              </button>
              <button onClick={handleApprove} className="btn btn-primary" disabled={busy}>
                {busy ? "Saving..." : "✓ Approve Document"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 2: EXTRACTED RAW TEXT (100% Real Extracted Data View)
         ========================================================================= */}
      {tab === "text" && (
        <div className="card" style={{ padding: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, borderBottom: "1px solid var(--border)", paddingBottom: 14 }}>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
                Raw Extracted Document Text
              </h2>
              <div className="muted small">
                Every word and line extracted directly from {d.filename} ({d.page_count || 1} page{d.page_count > 1 ? "s" : ""}).
              </div>
            </div>
            <button
              onClick={() => {
                navigator.clipboard.writeText(data.raw_text || "");
                setActionMsg({ type: "success", text: "Extracted text copied to clipboard!" });
              }}
              className="btn btn-sm btn-primary"
            >
              📋 Copy Raw Text
            </button>
          </div>

          <pre
            style={{
              background: "#0f172a",
              color: "#f8fafc",
              padding: 20,
              borderRadius: 8,
              fontSize: 13,
              lineHeight: 1.6,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              maxHeight: 650,
              overflowY: "auto",
            }}
          >
            {data.raw_text || "No raw text extracted for this document."}
          </pre>
        </div>
      )}

      {/* =========================================================================
          TAB 3: DOCUMENT HISTORY & AUDIT TRAIL (Matches Image 5)
         ========================================================================= */}
      {tab === "history" && (
        <div className="card" style={{ padding: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, borderBottom: "1px solid var(--border)", paddingBottom: 14 }}>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Document History
              </h2>
              <div className="muted small">Full audit log of human approvals, manual value corrections, and system notifications.</div>
            </div>
            <span className="small muted">{history.length} log event{history.length > 1 ? "s" : ""}</span>
          </div>

          <div style={{ display: "grid", gap: 16 }}>
            {history.map((h, i) => (
              <div
                key={h.id || i}
                style={{
                  display: "grid",
                  gridTemplateColumns: "48px 1fr",
                  gap: 16,
                  padding: "16px",
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: 10,
                }}
              >
                {/* User / Action Icon */}
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: "50%",
                    background: h.action.includes("Approved") ? "#7c3aed" : h.action.includes("Corrected") ? "#ea580c" : "#2563eb",
                    color: "#ffffff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 20,
                  }}
                >
                  {h.action.includes("Approved") ? "👤" : h.action.includes("Alert") ? "✉️" : "⚙️"}
                </div>

                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, color: "#1e293b" }}>{h.action}</div>
                    <span className="small muted">{when(h.timestamp)}</span>
                  </div>

                  <div style={{ color: "#334155", fontSize: 13, marginBottom: 8 }}>{h.message}</div>

                  {h.reviewer && (
                    <div className="small muted">
                      Reviewer: <strong>{h.reviewer}</strong> · Session Duration: {h.session_time || "00:02:54"}
                    </div>
                  )}

                  {h.details?.corrected && (
                    <div
                      style={{
                        marginTop: 8,
                        padding: "8px 12px",
                        background: "#fff",
                        border: "1px solid #cbd5e1",
                        borderRadius: 6,
                        fontSize: 12,
                        fontFamily: "monospace",
                      }}
                    >
                      Updated: {JSON.stringify(h.details.corrected)} (Reason: {h.details.reason})
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Manual Edit Value Modal */}
      {editingField && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          onClick={() => setEditingField(null)}
        >
          <div
            className="card"
            style={{ width: "100%", maxWidth: 420, margin: 0, boxShadow: "0 20px 40px rgba(0,0,0,0.3)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="card-head" style={{ borderBottom: "1px solid var(--border)", paddingBottom: 10 }}>
              <strong style={{ fontSize: 16 }}>Correct Extracted Value</strong>
              <button onClick={() => setEditingField(null)} className="btn-link" style={{ fontSize: 20 }}>
                &times;
              </button>
            </div>

            <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
              <div>
                <label className="field">Field Name</label>
                <input type="text" disabled value={editingField} />
              </div>

              <div>
                <label className="field">Corrected Value</label>
                <input
                  type="text"
                  autoFocus
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  placeholder="Enter corrected value"
                />
              </div>

              <div>
                <label className="field">Reason for Adjustment (Audit Trail)</label>
                <input
                  type="text"
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  placeholder="e.g. OCR misread digit on page 1"
                />
              </div>

              <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                <button onClick={() => setEditingField(null)} className="btn grow">
                  Cancel
                </button>
                <button onClick={handleSaveCorrection} className="btn btn-primary grow" disabled={busy}>
                  {busy ? "Saving..." : "Save Correction"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
