"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { confidenceLevel, diffFields, issuesByField, money, parseField } from "@/lib/format";
import type { InvoiceData, Issue, LineItem, ResultOut } from "@/lib/types";

type ScalarKey = "invoice_number" | "invoice_date" | "supplier_name" | "customer_name" | "subtotal" | "tax" | "total" | "currency";
const FIELDS: { key: ScalarKey; label: string; numeric?: boolean; type?: string; placeholder?: string }[] = [
  { key: "invoice_number", label: "Invoice number" },
  { key: "invoice_date", label: "Invoice date", type: "date" },
  { key: "supplier_name", label: "Supplier" },
  { key: "customer_name", label: "Customer" },
  { key: "subtotal", label: "Subtotal", numeric: true },
  { key: "tax", label: "Tax", numeric: true },
  { key: "total", label: "Total", numeric: true },
  { key: "currency", label: "Currency", placeholder: "e.g. USD" },
];
const LABEL: Record<string, string> = { high: "High", medium: "Medium", low: "Low", none: "Not found" };

type ItemForm = { description: string; quantity: string; unit_price: string; amount: string };
const toStr = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const itemToForm = (li: LineItem): ItemForm => ({
  description: toStr(li.description), quantity: toStr(li.quantity), unit_price: toStr(li.unit_price), amount: toStr(li.amount),
});

