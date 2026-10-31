"use client";

import Link from "next/link";
import { AlertTriangle, ArrowUpRight, FileX2, MessageSquareText, Trash2 } from "lucide-react";
import { ProgressBar, StatusBadge } from "@/components/StatusBadge";
import { bytes, fileKind, money, shortDate } from "@/lib/format";
import { IN_FLIGHT, type DocumentOut } from "@/lib/types";

interface DocTableProps {
  docs: DocumentOut[];
  selectedIds?: string[];
  onToggleSelect?: (id: string) => void;
  onSelectAll?: () => void;
  onViewDoc?: (d: DocumentOut) => void;
  onChatDoc?: (d: DocumentOut) => void;
  onDeleteDoc?: (d: DocumentOut) => void;
  emptyHint?: string;
  loading?: boolean;
}

const KIND_CLASS = { pdf: "pdf", image: "img", sheet: "xls", other: "" } as const;

export function DocTable({ docs, selectedIds = [], onToggleSelect, onSelectAll, onViewDoc, onChatDoc, onDeleteDoc, emptyHint, loading }: DocTableProps) {
  if (loading && !docs.length) {
    return (
      <div aria-busy="true" aria-label="Loading documents" style={{ padding: 16, display: "grid", gap: 12 }}>
        {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 44 }} />)}
      </div>
    );
  }
  if (!docs.length) {
    return (
      <div className="empty">
        <FileX2 size={36} />
        <strong>No documents here</strong>
        {emptyHint || "Upload an invoice above, or change the filters."}
      </div>
    );
  }

  const allSelected = docs.every((d) => selectedIds.includes(d.id));
  const someSelected = docs.some((d) => selectedIds.includes(d.id)) && !allSelected;

  return (
    <div className="table-wrap">
      <table className="t">
        <thead>
          <tr>
            {onToggleSelect && (
              <th className="cb">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => { if (el) el.indeterminate = someSelected; }}
                  onChange={() => onSelectAll?.()}
                  aria-label="Select all on this page"
                />
              </th>
            )}
            <th>Document</th>
            <th>Supplier</th>
            <th>Invoice no.</th>
            <th>Invoice date</th>
            <th className="num">Total</th>
            <th>Status</th>
            <th><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {docs.map((d) => {
            const { kind, label } = fileKind(d.file_type, d.filename);
            const inFlight = IN_FLIGHT.includes(d.status);
            const selected = selectedIds.includes(d.id);
            return (
              <tr key={d.id} className={selected ? "sel" : undefined}>
                {onToggleSelect && (
                  <td className="cb">
                    <input type="checkbox" checked={selected} onChange={() => onToggleSelect(d.id)} aria-label={`Select ${d.filename}`} />
                  </td>
                )}
                <td style={{ maxWidth: 320 }}>
                  <div className="row" style={{ flexWrap: "nowrap", alignItems: "flex-start" }}>
                    <span className={`tag ${KIND_CLASS[kind]}`} style={{ marginTop: 2 }}>{label}</span>
                    <div style={{ minWidth: 0 }}>
                      <Link href={`/documents/${d.id}`} className="doc-name truncate" style={{ display: "block" }} title={d.filename}>{d.filename}</Link>
                      <div className="cell-sub">
                        {bytes(d.size_bytes)} · {d.page_count || 1} page{(d.page_count || 1) === 1 ? "" : "s"}
                        {d.invoice_count > 1 && ` · ${d.invoice_count} invoices`} · uploaded {shortDate(d.created_at)}
                      </div>
                      {d.status === "needs_review" && (
                        <div className="cell-flag"><AlertTriangle size={13} /> Check the flagged values</div>
                      )}
                      {(d.status === "failed" || d.status === "rejected") && d.error && (
                        <div className="cell-sub truncate" style={{ color: "var(--reject-ink)" }} title={d.error}>{d.error}</div>
                      )}
                    </div>
                  </div>
                </td>
                <td>{d.summary?.supplier_name || <span className="muted">—</span>}</td>
                <td className="mono">{d.summary?.invoice_number || <span className="muted">—</span>}</td>
                <td className="mono nowrap">{d.summary?.invoice_date || <span className="muted">—</span>}</td>
                <td className="num">{d.summary?.total != null ? money(d.summary.total, d.summary.currency) : <span className="muted">—</span>}</td>
                <td style={{ minWidth: 150 }}>
                  <StatusBadge status={d.status} />
                  {inFlight && <div style={{ marginTop: 6 }}><ProgressBar doc={d} /></div>}
                </td>
                <td>
                  <div className="cell-actions">
                    {onViewDoc && <button type="button" className="btn-icon" title="Open" aria-label={`Open ${d.filename}`} onClick={() => onViewDoc(d)}><ArrowUpRight size={16} /></button>}
                    {onChatDoc && <button type="button" className="btn-icon" title="Search for this document" aria-label={`Search for ${d.filename}`} onClick={() => onChatDoc(d)}><MessageSquareText size={16} /></button>}
                    {onDeleteDoc && <button type="button" className="btn-icon danger" title="Delete" aria-label={`Delete ${d.filename}`} onClick={() => onDeleteDoc(d)}><Trash2 size={16} /></button>}
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
