import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "../lib/api";

const reply = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers });

afterEach(() => vi.unstubAllGlobals());

async function failure(res: Response | Error): Promise<ApiError> {
  vi.stubGlobal("fetch", vi.fn(() => (res instanceof Error ? Promise.reject(res) : Promise.resolve(res))));
  try { await api.stats(); } catch (e) { return e as ApiError; }
  throw new Error("expected an error");
}

describe("backend errors reach the UI exactly", () => {
  it("keeps status, code, request id and the backend's own message", async () => {
    const e = await failure(reply(503, { detail: "The database is temporarily unavailable.", error: "database_unavailable", request_id: "abc123" }));
    expect(e).toBeInstanceOf(ApiError);
    expect([e.status, e.code, e.requestId]).toEqual([503, "database_unavailable", "abc123"]);
    expect(e.message).toBe("The database is temporarily unavailable. (ref abc123)");
    expect(e.retryable).toBe(true);
  });
  it("does not add a reference to client errors, and they are not retryable", async () => {
    const e = await failure(reply(404, { detail: "Document not found.", error: "http_error", request_id: "r1" }));
    expect(e.message).toBe("Document not found.");
    expect(e.retryable).toBe(false);
  });
  it("turns validation error lists into readable field messages and keeps the raw list", async () => {
    const e = await failure(reply(422, { detail: [{ loc: ["query", "limit"], msg: "must be at least 1" }], error: "validation_error", request_id: "v" }));
    expect(e.message).toBe("limit: must be at least 1");
    expect(Array.isArray(e.detail)).toBe(true);
  });
  it("handles an HTML error page from a gateway", async () => {
    const e = await failure(reply(502, "<html>Bad Gateway</html>", { "content-type": "text/html" }));
    expect(e.status).toBe(502);
    expect(e.message).toBe("The backend could not be reached.");
  });
  it("reports an unreachable server as status 0", async () => {
    const e = await failure(new TypeError("Failed to fetch"));
    expect([e.status, e.code, e.retryable]).toEqual([0, "network_error", true]);
  });
  it("reports an unreadable success body", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(reply(200, "not json"))));
    await expect(api.stats()).rejects.toMatchObject({ code: "bad_response" });
  });
});
