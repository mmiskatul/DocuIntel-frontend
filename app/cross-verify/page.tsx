"use client";

import Link from "next/link";
import { useMemo } from "react";
import { AlertTriangle, ArrowLeftRight, ArrowUpRight, Check, CheckCircle2, FileQuestion, GitCompareArrows, Info, Lightbulb, Loader2, Send } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { fileKind, money } from "@/lib/format";
import type { CrossVerifyDifference, CrossVerifyReport, DocumentOut } from "@/lib/types";
import { useAppDispatch, useAppSelector } from "@/store";
import { runCrossVerify, setLeft, setRight, swapSides } from "@/store/verifySlice";

const FIELD_LABEL: Record<string, string> = {
  supplier_name: "Supplier", customer_name: "Customer", invoice_date: "Invoice date", currency: "Currency",
  subtotal: "Subtotal", tax: "Tax", total: "Total",
};
const label = (f: string) => FIELD_LABEL[f] ?? f.replace(/_/g, " ");
const show = (v: unknown) => (v === null || v === undefined || v === "" ? "not found" : typeof v === "number" ? money(v) : String(v));
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const KIND_CLASS = { pdf: "pdf", image: "img", sheet: "xls", other: "" } as const;

/** One sentence saying what is different, using the real file names. */
function describe(d: CrossVerifyDifference, first: string, second: string): string {
  const name = label(d.field).toLowerCase();
  if (typeof d.left === "number" && typeof d.right === "number") {
    return `The ${name} is ${money(d.left)} in ${first} but ${money(d.right)} in ${second}.`;
  }
  return `The ${name} is “${show(d.left)}” in ${first} but “${show(d.right)}” in ${second}.`;
}

/** The headline and the next step, in plain words. Invoices that appear in only one document are information, not an error. */
function headline(r: CrossVerifyReport) {
  const s = r.summary;
  const first = r.left_document.filename;
  const second = r.right_document.filename;
  const unmatched = s.only_in_left + s.only_in_right;
  const note = unmatched > 0
    ? `${plural(unmatched, "invoice")} ${unmatched === 1 ? "is" : "are"} in only one of the two documents. That is normal when one is a long list and the other a single invoice, so it is not counted as a problem.`
    : "";
  if (s.mismatched > 0) {
    const firstDiff = r.mismatched[0];
    const extra = s.mismatched - 1;
    const what = firstDiff.differences.length === 1
      ? `${firstDiff.invoice_number}: ${describe(firstDiff.differences[0], first, second)}`
      : `${firstDiff.invoice_number} has ${plural(firstDiff.differences.length, "difference")}.`;
    return {
      tone: "review", icon: <AlertTriangle size={18} />,
      title: s.mismatched === 1 ? "1 invoice does not agree between the two documents" : `${s.mismatched} invoices do not agree between the two documents`,
      text: `${what}${extra > 0 ? ` And ${plural(extra, "more invoice")}.` : ""} Open the documents to see which one is right, or mark the invoice for review so a person checks it.`,
      note,
    };
  }
  if (s.matched > 0) {
    return {
      tone: "ok", icon: <CheckCircle2 size={18} />,
      title: s.matched === 1 ? "The invoice that is in both documents agrees" : `All ${s.matched} invoices that are in both documents agree`,
      text: "Supplier, customer, date, currency and amounts are the same in both.",
      note,
    };
  }
  return {
    tone: "work", icon: <Info size={18} />,
    title: "These two documents have no invoice in common",
    text: s.without_invoice_number > 0
      ? `${plural(s.without_invoice_number, "invoice")} could not be matched because no invoice number was found.`
      : "Invoices are matched by their invoice number, and none of these share one. Check that you chose the documents you meant.",
    note: "",
  };
}

function DocCard({ doc, hint }: { doc: DocumentOut | undefined; hint: string }) {
  if (!doc) return <div className="doc-card empty-card">{hint}</div>;
  const k = fileKind(doc.file_type, doc.filename);
  return (
    <div className="doc-card">
      <span className={`tag ${KIND_CLASS[k.kind]}`}>{k.label}</span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="doc-card-name truncate" title={doc.filename}>{doc.filename}</div>
        <div className="cell-sub">
          {plural(Math.max(doc.invoice_count, 1), "invoice")}{doc.summary?.supplier_name ? ` · ${doc.summary.supplier_name}` : ""}
        </div>
      </div>
      <StatusBadge status={doc.status} />
    </div>
  );
}

