import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  api: {
    listDocuments: vi.fn(), stats: vi.fn(), getDocument: vi.fn(), getResults: vi.fn(), getHistory: vi.fn(),
    approve: vi.fn(), reject: vi.fn(), reconcile: vi.fn(), rerunOcr: vi.fn(), correctDocument: vi.fn(),
    deleteDocument: vi.fn(), upload: vi.fn(), crossVerify: vi.fn(), search: vi.fn(), ragSearch: vi.fn(),
  },
}));

import { api } from "@/lib/api";
import type { DocumentOut } from "@/lib/types";
import { makeStore } from "@/store";
import {
  addQueued, approveDocument, deleteDocument, fetchDocumentDetails, fetchDocuments, hydratePrefs, patchDocument, removeDocument,
  selectCounts, selectFiltered, selectPageInfo, setPage, setSearchQuery, setStatusFilter, setTypeFilter, syncNow, toggleSelectId, uploadDocuments,
} from "@/store/documentsSlice";
import { dismissToast, notify } from "@/store/notificationsSlice";
import { loadPrefs, persistPrefs, pickPrefs } from "@/store/persist";
import { runSearch } from "@/store/searchSlice";
import { setZoom } from "@/store/uiSlice";
import { runCrossVerify, setLeft, setRight } from "@/store/verifySlice";

const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;
const doc = (id: string, o: Partial<DocumentOut> = {}): DocumentOut => ({
  id, filename: `${id}.pdf`, file_type: "application/pdf", size_bytes: 10, status: "completed", stage: "done", progress: 1, page_count: 1,
  pages_done: 1, error: null, attempts: 0, processing_ms: 100, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
  invoice_count: 1, needs_review: false, summary: {}, ...o,
} as DocumentOut);

beforeEach(() => {
  Object.values(mocked).forEach((f) => f.mockReset());
  mocked.listDocuments.mockResolvedValue([]);
  mocked.stats.mockResolvedValue({ total: 0, by_status: {}, avg_processing_ms: null, open_review_items: 0 });
  mocked.getDocument.mockImplementation(async (id: string) => doc(id));
  mocked.getResults.mockResolvedValue([]);
  mocked.getHistory.mockResolvedValue([]);
  mocked.search.mockResolvedValue([]);
});

describe("notifications", () => {
  it("does not stack the same message twice, keeps at most four, and dismisses by id", () => {
    const s = makeStore();
    s.dispatch(notify("success", "Saved"));
    s.dispatch(notify("success", "Saved"));
    expect(s.getState().notifications.toasts).toHaveLength(1);
    for (const n of ["a", "b", "c", "d", "e"]) s.dispatch(notify("info", n));
    const toasts = s.getState().notifications.toasts;
    expect(toasts).toHaveLength(4);
    expect(toasts.map((t) => t.text)).toEqual(["b", "c", "d", "e"]); // the oldest were dropped
    s.dispatch(dismissToast(toasts[0].id));
    expect(s.getState().notifications.toasts).toHaveLength(3);
  });
});

describe("filters, selection and selectors", () => {
  it("changing a filter or the query returns to page 1, and the page never goes past the last one", () => {
    const s = makeStore();
    s.dispatch(setPage(3)); s.dispatch(setStatusFilter("Needs Review")); expect(s.getState().documents.page).toBe(1);
    s.dispatch(setPage(2)); s.dispatch(setTypeFilter("pdf")); expect(s.getState().documents.page).toBe(1);
    s.dispatch(setPage(2)); s.dispatch(setSearchQuery("acme")); expect(s.getState().documents.page).toBe(1);
    s.dispatch(setPage(99));
    expect(selectPageInfo(s.getState()).page).toBe(1); // no documents, so the page is clamped
  });

  it("filters by status and by real file kind, and counts from the list while the server has no numbers", async () => {
    const s = makeStore();
    mocked.listDocuments.mockResolvedValue([
      doc("a", { status: "needs_review" }), doc("b", { status: "completed", file_type: "image/png", filename: "b.png" }),
      doc("c", { status: "rejected" }), doc("d", { status: "processing" }),
    ]);
    await s.dispatch(fetchDocuments());
    expect(selectCounts(s.getState())).toEqual({ all: 4, review: 1, done: 1, work: 1, bad: 1 });
    s.dispatch(setStatusFilter("Failed"));
    expect(selectFiltered(s.getState()).map((d) => d.id)).toEqual(["c"]);
    s.dispatch(setStatusFilter("All")); s.dispatch(setTypeFilter("image"));
    expect(selectFiltered(s.getState()).map((d) => d.id)).toEqual(["b"]);
  });

  it("toggles selection and forgets documents that disappear from the list", async () => {
    const s = makeStore();
    mocked.listDocuments.mockResolvedValue([doc("a"), doc("b")]);
    await s.dispatch(fetchDocuments());
    s.dispatch(toggleSelectId("a")); s.dispatch(toggleSelectId("b")); s.dispatch(toggleSelectId("b"));
    expect(s.getState().documents.selectedIds).toEqual(["a"]);
    mocked.listDocuments.mockResolvedValue([doc("b")]);
    await s.dispatch(fetchDocuments());
    expect(s.getState().documents.selectedIds).toEqual([]);
  });
});

