export type GuardCode = "invalid_base_url" | "blocked_host";

export class GuardError extends Error {
  constructor(
    public code: GuardCode,
    message: string,
  ) {
    super(message);
    this.name = "GuardError";
  }
}

const LOOPBACK_NAMES = new Set(["localhost", "127.0.0.1", "::1"]);
const BLOCKED_NAMES = new Set(["0.0.0.0", "169.254.169.254", "metadata.google.internal"]);

function parseIPv4(host: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  return parts.every((n) => n >= 0 && n <= 255) ? parts : null;
}

function isBlockedIPv4([a, b]: number[]): boolean {
  return (
    a === 0 || // 0.0.0.0/8
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // 运营商级 NAT
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224 // 组播与保留
  );
}

function expandIPv6(host: string): number[] | null {
  if (!host.includes(":")) return null;
  let h = host;
  const v4 = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(h);
  if (v4) {
    const p = parseIPv4(v4[1]);
    if (!p) return null;
    h = h.slice(0, -v4[1].length) + `${((p[0] << 8) | p[1]).toString(16)}:${((p[2] << 8) | p[3]).toString(16)}`;
  }
  const [head, tail] = h.split("::");
  if (h.split("::").length > 2) return null;
  const headParts = head ? head.split(":") : [];
  const tailParts = tail !== undefined && tail !== "" ? tail.split(":") : [];
  const missing = 8 - headParts.length - tailParts.length;
  if (tail === undefined && missing !== 0) return null;
  if (missing < 0) return null;
  const all = [...headParts, ...Array(tail === undefined ? 0 : missing).fill("0"), ...tailParts];
  const words = all.map((x) => (/^[0-9a-f]{1,4}$/i.test(x) ? parseInt(x, 16) : NaN));
  return words.length === 8 && words.every((n) => !Number.isNaN(n)) ? words : null;
}

function isBlockedIPv6(w: number[]): boolean {
  if (w.every((x) => x === 0)) return true; // ::
  if (w.slice(0, 7).every((x) => x === 0) && w[7] === 1) return true; // ::1 回环
  if ((w[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 唯一本地
  if ((w[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 链路本地
  if ((w[0] & 0xff00) === 0xff00) return true; // ff00::/8 组播
  if (w.slice(0, 5).every((x) => x === 0) && (w[5] === 0xffff || w[5] === 0)) {
    // IPv4 映射 / 兼容地址
    return isBlockedIPv4([w[6] >> 8, w[6] & 0xff, w[7] >> 8, w[7] & 0xff]);
  }
  return false;
}

/**
 * 第 13 节地址规则。只看字面主机，不做 DNS 解析。
 * 通过时返回去掉尾斜杠的规范地址。
 */
export function assertSafeBaseUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(String(raw ?? "").trim());
  } catch {
    throw new GuardError("invalid_base_url", "接口地址无法识别");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new GuardError("blocked_host", "这个地址不允许由服务器访问");
  }
  if (url.username || url.password) {
    throw new GuardError("blocked_host", "这个地址不允许由服务器访问");
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!host) throw new GuardError("invalid_base_url", "接口地址无法识别");

  if (LOOPBACK_NAMES.has(host)) {
    return url.toString().replace(/\/+$/, "");
  }
  if (url.protocol !== "https:") {
    throw new GuardError("blocked_host", "这个地址不允许由服务器访问");
  }
  if (BLOCKED_NAMES.has(host)) {
    throw new GuardError("blocked_host", "这个地址不允许由服务器访问");
  }
  const v4 = parseIPv4(host);
  if (v4 && isBlockedIPv4(v4)) {
    throw new GuardError("blocked_host", "这个地址不允许由服务器访问");
  }
  const v6 = v4 ? null : expandIPv6(host);
  if (host.includes(":") && (!v6 || isBlockedIPv6(v6))) {
    throw new GuardError("blocked_host", "这个地址不允许由服务器访问");
  }
  return url.toString().replace(/\/+$/, "");
}

/** 去掉形如密钥的片段：sk- 开头、key=、api_key，以及本次请求的密钥原文。 */
export function redactSecrets(text: string, ...secrets: (string | undefined)[]): string {
  let out = text;
  for (const s of secrets) {
    if (s && s.length >= 4) out = out.split(s).join("[已隐藏]");
  }
  return out
    .replace(/sk-[A-Za-z0-9_\-.]+/g, "[已隐藏]")
    .replace(/\b(api[_-]?key|x-api-key|key|token|access_token)(["']?\s*[:=]\s*["']?)[^\s"'&,;}]+/gi, "$1$2[已隐藏]")
    .replace(/\b(Bearer)\s+[A-Za-z0-9_\-.=]+/g, "$1 [已隐藏]")
    .replace(/AIza[0-9A-Za-z_\-]{20,}/g, "[已隐藏]");
}
