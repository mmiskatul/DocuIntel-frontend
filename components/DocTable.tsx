"use client";

import { money } from "@/lib/format";
import type { DocumentOut } from "@/lib/types";

interface DocTableProps {
  docs: DocumentOut[];
  selectedIds?: string[];
  onToggleSelect?: (id: string) => void;
  onSelectAll?: () => void;
  onViewDoc?: (d: DocumentOut) => void;
  extra?: (d: DocumentOut) => React.ReactNode;
}

export function DocTable({
  docs,
  selectedIds = [],
  onToggleSelect,
  onSelectAll,
  onViewDoc,
  extra,
}: DocTableProps) {
  if (!docs.length) {
    return (
      <div className="empty" style={{ padding: "48px 20px", textAlign: "center" }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
        <div style={{ fontWeight: 600, color: "#1e293b", fontSize: 16 }}>No documents found</div>
        <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
          Upload invoices or documents above to start processing with AI OCR &amp; RAG.
        </div>
      </div>
    );
  }

  const allSelected = docs.length > 0 && docs.every((d) => selectedIds.includes(d.id));
  const someSelected = docs.some((d) => selectedIds.includes(d.id)) && !allSelected;

  const getDocType = (d: DocumentOut) => {
    const fn = (d.filename || "").toLowerCase();
    if (fn.startsWith("po") || fn.includes("purchase")) return "Purchase Order";
    if (fn.includes("statement")) return "Bank Statement";
    if (fn.includes("receipt")) return "Receipt";
    return "Invoice";
  };

  const getFormattedDate = (d: DocumentOut) => {
    if (d.summary?.invoice_date) {
      return d.summary.invoice_date;
    }
    if (d.created_at) {
      const dt = new Date(d.created_at);
      return `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}/${dt.getFullYear()}`;
    }
    return "—";
  };

  const getConfidenceLevel = (d: DocumentOut): { label: "High" | "Medium" | "Low"; bg: string; color: string } => {
    if (d.status === "failed") return { label: "Low", bg: "#fce8e6", color: "#c4261d" };
    if (d.status === "needs_review") return { label: "Medium", bg: "#fef9c3", color: "#854d0e" };
    if (d.status === "processing") return { label: "Medium", bg: "#eff6ff", color: "#1d4ed8" };
    return { label: "High", bg: "#dcfce7", color: "#15803d" };
  };

  const getStatusBadge = (d: DocumentOut) => {
    switch (d.status) {
      case "processing":
      case "queued":
        return (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: "#eff6ff",
              color: "#1d4ed8",
              border: "1px solid #bfdbfe",
              padding: "3px 10px",
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            <span
              style={{
                display: "inline-block",
                width: 8,
                height: 8,
                border: "2px solid #3b82f6",
                borderTopColor: "transparent",
                borderRadius: "50%",
                animation: "spin 1s linear infinite",
              }}
            />
            {d.stage || "Processing"}
          </span>
        );
      case "completed":
        return (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              background: "#f0fdf4",
              color: "#16a34a",
              border: "1px solid #bbf7d0",
              padding: "3px 10px",
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            ✓ Completed
          </span>
        );
      case "needs_review":
        return (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              background: "#fef9c3",
              color: "#a16207",
              border: "1px solid #fde047",
              padding: "3px 10px",
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            ⚠ Needs Review
          </span>
        );
      case "failed":
      default:
        return (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              background: "#dc2626",
              color: "#ffffff",
              padding: "3px 12px",
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            ✕ Failed
          </span>
        );
    }
  };

  return (
    <div className="table-wrap">
      <style jsx global>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "#fafbfc", borderBottom: "1px solid #e2e8f0" }}>
            {onToggleSelect && (
              <th style={{ width: 40, padding: "12px 14px", textAlign: "center" }}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(input) => {
                    if (input) input.indeterminate = someSelected;
                  }}
                  onChange={() => onSelectAll && onSelectAll()}
                  aria-label="Select all documents"
                  style={{ width: 16, height: 16, cursor: "pointer", accentColor: "#0b63b8" }}
                />
              </th>
            )}
            <th style={{ padding: "12px 14px", color: "#64748b", fontWeight: 600, fontSize: 12 }}>Document</th>
            <th style={{ padding: "12px 14px", color: "#64748b", fontWeight: 600, fontSize: 12 }}>Type</th>
            <th style={{ padding: "12px 14px", color: "#64748b", fontWeight: 600, fontSize: 12 }}>Vendor</th>
            <th style={{ padding: "12px 14px", color: "#64748b", fontWeight: 600, fontSize: 12 }}>Date</th>
            <th style={{ padding: "12px 14px", color: "#64748b", fontWeight: 600, fontSize: 12 }}>Amount</th>
            <th style={{ padding: "12px 14px", color: "#64748b", fontWeight: 600, fontSize: 12 }}>Status</th>
            <th style={{ padding: "12px 14px", color: "#64748b", fontWeight: 600, fontSize: 12 }}>Confidence</th>
            <th style={{ width: 130, textAlign: "right", padding: "12px 14px", color: "#64748b", fontWeight: 600, fontSize: 12 }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {docs.map((d) => {
            const isSelected = selectedIds.includes(d.id);
            const conf = getConfidenceLevel(d);
            return (
              <tr
                key={d.id}
                style={{
                  background: isSelected ? "#eef6ff" : "transparent",
                  borderBottom: "1px solid #f1f5f9",
                  transition: "background 0.15s ease",
                }}
              >
                {onToggleSelect && (
                  <td style={{ textAlign: "center", padding: "12px 14px" }}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggleSelect(d.id)}
                      aria-label={`Select ${d.filename}`}
                      style={{ width: 16, height: 16, cursor: "pointer", accentColor: "#0b63b8" }}
                    />
                  </td>
                )}
                <td style={{ padding: "12px 14px" }}>
                  <button
                    type="button"
                    onClick={() => onViewDoc?.(d)}
                    style={{
                      background: "none",
                      border: "none",
                      padding: 0,
                      textAlign: "left",
                      color: "#0b63b8",
                      fontWeight: 600,
                      fontSize: 13.5,
                      cursor: "pointer",
                      display: "block",
                      lineHeight: 1.3,
                    }}
                  >
                    {d.filename}
                  </button>
                  {d.error && d.status === "failed" && (
                    <div style={{ color: "#b91c1c", fontSize: 11, marginTop: 3, maxWidth: 300 }}>
                      {d.error.slice(0, 90)}...
                    </div>
                  )}
                </td>
                <td style={{ padding: "12px 14px", color: "#475569", fontSize: 13 }}>
                  {getDocType(d)}
                </td>
                <td style={{ padding: "12px 14px", color: "#1e293b", fontWeight: 500, fontSize: 13 }}>
                  {d.summary?.supplier_name || "—"}
                </td>
                <td style={{ padding: "12px 14px", color: "#64748b", fontSize: 13 }}>
                  {getFormattedDate(d)}
                </td>
                <td style={{ padding: "12px 14px", color: "#0f172a", fontWeight: 600, fontSize: 13 }}>
                  {money(d.summary?.total, d.summary?.currency || "USD")}
                </td>
                <td style={{ padding: "12px 14px" }}>
                  {getStatusBadge(d)}
                </td>
                <td style={{ padding: "12px 14px" }}>
                  <span
                    style={{
                      background: conf.bg,
                      color: conf.color,
                      padding: "2px 10px",
                      borderRadius: 12,
                      fontSize: 11.5,
                      fontWeight: 600,
                      display: "inline-block",
                    }}
                  >
                    {conf.label}
                  </span>
                </td>
                <td style={{ padding: "12px 14px", textAlign: "right" }}>
                  <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", alignItems: "center" }}>
                    <button
                      type="button"
                      onClick={() => onViewDoc?.(d)}
                      className="btn btn-sm"
                      style={{ padding: "3px 8px", fontSize: 11.5 }}
                      title="Inspect extracted fields and preview"
                    >
                      View
                    </button>
                    {extra && extra(d)}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
