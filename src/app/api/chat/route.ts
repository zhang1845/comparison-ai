import { MAX_BODY_BYTES, validateChatRequest } from "@/lib/chat-request";
import { streamChat } from "@/lib/providers";
import { GuardError, assertSafeBaseUrl } from "@/lib/proxy-guard";

export const runtime = "nodejs";

function invalid(status: number, code: string, message: string) {
  return Response.json({ code, message }, { status });
}

export async function POST(request: Request) {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return invalid(413, "invalid_request", "请求体过大");
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    return invalid(413, "invalid_request", "请求体过大");
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return invalid(400, "invalid_request", "请求体不是合法 JSON");
  }
  const checked = validateChatRequest(body);
  if (!checked.ok) return invalid(400, "invalid_request", checked.message);

  const apiKey = request.headers.get("x-api-key")?.trim() ?? "";
  if (!apiKey) return invalid(400, "missing_key", "尚未配置密钥");

  let baseUrl: string;
  try {
    baseUrl = assertSafeBaseUrl(checked.value.baseUrl);
  } catch (e) {
    if (e instanceof GuardError) return invalid(400, e.code, e.message);
    return invalid(400, "invalid_base_url", "接口地址无法识别");
  }

  const stream = streamChat({ ...checked.value, baseUrl }, apiKey, request.signal);
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