describe("list loading", () => {
  it("ignores an older answer that arrives after a newer request (for example after typing a new search)", async () => {
    const s = makeStore();
    let releaseOld!: (v: DocumentOut[]) => void;
    mocked.listDocuments.mockImplementationOnce(() => new Promise((r) => { releaseOld = r; }));
    const first = s.dispatch(fetchDocuments());
    mocked.listDocuments.mockResolvedValueOnce([doc("new")]);
    await s.dispatch(fetchDocuments());
    releaseOld([doc("old")]);
    await first;
    expect(s.getState().documents.items.map((d) => d.id)).toEqual(["new"]);
  });

  it("keeps the last list when a refresh fails, and reports the backend as offline", async () => {
    const s = makeStore();
    mocked.listDocuments.mockResolvedValueOnce([doc("a")]);
    await s.dispatch(syncNow());
    expect(s.getState().ui.connection).toBe("online");
    mocked.listDocuments.mockRejectedValue(new Error("network down"));
    mocked.stats.mockRejectedValue(new Error("network down"));
    await s.dispatch(syncNow());
    expect(s.getState().ui.connection).toBe("offline");
    expect(s.getState().documents.items.map((d) => d.id)).toEqual(["a"]);
    expect(s.getState().documents.error).toContain("network down");
  });
});

describe("actions are applied at once and undone when the server refuses", () => {
  it("approve shows the document as verified immediately, then confirms with a toast", async () => {
    const s = makeStore();
    mocked.listDocuments.mockResolvedValue([doc("a", { status: "needs_review" })]);
    await s.dispatch(fetchDocuments());
    let finish!: (v: unknown) => void;
    mocked.approve.mockImplementation(() => new Promise((r) => { finish = r; }));
    const run = s.dispatch(approveDocument({ id: "a" }));
    expect(s.getState().documents.items[0].status).toBe("completed"); // before the server has answered
    expect(s.getState().documents.busyIds).toContain("a");
    mocked.listDocuments.mockResolvedValue([doc("a", { status: "completed" })]);
    finish({ success: true, original_removed: true });
    await run;
    expect(s.getState().documents.busyIds).toEqual([]);
    expect(s.getState().notifications.toasts[0]).toMatchObject({ kind: "success" });
    expect(s.getState().notifications.toasts[0].text).toContain("deleted from storage");
  });

  it("a refused approval is undone from the server's truth and explained in a toast", async () => {
    const s = makeStore();
    mocked.listDocuments.mockResolvedValue([doc("a", { status: "needs_review" })]);
    await s.dispatch(fetchDocuments());
    mocked.approve.mockRejectedValue(new Error("Document not found."));
    const result = await s.dispatch(approveDocument({ id: "a" }));
    expect(result.meta.requestStatus).toBe("rejected");
    await vi.waitFor(() => expect(s.getState().documents.items[0].status).toBe("needs_review")); // restored by the follow-up sync
    expect(s.getState().notifications.toasts.some((t) => t.kind === "error" && t.text.includes("Could not approve"))).toBe(true);
  });

  it("delete removes the row at once and puts it back with a message if the server refuses", async () => {
    const s = makeStore();
    mocked.listDocuments.mockResolvedValue([doc("a"), doc("b")]);
    await s.dispatch(fetchDocuments());
    mocked.deleteDocument.mockRejectedValue(new Error("boom"));
    const run = s.dispatch(deleteDocument({ id: "a", filename: "a.pdf" }));
    expect(s.getState().documents.items.map((d) => d.id)).toEqual(["b"]);
    await run;
    await vi.waitFor(() => expect(s.getState().documents.items.map((d) => d.id)).toEqual(["a", "b"]));
    expect(s.getState().notifications.toasts.some((t) => t.kind === "error" && t.text.includes("a.pdf"))).toBe(true);
  });

  it("uploads appear in the list immediately as queued, once, with a confirmation and a note about refused files", async () => {
    const s = makeStore();
    mocked.upload.mockResolvedValue([
      { id: "n1", filename: "n1.pdf", status: "queued", error: null, duplicate_of: null },
      { id: null, filename: "bad.exe", status: "rejected", error: "type", duplicate_of: null },
    ]);
    await s.dispatch(uploadDocuments([new File(["x"], "n1.pdf")]));
    expect(s.getState().documents.items[0]).toMatchObject({ id: "n1", status: "queued" });
    s.dispatch(addQueued([{ id: "n1", filename: "n1.pdf" }])); // adding it again changes nothing
    expect(s.getState().documents.items.filter((d) => d.id === "n1")).toHaveLength(1);
    expect(s.getState().notifications.toasts.map((t) => t.kind)).toEqual(["success", "error"]);
  });

  it("a failed upload reports the reason and rejects, so the page can keep the files for a retry", async () => {
    const s = makeStore();
    mocked.upload.mockRejectedValue(new Error("Too many files"));
    const r = await s.dispatch(uploadDocuments([new File(["x"], "a.pdf")]));
    expect(r.meta.requestStatus).toBe("rejected");
    expect(r.payload).toBe("Too many files");
  });
});

