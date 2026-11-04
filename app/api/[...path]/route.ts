import type { NextRequest } from "next/server";

/**
 * Server-side proxy to the FastAPI backend.
 *  - the browser only ever talks to its own origin (no CORS, backend URL not exposed)
 *  - BACKEND_API_KEY is attached here, so the API key is never sent to the browser
 *  - request/response bodies are streamed, so large uploads and file downloads are not buffered in memory
 */
export const dynamic = "force-dynamic";

const BACKEND = (process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");
// content-length / content-encoding are deliberately NOT copied: fetch() transparently decompresses the upstream body
// (the hosting CDN gzips it), so the upstream length no longer matches and clients would receive a truncated response.
const PASS_THROUGH = ["content-type", "content-disposition", "retry-after", "x-request-id"];
// Requests without a body (reads) must answer within this time; uploads and downloads stream and are not cut off.
const READ_TIMEOUT_MS = 120_000;

function fail(status: number, detail: string, error: string): Response {
  return Response.json({ detail, error, request_id: "" }, { status, headers: { "cache-control": "no-store" } });
}

async function proxy(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const { path } = await ctx.params;
  const url = `${BACKEND}/api/${path.map(encodeURIComponent).join("/")}${req.nextUrl.search}`;

  const headers = new Headers();
  const contentType = req.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);

  // Server-side API key: never exposed to the browser
  if (process.env.BACKEND_API_KEY) headers.set("x-api-key", process.env.BACKEND_API_KEY);
  // ngrok's free tier answers browser-like requests with an interstitial page unless this header is present
  headers.set("ngrok-skip-browser-warning", "1");

  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  try {
    const upstream = await fetch(url, {
      method: req.method,
      headers,
      body: hasBody ? req.body : undefined,
      // required by Node's fetch when streaming a request body
      ...(hasBody ? { duplex: "half" } : {}),
      redirect: "manual",
      cache: "no-store",
      ...(hasBody ? {} : { signal: AbortSignal.timeout(READ_TIMEOUT_MS) }),
    } as RequestInit);

    // An error that is not JSON (an HTML page from a gateway or the host) is converted, so the browser always gets {detail, error}
    const type = upstream.headers.get("content-type") || "";
    if (upstream.status >= 400 && !type.includes("json")) {
      if (upstream.status === 502 || upstream.status === 503 || upstream.status === 504) {
        return fail(upstream.status, "The processing backend is starting up or temporarily unavailable. Please try again in a moment.", "upstream_unavailable");
      }
      return fail(upstream.status, `The backend answered with an unexpected ${upstream.status} response.`, "upstream_error");
    }

    const out = new Headers();
    for (const h of PASS_THROUGH) {
      const v = upstream.headers.get(h);
      if (v) out.set(h, v);
    }
    out.set("cache-control", "no-store");
    return new Response(upstream.status === 204 ? null : upstream.body, { status: upstream.status, headers: out });
  } catch (err) {
    if (err instanceof DOMException && (err.name === "TimeoutError" || err.name === "AbortError")) {
      return fail(504, "The processing backend took too long to answer. Please try again.", "upstream_timeout");
    }
    return fail(502, "The processing backend is unreachable.", "upstream_unreachable");
  }
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE };
