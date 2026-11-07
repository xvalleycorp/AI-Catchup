export { CatchupRun } from "./workflow";
import { renderPage, renderEmptyPage } from "./render";
import { rebuildSnapshot } from "./snapshot";
import type { Snapshot } from "./types";

/** Data only changes twice a day, so a short edge cache is mainly protection for D1. */
const EDGE_TTL_S = 600;

const CSP = [
  "default-src 'none'",
  // The zone has Cloudflare Web Analytics enabled, which injects this beacon.
  "script-src 'self' https://static.cloudflareinsights.com",
  "connect-src 'self' https://cloudflareinsights.com",
  "style-src 'self' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join("; ");

const SECURITY_HEADERS = {
  "Content-Security-Policy": CSP,
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

async function loadKv(env: Env, key: "snapshot" | "history"): Promise<string | null> {
  return env.DB.prepare("SELECT value FROM kv WHERE key = ?1").bind(key).first<string>("value");
}

/** The edge cache holds pages for 10 minutes; browsers must revalidate so a new scan shows up on reload. */
function forViewer(response: Response, request: Request): Response {
  const viewer = new Response(request.method === "HEAD" ? null : response.body, response);
  viewer.headers.set("Cache-Control", "no-cache");
  return viewer;
}

async function handlePage(request: Request, env: Env, ctx: ExecutionContext, json: boolean): Promise<Response> {
  const cache = caches.default;
  const cacheKey = new Request(new URL(request.url).origin + new URL(request.url).pathname);
  const cached = await cache.match(cacheKey);
  if (cached) return forViewer(cached, request);

  const stored = await loadKv(env, new URL(request.url).pathname === "/api/history.json" ? "history" : "snapshot");
  if (!stored) {
    if (json) return Response.json({ error: "not_ready" }, { status: 503 });
    return new Response(renderEmptyPage(), { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Retry-After": "600", ...SECURITY_HEADERS } });
  }

  const response = json
    ? new Response(stored, { headers: { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*", "Cache-Control": `public, s-maxage=${EDGE_TTL_S}` } })
    : new Response(renderPage(JSON.parse(stored) as Snapshot, Date.now()), {
        headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": `public, s-maxage=${EDGE_TTL_S}`, ...SECURITY_HEADERS },
      });
  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return forViewer(response, request);
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
    const { pathname } = new URL(request.url);
    try {
      if (pathname === "/") return await handlePage(request, env, ctx, false);
      if (pathname === "/api/snapshot.json" || pathname === "/api/history.json") return await handlePage(request, env, ctx, true);
    } catch (e) {
      console.error(JSON.stringify({ event: "request_failed", path: pathname, error: e instanceof Error ? e.message : String(e) }));
      return new Response("Tạm thời không tải được dữ liệu.", { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
    return new Response("Not Found", { status: 404 });
  },

  /** Twice a day (see wrangler.jsonc). The Workflow does the work, one step per source. */
  async scheduled(_controller, env): Promise<void> {
    const instance = await env.CATCHUP_RUN.create();
    console.log(JSON.stringify({ event: "run_started", id: instance.id }));
  },
} satisfies ExportedHandler<Env>;