describe("document details cache", () => {
  it("shows a cached document while refreshing quietly, and keeps it if a quiet refresh fails", async () => {
    const s = makeStore();
    await s.dispatch(fetchDocumentDetails({ id: "x" }));
    expect(s.getState().documents.details.x.doc.id).toBe("x");
    mocked.getDocument.mockRejectedValue(new Error("offline"));
    await s.dispatch(fetchDocumentDetails({ id: "x", silent: true }));
    expect(s.getState().documents.details.x).toBeTruthy();
    expect(s.getState().documents.detailState.x).toBe("ready");
    await s.dispatch(fetchDocumentDetails({ id: "never-seen" }));
    expect(s.getState().documents.detailState["never-seen"]).toBe("error");
  });

  it("patchDocument and removeDocument keep the list and the cached detail in step", async () => {
    const s = makeStore();
    mocked.listDocuments.mockResolvedValue([doc("a")]);
    await s.dispatch(fetchDocuments());
    await s.dispatch(fetchDocumentDetails({ id: "a" }));
    s.dispatch(patchDocument({ id: "a", patch: { status: "rejected" } }));
    expect(s.getState().documents.items[0].status).toBe("rejected");
    expect(s.getState().documents.details.a.doc.status).toBe("rejected");
    s.dispatch(removeDocument("a"));
    expect(s.getState().documents.items).toEqual([]);
    expect(s.getState().documents.details.a).toBeUndefined();
  });
});

describe("search history and cross-verify", () => {
  it("remembers recent searches without repeats (any case) and keeps six", async () => {
    const s = makeStore();
    for (const q of ["one", "two", "three", "four", "five", "six", "seven", "ONE"]) await s.dispatch(runSearch({ q, mode: "hybrid" }));
    const recent = s.getState().search.recent;
    expect(recent).toHaveLength(6);
    expect(recent[0]).toBe("ONE");
    expect(recent.filter((r) => r.toLowerCase() === "one")).toHaveLength(1);
  });

  it("keeps the comparison result in the store and clears it when a document choice changes", async () => {
    const s = makeStore();
    mocked.crossVerify.mockResolvedValue({ verdict: "match", flagged_results: 0, summary: {}, matched: [], mismatched: [], only_in_left: [], only_in_right: [] });
    s.dispatch(setLeft("a")); s.dispatch(setRight("b"));
    await s.dispatch(runCrossVerify());
    expect(s.getState().verify.report?.verdict).toBe("match");
    s.dispatch(setRight("c"));
    expect(s.getState().verify.report).toBeNull();
  });
});

describe("saved preferences", () => {
  const fakeStorage = () => {
    const data: Record<string, string> = {};
    (globalThis as any).window = { localStorage: { getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => { data[k] = v; } } };
    return data;
  };

  it("saves only preferences, never documents or results", () => {
    const s = makeStore();
    s.dispatch(setZoom(130)); s.dispatch(setStatusFilter("Completed")); s.dispatch(hydratePrefs({ pageSize: 25 }));
    const saved = JSON.stringify(pickPrefs(s.getState()));
    expect(saved).toContain("\"zoom\":130");
    expect(saved).toContain("Completed");
    expect(saved).not.toContain("items");
    expect(saved).not.toContain("details");
  });

  it("writes them to storage after a change, reads them back, and survives a damaged value", async () => {
    const data = fakeStorage();
    vi.useFakeTimers();
    const s = makeStore();
    const stop = persistPrefs(s as any);
    s.dispatch(setZoom(150));
    await vi.advanceTimersByTimeAsync(400);
    stop();
    vi.useRealTimers();
    expect(loadPrefs()?.ui?.zoom).toBe(150);
    data["docuintel.prefs.v1"] = "{not json";
    expect(loadPrefs()).toBeNull();
  });

  it("clamps zoom to the supported range", () => {
    const s = makeStore();
    s.dispatch(setZoom(900)); expect(s.getState().ui.zoom).toBe(200);
    s.dispatch(setZoom(1)); expect(s.getState().ui.zoom).toBe(50);
  });
});
