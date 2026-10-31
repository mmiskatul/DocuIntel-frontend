import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  api: {
    listDocuments: vi.fn(), stats: vi.fn(), search: vi.fn(), ragSearch: vi.fn(), crossVerify: vi.fn(),
  },
}));

import { api } from "@/lib/api";
import { askConfirm, settleConfirm } from "@/lib/confirm";
import { makeStore } from "@/store";
import { runFilterSearch, runRagQuery, runSearch, setMode, setQuery } from "@/store/searchSlice";
import { runCrossVerify, setLeft, setRight, swapSides } from "@/store/verifySlice";

const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;
const doc = (id: string) => ({ id, filename: `${id}.pdf`, status: "completed", summary: {} });
const hit = (id: string) => ({ document_id: id, score: 0.5, snippet: "x", match: "hybrid", document: doc(id) });
const report = (over: Record<string, unknown> = {}) => ({
  verdict: "discrepancies_found", flagged_results: 0, summary: { matched: 0, mismatched: 1, only_in_left: 0, only_in_right: 0, left_invoices: 1, right_invoices: 1, without_invoice_number: 0 },
  matched: [], mismatched: [{ invoice_number: "X", differences: [] }], only_in_left: [], only_in_right: [],
  left_document: { id: "a", filename: "a.pdf" }, right_document: { id: "b", filename: "b.pdf" }, ...over,
});

beforeEach(() => {
  Object.values(mocked).forEach((f) => f.mockReset());
  mocked.listDocuments.mockResolvedValue([]);
  mocked.stats.mockResolvedValue({ total: 0, by_status: {}, avg_processing_ms: null, open_review_items: 0 });
});

describe("search: each search starts from a clean page", () => {
  it("clears the previous answer and results the moment a new search starts", async () => {
    const s = makeStore();
    mocked.ragSearch.mockResolvedValue({ query: "q", answer: "OLD ANSWER", provider_used: "m", citations: [], hits: [hit("a")], latency_ms: 5 });
    await s.dispatch(runRagQuery({ q: "first question" }));
    expect(s.getState().search.ragResult?.answer).toBe("OLD ANSWER");

    let release!: (v: unknown[]) => void;
    mocked.search.mockImplementation(() => new Promise((r) => { release = r; }));
    const pending = s.dispatch(runSearch({ q: "second", mode: "hybrid" }));
    expect(s.getState().search.ragResult).toBeNull();      // the old answer is gone while the new search runs
    expect(s.getState().search.hits).toBeNull();
    expect(s.getState().search.loading).toBe(true);
    release([hit("b")]);
    await pending;
    expect(s.getState().search.ragResult).toBeNull();      // and it does not come back
    expect(s.getState().search.hits?.map((h) => h.document_id)).toEqual(["b"]);
  });

  it("switching tab clears the other tab's results", async () => {
    const s = makeStore();
    mocked.search.mockResolvedValue([hit("a")]);
    await s.dispatch(runSearch({ q: "x", mode: "hybrid" }));
    expect(s.getState().search.hits).toHaveLength(1);
    s.dispatch(setMode("filters"));
    expect(s.getState().search.hits).toBeNull();
    s.dispatch(setQuery("kept"));                           // the typed text is kept
    s.dispatch(setMode("rag"));
    expect(s.getState().search.query).toBe("kept");
  });

  it("an older search that finishes late cannot overwrite a newer one", async () => {
    const s = makeStore();
    let releaseOld!: (v: unknown[]) => void;
    mocked.search.mockImplementationOnce(() => new Promise((r) => { releaseOld = r; }));
    const first = s.dispatch(runSearch({ q: "old", mode: "hybrid" }));
    mocked.search.mockResolvedValueOnce([hit("new")]);
    await s.dispatch(runSearch({ q: "new", mode: "hybrid" }));
    releaseOld([hit("old")]);
    await first;
    expect(s.getState().search.hits?.map((h) => h.document_id)).toEqual(["new"]);
    expect(s.getState().search.loading).toBe(false);
  });

  it("a failed search shows its error and no stale results; a filter search fills documents", async () => {
    const s = makeStore();
    mocked.ragSearch.mockResolvedValue({ query: "q", answer: "A", provider_used: "m", citations: [], hits: [], latency_ms: 1 });
    await s.dispatch(runRagQuery({ q: "q" }));
    mocked.search.mockRejectedValue(new Error("Search is down"));
    await s.dispatch(runSearch({ q: "x", mode: "keyword" }));
    expect(s.getState().search.error).toBe("Search is down");
    expect(s.getState().search.ragResult).toBeNull();
    mocked.listDocuments.mockResolvedValue([doc("z")]);
    await s.dispatch(runFilterSearch({ supplier: "Acme", min_total: 10 }));
    expect(s.getState().search.docs?.map((d) => d.id)).toEqual(["z"]);
    expect(mocked.listDocuments).toHaveBeenLastCalledWith({ supplier: "Acme", min_total: 10 });
  });
});

