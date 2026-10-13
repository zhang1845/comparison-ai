import { describeUpstreamFailure, proxyTimeoutMs } from "@/lib/providers";
import { joinUrl } from "@/lib/providers/shared";
import { GuardError, assertSafeBaseUrl } from "@/lib/proxy-guard";

export const runtime = "nodejs";

function fail(status: number, code: string, message: string) {
  return Response.json({ code, message }, { status });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "invalid_request", "请求体不是合法 JSON");
  }
  const rawBase = (body as { baseUrl?: unknown } | null)?.baseUrl;
  if (typeof rawBase !== "string" || rawBase.trim() === "") return fail(400, "invalid_base_url", "接口地址无法识别");

  const apiKey = request.headers.get("x-api-key")?.trim() ?? "";
  if (!apiKey) return fail(400, "missing_key", "尚未配置密钥");

  let baseUrl: string;
  try {
    baseUrl = assertSafeBaseUrl(rawBase);
  } catch (e) {
    if (e instanceof GuardError) return fail(400, e.code, e.message);
    return fail(400, "invalid_base_url", "接口地址无法识别");
  }

  const upstream = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    upstream.abort();
  }, proxyTimeoutMs());
  request.signal.addEventListener("abort", () => upstream.abort());

  try {
    const res = await fetch(joinUrl(baseUrl, "/models"), {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      redirect: "manual",
      signal: upstream.signal,
      cache: "no-store",
    });
    if (res.status >= 300 && res.status < 400) {
      return fail(502, "provider_error", `厂商返回错误（HTTP ${res.status} 重定向，已拒绝跟随）`);
    }
    const text = await res.text();
    if (!res.ok) return fail(502, "provider_error", describeUpstreamFailure(res.status, text, apiKey));

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return fail(502, "provider_error", "厂商返回错误：模型列表无法解析");
    }
    const list = Array.isArray(json)
      ? json
      : Array.isArray((json as { data?: unknown }).data)
        ? (json as { data: unknown[] }).data
        : [];
    const ids = Array.from(
      new Set(
        list
          .map((x) => (x && typeof x === "object" ? (x as { id?: unknown }).id : undefined))
          .filter((id): id is string => typeof id === "string" && id.trim() !== "")
          .map((id) => id.trim()),
      ),
    ).slice(0, 200);
    return Response.json({ ids });
  } catch {
    if (timedOut) return fail(502, "timeout", "厂商超时");
    return fail(502, "network", "网络连接失败");
  } finally {
    clearTimeout(timer);
  }
}
