"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { money, bytes } from "@/lib/format";
import type { DocumentOut, ResultOut } from "@/lib/types";
import { StatusBadge } from "./StatusBadge";

interface DocModalProps {
  doc: DocumentOut | null;
  onClose: () => void;
  onDeleted: () => void;
}

export function DocModal({ doc, onClose, onDeleted }: DocModalProps) {
  const [activeTab, setActiveTab] = useState<"fields" | "preview" | "text">("fields");
  const [results, setResults] = useState<ResultOut[]>([]);
  const [loading, setLoading] = useState(false);
  const [approving, setApproving] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  useEffect(() => {
    if (doc?.id) {
      setLoading(true);
      api.getResults(doc.id)
        .then((res) => setResults(res || []))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }
  }, [doc?.id]);

  if (!doc) return null;

  const currentResult: any = results[0] || {};
  const data = currentResult.data || {};
  const lineItems: any[] = data.line_items || [];
  const rawText: string = data.raw_text || currentResult.raw_text || "";

  const handleApprove = async () => {
    setApproving(true);
    try {
      await api.approve(doc.id, "reviewer@docuintel.com");
      setActionNotice("Document approved successfully.");
      doc.status = "completed";
    } catch (err: any) {
      setActionNotice(`Approval error: ${err.message}`);
    } finally {
      setApproving(false);
    }
  };

  const handleDelete = async () => {
    if (confirm(`Are you sure you want to delete ${doc.filename}?`)) {
      try {
        await api.deleteDocument(doc.id);
        onDeleted();
        onClose();
      } catch (err: any) {
        alert(`Delete failed: ${err.message}`);
      }
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(15, 23, 42, 0.65)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "20px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#ffffff",
          borderRadius: 12,
          width: "100%",
          maxWidth: 960,
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: "16px 24px",
            borderBottom: "1px solid #e2e8f0",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "#f8fafc",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
            <span style={{ fontSize: 24 }}>📄</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <h2
                  style={{
                    fontSize: 17,
                    fontWeight: 700,
                    margin: 0,
                    color: "#0f172a",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {doc.filename}
                </h2>
                <StatusBadge status={doc.status} />
              </div>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                {bytes(doc.size_bytes)} · Uploaded {doc.created_at ? new Date(doc.created_at).toLocaleString() : "Recently"}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <a
              href={api.fileUrl(doc.id)}
              download={doc.filename}
              target="_blank"
              rel="noreferrer"
              className="btn btn-sm"
              style={{ background: "#f1f5f9", color: "#334155", border: "1px solid #cbd5e1" }}
            >
              ⤓ Download
            </a>
            <button
              onClick={handleDelete}
              className="btn btn-sm"
              style={{ background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca" }}
            >
              🗑 Delete
            </button>
            <button
              onClick={onClose}
              style={{
                background: "none",
                border: "none",
                fontSize: 20,
                cursor: "pointer",
                color: "#64748b",
                marginLeft: 4,
                padding: "4px 8px",
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Action Notice */}
        {actionNotice && (
          <div style={{ padding: "8px 24px", background: "#f0fdf4", color: "#16a34a", fontSize: 13, borderBottom: "1px solid #bbf7d0" }}>
            {actionNotice}
          </div>
        )}

        {/* Modal Navigation Tabs */}
        <div style={{ display: "flex", borderBottom: "1px solid #e2e8f0", padding: "0 24px", background: "#ffffff" }}>
          <button
            onClick={() => setActiveTab("fields")}
            style={{
              padding: "12px 16px",
              fontSize: 13.5,
              fontWeight: 600,
              background: "none",
              border: "none",
              borderBottom: activeTab === "fields" ? "2px solid #0b63b8" : "2px solid transparent",
              color: activeTab === "fields" ? "#0b63b8" : "#64748b",
              cursor: "pointer",
            }}
          >
            📊 Extracted AI Fields
          </button>
          <button
            onClick={() => setActiveTab("preview")}
            style={{
              padding: "12px 16px",
              fontSize: 13.5,
              fontWeight: 600,
              background: "none",
              border: "none",
              borderBottom: activeTab === "preview" ? "2px solid #0b63b8" : "2px solid transparent",
              color: activeTab === "preview" ? "#0b63b8" : "#64748b",
              cursor: "pointer",
            }}
          >
            🔍 Original Preview
          </button>
          <button
            onClick={() => setActiveTab("text")}
            style={{
              padding: "12px 16px",
              fontSize: 13.5,
              fontWeight: 600,
              background: "none",
              border: "none",
              borderBottom: activeTab === "text" ? "2px solid #0b63b8" : "2px solid transparent",
              color: activeTab === "text" ? "#0b63b8" : "#64748b",
              cursor: "pointer",
            }}
          >
            📝 Raw OCR Text
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: "20px 24px", overflowY: "auto", flex: 1 }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: "40px", color: "#64748b" }}>
              Loading document data...
            </div>
          ) : activeTab === "fields" ? (
            <div style={{ display: "grid", gap: 16 }}>
              {/* Top Summary Banner */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: 12,
                  background: "#f8fafc",
                  padding: 16,
                  borderRadius: 8,
                  border: "1px solid #e2e8f0",
                }}
              >
                <div>
                  <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", fontWeight: 600 }}>Invoice #</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", marginTop: 2 }}>
                    {data.invoice_number || doc.summary?.invoice_number || "—"}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", fontWeight: 600 }}>Vendor / Supplier</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", marginTop: 2 }}>
                    {data.supplier_name || doc.summary?.supplier_name || "—"}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", fontWeight: 600 }}>Invoice Date</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "#0f172a", marginTop: 2 }}>
                    {data.invoice_date || doc.summary?.invoice_date || "—"}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", fontWeight: 600 }}>Total Amount</div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: "#0b63b8", marginTop: 2 }}>
                    {money(data.total ?? doc.summary?.total, data.currency || doc.summary?.currency)}
                  </div>
                </div>
              </div>

              {/* Line Items Table */}
              <div>
                <h3 style={{ fontSize: 14, fontWeight: 700, margin: "12px 0 8px", color: "#1e293b" }}>
                  Line Items ({lineItems.length})
                </h3>
                {lineItems.length === 0 ? (
                  <div style={{ padding: "16px", background: "#f8fafc", borderRadius: 6, fontSize: 13, color: "#64748b" }}>
                    No individual line items parsed. Check raw text or full totals.
                  </div>
                ) : (
                  <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: "#f1f5f9", textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>
                          <th style={{ padding: "8px 12px" }}>Description</th>
                          <th style={{ padding: "8px 12px", width: 70 }}>Qty</th>
                          <th style={{ padding: "8px 12px", width: 100 }}>Unit Price</th>
                          <th style={{ padding: "8px 12px", width: 100, textAlign: "right" }}>Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lineItems.map((item, idx) => (
                          <tr key={idx} style={{ borderBottom: "1px solid #f1f5f9" }}>
                            <td style={{ padding: "8px 12px", fontWeight: 500 }}>{item.description || "Item"}</td>
                            <td style={{ padding: "8px 12px", color: "#64748b" }}>{item.quantity ?? "—"}</td>
                            <td style={{ padding: "8px 12px", color: "#64748b" }}>
                              {item.unit_price != null ? `$${Number(item.unit_price).toFixed(2)}` : "—"}
                            </td>
                            <td style={{ padding: "8px 12px", fontWeight: 600, textAlign: "right" }}>
                              {item.amount != null ? `$${Number(item.amount).toFixed(2)}` : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Subtotal & Tax Breakdown */}
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <div style={{ width: 280, display: "grid", gap: 6, fontSize: 13, background: "#f8fafc", padding: 14, borderRadius: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#64748b" }}>Subtotal:</span>
                    <strong>{data.subtotal != null ? `$${Number(data.subtotal).toFixed(2)}` : "—"}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#64748b" }}>Tax:</span>
                    <strong>{data.tax != null ? `$${Number(data.tax).toFixed(2)}` : "—"}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #cbd5e1", paddingTop: 6, fontSize: 15 }}>
                    <span style={{ fontWeight: 700, color: "#0f172a" }}>Total:</span>
                    <strong style={{ color: "#0b63b8" }}>
                      {money(data.total ?? doc.summary?.total, data.currency || doc.summary?.currency)}
                    </strong>
                  </div>
                </div>
              </div>
            </div>
          ) : activeTab === "preview" ? (
            <div style={{ height: 600, borderRadius: 8, overflow: "hidden", border: "1px solid #e2e8f0" }}>
              <iframe
                src={api.fileUrl(doc.id)}
                title={doc.filename}
                style={{ width: "100%", height: "100%", border: "none" }}
              />
            </div>
          ) : (
            <div>
              <pre
                style={{
                  background: "#0f172a",
                  color: "#e2e8f0",
                  padding: 16,
                  borderRadius: 8,
                  fontSize: 12.5,
                  lineHeight: 1.5,
                  whiteSpace: "pre-wrap",
                  fontFamily: "monospace",
                  maxHeight: 500,
                  overflowY: "auto",
                }}
              >
                {rawText || "No raw text recorded or document is still processing."}
              </pre>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: "14px 24px",
            borderTop: "1px solid #e2e8f0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "#fafbfc",
          }}
        >
          <div style={{ fontSize: 12, color: "#64748b" }}>
            Document ID: <code style={{ fontSize: 11 }}>{doc.id}</code>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            {doc.status === "needs_review" && (
              <button
                onClick={handleApprove}
                disabled={approving}
                className="btn btn-primary"
                style={{ background: "#16a34a", borderColor: "#16a34a" }}
              >
                {approving ? "Approving..." : "✓ Approve Document"}
              </button>
            )}
            <button onClick={onClose} className="btn">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