describe("cross-verify: comparing never changes documents", () => {
  it("a plain comparison asks the server NOT to flag anything", async () => {
    const s = makeStore();
    mocked.crossVerify.mockResolvedValue(report());
    s.dispatch(setLeft("a")); s.dispatch(setRight("b"));
    await s.dispatch(runCrossVerify({ flag: false }));
    expect(mocked.crossVerify).toHaveBeenCalledWith("a", "b", false);
    expect(s.getState().verify.report?.summary.mismatched).toBe(1);
    expect(s.getState().notifications.toasts).toHaveLength(0);
  });

  it("'mark for review' asks the server to flag, confirms with a toast and refreshes the list", async () => {
    const s = makeStore();
    s.dispatch(setLeft("a")); s.dispatch(setRight("b"));
    mocked.crossVerify.mockResolvedValue(report({ flagged_results: 1 }));
    await s.dispatch(runCrossVerify({ flag: true }));
    expect(mocked.crossVerify).toHaveBeenCalledWith("a", "b", true);
    expect(s.getState().notifications.toasts[0]).toMatchObject({ kind: "success" });
    expect(s.getState().notifications.toasts[0].text).toContain("1 invoice sent to review");
    expect(mocked.listDocuments).toHaveBeenCalled();
  });

  it("flagging keeps the result on screen while it runs, but a new comparison starts clean", async () => {
    const s = makeStore();
    s.dispatch(setLeft("a")); s.dispatch(setRight("b"));
    mocked.crossVerify.mockResolvedValue(report());
    await s.dispatch(runCrossVerify({ flag: false }));
    let done!: (v: unknown) => void;
    mocked.crossVerify.mockImplementation(() => new Promise((r) => { done = r; }));
    const flagging = s.dispatch(runCrossVerify({ flag: true }));
    expect(s.getState().verify.running).toBe("flag");
    expect(s.getState().verify.report).not.toBeNull();     // the differences stay visible
    done(report({ flagged_results: 1 })); await flagging;
    const again = s.dispatch(runCrossVerify({ flag: false }));
    expect(s.getState().verify.running).toBe("compare");
    expect(s.getState().verify.report).toBeNull();         // a fresh comparison clears the old result
    done(report()); await again;
  });

  it("swap exchanges the two documents and clears the result; an error is reported", async () => {
    const s = makeStore();
    s.dispatch(setLeft("a")); s.dispatch(setRight("b"));
    mocked.crossVerify.mockResolvedValue(report());
    await s.dispatch(runCrossVerify({ flag: false }));
    s.dispatch(swapSides());
    expect(s.getState().verify).toMatchObject({ left: "b", right: "a", report: null });
    mocked.crossVerify.mockRejectedValue(new Error("'x.pdf' is rejected; only processed documents can be cross-verified."));
    await s.dispatch(runCrossVerify({ flag: false }));
    expect(s.getState().verify.error).toContain("only processed documents");
    expect(s.getState().verify.running).toBeNull();
  });
});

describe("confirmation popup", () => {
  it("opens with the given text, and resolves true on confirm and false on cancel", async () => {
    const s = makeStore();
    const yes = askConfirm(s.dispatch, { title: "Delete?", message: "m", confirmLabel: "Delete", icon: "trash" });
    expect(s.getState().ui.confirm).toMatchObject({ title: "Delete?", confirmLabel: "Delete", tone: "danger", icon: "trash" });
    settleConfirm(s.dispatch, true);
    expect(await yes).toBe(true);
    expect(s.getState().ui.confirm).toBeNull();

    const no = askConfirm(s.dispatch, { title: "Reject?", message: "m", confirmLabel: "Reject" });
    settleConfirm(s.dispatch, false);
    expect(await no).toBe(false);
  });

  it("a newer question cancels an unanswered older one, and answering twice is harmless", async () => {
    const s = makeStore();
    const first = askConfirm(s.dispatch, { title: "One", message: "m", confirmLabel: "Ok" });
    const second = askConfirm(s.dispatch, { title: "Two", message: "m", confirmLabel: "Ok" });
    expect(await first).toBe(false);
    expect(s.getState().ui.confirm?.title).toBe("Two");
    settleConfirm(s.dispatch, true);
    settleConfirm(s.dispatch, true);
    expect(await second).toBe(true);
    expect(s.getState().ui.confirm).toBeNull();
  });
});