function numOrNull(s: string): number | null | undefined {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t.replace(/,/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

function formFromData(d: InvoiceData) {
  const scalars = Object.fromEntries(FIELDS.map((f) => [f.key, toStr(d[f.key])])) as Record<ScalarKey, string>;
  return { scalars, items: d.line_items.map(itemToForm) };
}

export function ResultCard({ result, total, onSaved }: { result: ResultOut; total: number; onSaved: (r: ResultOut) => void }) {
  const base = result.effective_data;
  const [form, setForm] = useState(() => formFromData(base));
  const [confirm, setConfirm] = useState(false);
  const [reviewer, setReviewer] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // reset the form whenever the server copy changes (initial load, after save, after reprocess)
  useEffect(() => { setForm(formFromData(result.effective_data)); setSaved(false); }, [result]);
  useEffect(() => { try { setReviewer(localStorage.getItem("reviewer") ?? ""); } catch { /* storage unavailable */ } }, []);

  // build the typed draft + collect input errors
  const { draft, inputErrors } = useMemo(() => {
    const errs: Record<string, string> = {};
    const d: Record<string, unknown> = {};
    for (const f of FIELDS) {
      const v = parseField(f.key, form.scalars[f.key]);
      if (v === undefined) { errs[f.key] = "Enter a valid number"; d[f.key] = base[f.key]; } else d[f.key] = v;
    }
    const items: LineItem[] = form.items.map((it, i) => {
      const q = numOrNull(it.quantity), u = numOrNull(it.unit_price), a = numOrNull(it.amount);
      if (q === undefined || u === undefined || a === undefined) errs[`item${i}`] = "Numbers only";
      return { description: it.description.trim() || null, quantity: q ?? null, unit_price: u ?? null, amount: a ?? null };
    });
    d.line_items = items;
    return { draft: d as unknown as InvoiceData, inputErrors: errs };
  }, [form, base]);

  const changes = useMemo(() => diffFields(base, draft), [base, draft]);
  const dirty = Object.keys(changes).length > 0;
  const byField = issuesByField(result.issues);
  const openErrors = result.issues.filter((i) => i.severity === "error" && !i.resolved);
  const itemsSum = form.items.reduce((s, it) => s + (numOrNull(it.amount) ?? 0), 0);
  const hasInputErrors = Object.keys(inputErrors).length > 0;

  async function save() {
    setSaving(true); setError(null);
    try {
      try { localStorage.setItem("reviewer", reviewer); } catch { /* ignore */ }
      const updated = await api.correct(result.id, changes, confirm, reviewer || undefined);
      setSaved(true); setConfirm(false);
      onSaved(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally { setSaving(false); }
  }

  const setScalar = (k: ScalarKey, v: string) => setForm((f) => ({ ...f, scalars: { ...f.scalars, [k]: v } }));
  const setItem = (i: number, k: keyof ItemForm, v: string) =>
    setForm((f) => ({ ...f, items: f.items.map((it, j) => (j === i ? { ...it, [k]: v } : it)) }));

  return (
    <div className="card">
      <div className="card-head" style={{ padding: 0, border: 0, marginBottom: 14 }}>
        <div>
          <h2 style={{ margin: 0 }}>
            Invoice {result.invoice_index + 1}{total > 1 ? ` of ${total}` : ""}
            {result.reviewed && <span className="badge b-completed" style={{ marginLeft: 10 }}>Reviewed</span>}
            {result.needs_review && <span className="badge b-needs_review" style={{ marginLeft: 6 }}>Needs review</span>}
          </h2>
          <div className="muted small">
            {result.source_pages.length ? `Page${result.source_pages.length > 1 ? "s" : ""} ${result.source_pages[0]}${result.source_pages.length > 1 ? `–${result.source_pages[result.source_pages.length - 1]}` : ""} · ` : ""}
            extracted by {result.extractor} · overall confidence {Math.round(result.overall_confidence * 100)}%
          </div>
        </div>
      </div>

      {openErrors.length > 0 && (
        <div className="alert alert-error">
          <strong>{openErrors.length} validation error{openErrors.length > 1 ? "s" : ""}</strong> — review the highlighted fields and correct or confirm them.
        </div>
      )}

      <div className="form-grid">
        {FIELDS.map((f) => {
          const conf = result.confidence[f.key];
          const level = confidenceLevel(conf, base[f.key] !== null && base[f.key] !== "");
          const iss = byField[f.key] ?? [];
          const sev = iss.some((i) => i.severity === "error" && !i.resolved) ? "error" : iss.length ? "warning" : "";
          return (
            <div key={f.key} className={`field-wrap ${sev ? `has-${sev}` : ""}`}>
              <label className="field" htmlFor={`${result.id}-${f.key}`}>
                {f.label}
                <span className={`conf badge b-${level}`} title={conf !== undefined ? `confidence ${(conf * 100).toFixed(0)}%` : ""}>{LABEL[level]}</span>
              </label>
              <input id={`${result.id}-${f.key}`} className={f.numeric ? "num" : ""} type={f.type ?? "text"} inputMode={f.numeric ? "decimal" : undefined}
                placeholder={f.placeholder ?? (base[f.key] === null ? "Not found in document" : "")}
                value={form.scalars[f.key]} onChange={(e) => setScalar(f.key, e.target.value)} />
              {inputErrors[f.key] && <div className="field-msg error">{inputErrors[f.key]}</div>}
              {iss.map((i) => <div key={i.id} className={`field-msg ${i.severity}`}>{i.message}</div>)}
            </div>
          );
        })}
      </div>

      <h3 style={{ marginTop: 22 }}>Line items</h3>
      <div className="table-wrap" style={{ border: "1px solid var(--border)", borderRadius: 8 }}>
        <table>
          <thead><tr><th>Description</th><th className="num" style={{ width: 90 }}>Qty</th><th className="num" style={{ width: 120 }}>Unit price</th><th className="num" style={{ width: 130 }}>Amount</th><th style={{ width: 50 }} /></tr></thead>
          <tbody>
            {form.items.map((it, i) => (
              <tr key={i}>
                <td><input aria-label={`Line ${i + 1} description`} value={it.description} onChange={(e) => setItem(i, "description", e.target.value)} /></td>
                <td><input className="num" aria-label={`Line ${i + 1} quantity`} value={it.quantity} onChange={(e) => setItem(i, "quantity", e.target.value)} /></td>
                <td><input className="num" aria-label={`Line ${i + 1} unit price`} value={it.unit_price} onChange={(e) => setItem(i, "unit_price", e.target.value)} /></td>
                <td><input className="num" aria-label={`Line ${i + 1} amount`} value={it.amount} onChange={(e) => setItem(i, "amount", e.target.value)} />
                  {inputErrors[`item${i}`] && <div className="field-msg error">{inputErrors[`item${i}`]}</div>}</td>
                <td><button className="btn-link" aria-label={`Remove line ${i + 1}`} onClick={() => setForm((f) => ({ ...f, items: f.items.filter((_, j) => j !== i) }))}>✕</button></td>
              </tr>
            ))}
            {form.items.length === 0 && <tr><td colSpan={5} className="muted">No line items extracted.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="row" style={{ justifyContent: "space-between", marginTop: 8 }}>
        <button className="btn btn-sm" onClick={() => setForm((f) => ({ ...f, items: [...f.items, { description: "", quantity: "", unit_price: "", amount: "" }] }))}>+ Add line</button>
        <span className="muted small">Line items sum: <strong>{money(Math.round(itemsSum * 100) / 100, form.scalars.currency || null)}</strong></span>
      </div>

      {result.issues.length > 0 && (
        <>
          <h3 style={{ marginTop: 22 }}>Validation findings</h3>
          <ul className="issue-list">
            {result.issues.map((i: Issue) => (
              <li key={i.id} className={i.resolved ? "resolved" : ""}>
                <span className={`badge b-${i.severity}`}>{i.severity}</span>
                <span>{i.message}{i.field && <span className="muted small"> · {i.field}</span>}{i.resolved && <span className="small"> (accepted by reviewer)</span>}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="row" style={{ marginTop: 22, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
        <input style={{ width: 180 }} placeholder="Your name (optional)" aria-label="Reviewer name" value={reviewer} onChange={(e) => setReviewer(e.target.value)} />
        {openErrors.length > 0 && (
          <label className="checkbox small" title="Mark remaining validation errors as accepted">
            <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} /> Accept as correct despite errors
          </label>
        )}
        <span className="grow" />
        {saved && !dirty && <span className="badge b-completed">Saved</span>}
        {error && <span style={{ color: "var(--red)" }}>{error}</span>}
        <button className="btn" disabled={!dirty || saving} onClick={() => setForm(formFromData(base))}>Reset</button>
        <button className="btn btn-primary" disabled={(!dirty && !(confirm && openErrors.length)) || saving || hasInputErrors} onClick={save}>
          {saving ? "Saving…" : confirm && !dirty ? "Confirm record" : "Save corrections"}
        </button>
      </div>
    </div>
  );
}
