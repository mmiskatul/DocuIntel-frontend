import type { NextRequest } from "next/server";

/**
 * Server-side proxy to the FastAPI backend.
 *  - the browser only ever talks to its own origin (no CORS, backend URL not exposed)
 *  - BACKEND_API_KEY is attached here, so the API key is never sent to the browser
 *  - request/response bodies are streamed, so large uploads and file downloads are not buffered in memory
 */
export const dynamic = "force-dynamic";

const BACKEND = (process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");
const PASS_THROUGH = ["content-type", "content-disposition", "content-length", "retry-after"];

async function proxy(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const { path } = await ctx.params;
  const url = `${BACKEND}/api/${path.map(encodeURIComponent).join("/")}${req.nextUrl.search}`;

  const headers = new Headers();
  const contentType = req.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);

  // Forward JWT Authorization header from client
  const authHeader = req.headers.get("authorization");
  if (authHeader) headers.set("authorization", authHeader);

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
    } as RequestInit);

    const out = new Headers();
    for (const h of PASS_THROUGH) {
      const v = upstream.headers.get(h);
      if (v) out.set(h, v);
    }
    out.set("cache-control", "no-store");
    return new Response(upstream.status === 204 ? null : upstream.body, { status: upstream.status, headers: out });
  } catch {
    return Response.json({ detail: "The processing backend is unreachable" }, { status: 502 });
  }
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE };
