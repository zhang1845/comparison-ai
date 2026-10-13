import type { ChatMessageInput, ChatProxyRequest, ProviderKind } from "./types";
import { LIMITS } from "./types";

export const MAX_BODY_BYTES = 1_500_000;
const MAX_MESSAGES = 200;
const MAX_CONTENT = 100_000;
const KINDS: ProviderKind[] = ["openai", "anthropic", "gemini"];
const ROLES = ["system", "user", "assistant"];

export type Validation<T> = { ok: true; value: T } | { ok: false; message: string };

function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

export function validateBaseFields(body: Record<string, unknown>): Validation<Omit<ChatProxyRequest, "messages">> {
  const { kind, baseUrl, model, temperature, maxTokens } = body;
  if (typeof kind !== "string" || !KINDS.includes(kind as ProviderKind)) return { ok: false, message: "协议不受支持" };
  if (typeof baseUrl !== "string" || baseUrl.trim() === "" || baseUrl.length > 2048)
    return { ok: false, message: "接口地址无法识别" };
  if (typeof model !== "string" || model.trim() === "") return { ok: false, message: "请填写模型 ID" };
  if (model.trim().length > LIMITS.model) return { ok: false, message: "模型 ID 最长 128 个字符" };
  if (typeof temperature !== "number" || !(temperature >= LIMITS.temperatureMin && temperature <= LIMITS.temperatureMax))
    return { ok: false, message: "温度需在 0 到 2 之间" };
  // 「测试连接」临时使用 16，其余请求必须落在第 8 节范围内
  const tokensOk =
    typeof maxTokens === "number" &&
    Number.isInteger(maxTokens) &&
    (maxTokens === LIMITS.probeMaxTokens || (maxTokens >= LIMITS.maxTokensMin && maxTokens <= LIMITS.maxTokensMax));
  if (!tokensOk) return { ok: false, message: "最大输出需为 256 到 8192 的整数" };
  return {
    ok: true,
    value: {
      kind: kind as ProviderKind,
      baseUrl: baseUrl.trim(),
      model: model.trim(),
      temperature,
      maxTokens: maxTokens as number,
    },
  };
}

export function validateChatRequest(body: unknown): Validation<ChatProxyRequest> {
  if (!isObject(body)) return { ok: false, message: "请求体必须是 JSON 对象" };
  const base = validateBaseFields(body);
  if (!base.ok) return base;
  const { messages } = body;
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > MAX_MESSAGES)
    return { ok: false, message: "消息数量需在 1 到 200 条之间" };
  const clean: ChatMessageInput[] = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (!isObject(m) || typeof m.role !== "string" || !ROLES.includes(m.role))
      return { ok: false, message: "消息角色只能是 system、user、assistant" };
    if (typeof m.content !== "string") return { ok: false, message: "消息内容必须是文本" };
    if (m.content.length > MAX_CONTENT) return { ok: false, message: "单条消息超过 100000 字" };
    if (m.role === "system" && i !== 0) return { ok: false, message: "system 只能是第一条消息" };
    clean.push({ role: m.role as ChatMessageInput["role"], content: m.content });
  }
  if (clean.every((m) => m.role === "system")) return { ok: false, message: "至少需要一条用户消息" };
  return { ok: true, value: { ...base.value, messages: clean } };
}