export default function CrossVerifyPage() {
  const dispatch = useAppDispatch();
  // The documents come from the shared list; the choices and the result stay when you leave and come back
  const items = useAppSelector((s) => s.documents.items);
  const listLoaded = useAppSelector((s) => s.documents.listLoaded);
  const { left, right, report, running, error } = useAppSelector((s) => s.verify);
  const docs = useMemo(() => items.filter((d) => d.status === "completed" || d.status === "needs_review"), [items]);
  const byId = useMemo(() => new Map(docs.map((d) => [d.id, d])), [docs]);

  const options = (exclude: string) =>
    docs.filter((d) => d.id !== exclude).map((d) => <option key={d.id} value={d.id}>{d.filename} · {plural(Math.max(d.invoice_count, 1), "invoice")}</option>);
  const head = report ? headline(report) : null;
  const s = report?.summary;
  const flagged = (report?.flagged_results ?? 0) > 0;
  const first = report?.left_document;
  const second = report?.right_document;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Cross-verify</h1>
          <p className="page-sub">Double-check that two documents agree. Pick two that should list some of the same invoices, for example a supplier’s PDF and your own Excel list.</p>
        </div>
      </div>

      <section className="card card-pad" style={{ position: "relative", overflow: "hidden" }} aria-busy={running !== null}>
        {running === "compare" && <div className="progress-indeterminate" aria-hidden="true" />}
        <div className="pick-grid">
          <div>
            <label className="field"><span>First document</span>
              <select className="select" value={left} onChange={(e) => dispatch(setLeft(e.target.value))} disabled={running !== null}>
                <option value="">Choose a document</option>{options(right)}
              </select>
            </label>
            <DocCard doc={byId.get(left)} hint="For example: the supplier’s invoice (PDF)." />
          </div>
          <button type="button" className="btn-icon swap" title="Swap the two documents" aria-label="Swap the two documents" onClick={() => dispatch(swapSides())} disabled={running !== null || (!left && !right)}>
            <ArrowLeftRight size={17} />
          </button>
          <div>
            <label className="field"><span>Second document</span>
              <select className="select" value={right} onChange={(e) => dispatch(setRight(e.target.value))} disabled={running !== null}>
                <option value="">Choose a document</option>{options(left)}
              </select>
            </label>
            <DocCard doc={byId.get(right)} hint="For example: your own list (Excel or CSV)." />
          </div>
        </div>
        <div className="row" style={{ marginTop: 18, justifyContent: "space-between" }}>
          <span className="muted small">Comparing is safe: it changes nothing in your documents.</span>
          <button type="button" className="btn btn-primary" disabled={!left || !right || running !== null} onClick={() => void dispatch(runCrossVerify({ flag: false }))}>
            {running === "compare" ? <><Loader2 size={15} className="spin" /> Comparing…</> : <><GitCompareArrows size={15} /> Compare documents</>}
          </button>
        </div>
      </section>

      {listLoaded && docs.length < 2 && (
        <div className="alert alert-info" style={{ marginTop: 16 }}><Info size={16} />
          <div>You need at least two processed documents to compare. <Link href="/" className="link">Upload documents</Link> first.</div>
        </div>
      )}
      {error && <div className="alert alert-error" role="alert" style={{ marginTop: 16 }}><AlertTriangle size={16} /><div>{error}</div></div>}

      {/* ---------------------------------------------------------------- while comparing */}
      {running === "compare" && (
        <section className="card card-pad" style={{ marginTop: 16, display: "grid", gap: 12 }} role="status" aria-live="polite" aria-label="Comparing the documents">
          <span className="thinking">Checking the invoices one by one<span className="dots" aria-hidden="true"><i /><i /><i /></span></span>
          <div className="skeleton" style={{ height: 64 }} />
          <div className="skeleton" style={{ height: 14, width: "80%" }} />
          <div className="skeleton" style={{ height: 14, width: "62%" }} />
        </section>
      )}

      {/* ---------------------------------------------------------------- explanation, until there is a result */}
      {!report && !running && (
        <section className="card card-pad" style={{ marginTop: 16 }} aria-label="What this does">
          <h2 className="card-title" style={{ marginBottom: 14 }}>What does this do?</h2>
          <ol className="steps">
            <li><span className="step-num">1</span><div><b>You choose two documents</b><p>They should list some of the same invoices.</p></div></li>
            <li><span className="step-num">2</span><div><b>We find each invoice in both</b><p>An invoice is recognised by its invoice number.</p></div></li>
            <li><span className="step-num">3</span><div><b>We tell you what disagrees</b><p>Supplier, date and amounts are compared. Differences smaller than 0.01 are ignored.</p></div></li>
          </ol>
          <div className="example"><Lightbulb size={16} />
            <div><b>Example.</b> Your Excel list says invoice BL-7719 is 1,428.00, but the supplier’s PDF says 1,498.00. This page finds that for you and shows both numbers side by side.</div>
          </div>
        </section>
      )}

      {/* ---------------------------------------------------------------- result */}
      {report && head && s && first && second && (
        <div className="stack" style={{ marginTop: 16 }}>
          <div className={`verdict ${head.tone}`} role="status" style={{ marginBottom: 0 }}>
            <span className="v-icon">{head.icon}</span>
            <div>
              <h2>{head.title}</h2>
              <p>{head.text}</p>
              {head.note && <p style={{ opacity: .85 }}>{head.note}</p>}
            </div>
            {s.mismatched > 0 && (
              <button type="button" className={`btn ${flagged ? "" : "btn-primary"}`} style={{ alignSelf: "center" }}
                title="Marks these invoices as “needs review” in both documents, so a person checks them."
                disabled={running !== null || flagged} onClick={() => void dispatch(runCrossVerify({ flag: true }))}>
                {running === "flag" ? <><Loader2 size={15} className="spin" /> Marking…</> : flagged ? <><Check size={15} /> Marked for review</> : <><Send size={15} /> Mark {s.mismatched === 1 ? "it" : `${s.mismatched} invoices`} for review</>}
              </button>
            )}
          </div>

          <section className="card" aria-label="Invoice by invoice">
            <div className="card-head">
              <h2 className="card-title">Invoice by invoice</h2>
              <div className="row" style={{ gap: 14 }}>
                <Link href={`/documents/${first.id}`} className="link small truncate" style={{ maxWidth: 260 }}>{first.filename} <ArrowUpRight size={12} style={{ verticalAlign: -1 }} /></Link>
                <Link href={`/documents/${second.id}`} className="link small truncate" style={{ maxWidth: 260 }}>{second.filename} <ArrowUpRight size={12} style={{ verticalAlign: -1 }} /></Link>
              </div>
            </div>

            {/* 1. what does not agree: each with the two values side by side */}
            {report.mismatched.map((m) => (
              <div className="inv-row" key={`d-${m.invoice_number}`}>
                <div className="inv-head">
                  <span className="badge b-needs_review">Does not agree</span>
                  <b className="mono">{m.invoice_number}</b>
                </div>
                <table className="t compact">
                  <thead><tr><th>What</th><th title={first.filename}>In {first.filename}</th><th title={second.filename}>In {second.filename}</th></tr></thead>
                  <tbody>
                    {m.differences.map((d) => (
                      <tr key={d.field}>
                        <td>{label(d.field)}</td>
                        <td><span className={typeof d.left === "number" ? "mono" : ""}>{show(d.left)}</span></td>
                        <td>
                          <span className={typeof d.right === "number" ? "mono" : ""}>{show(d.right)}</span>
                          {d.difference !== undefined && d.difference !== 0 && (
                            <span className="muted small"> ({money(Math.abs(d.difference))} {d.difference < 0 ? "more" : "less"} than in the first)</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}

            {/* 2. in only one of the documents */}
            {([["only_in_left", first], ["only_in_right", second]] as const).flatMap(([key, d]) =>
              report[key].map((r, i) => (
                <div className="inv-row" key={`o-${key}-${r.invoice_number}-${i}`}>
                  <div className="inv-head">
                    <span className="badge b-queued"><FileQuestion size={12} style={{ marginRight: 2 }} />Only in one document</span>
                    <b className="mono">{r.invoice_number}</b>
                    <span className="muted">{r.supplier_name ?? ""}{r.total != null ? ` · ${money(r.total)}` : ""}</span>
                  </div>
                  <p className="inv-note">Found in <b>{d.filename}</b> but not in {d === first ? second.filename : first.filename}.</p>
                </div>
              )),
            )}

            {/* 3. everything that agrees, kept short */}
            {report.matched.length > 0 && (
              <div className="inv-row">
                <div className="inv-head">
                  <span className="badge b-completed">Agree</span>
                  <b>{plural(report.matched.length, "invoice")} {report.matched.length === 1 ? "is" : "are"} the same in both documents</b>
                </div>
                <div className="chips" style={{ marginTop: 8 }}>
                  {report.matched.map((m) => <span key={m.invoice_number} className="tag mono"><Check size={11} style={{ marginRight: 4 }} />{m.invoice_number}</span>)}
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
