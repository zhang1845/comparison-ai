import type { SlotId } from "./types";

export const DEMO_HEADER = "【演示回答】";

function topicOf(userText: string): string {
  const flat = userText.replace(/\s+/g, " ").trim();
  return flat.length > 30 ? `${flat.slice(0, 30)}…` : flat;
}

function keywordsOf(userText: string): string[] {
  const parts = userText
    .split(/[\s，。！？、；：,.!?;:（）()「」“”"'《》\[\]【】]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2);
  const uniq = Array.from(new Set(parts));
  return (uniq.length > 0 ? uniq : [topicOf(userText)]).slice(0, 3);
}

const BODIES: Record<SlotId, (topic: string, kw: string[]) => string> = {
  "slot-1": (topic, kw) =>
    [
      `结论先行，关于「${topic}」：`,
      "",
      `- 先抓住「${kw[0]}」这一点，它决定了大方向。`,
      `- ${kw[1] ? `「${kw[1]}」` : "其余细节"}可以放到第二步再定。`,
      "- 先做一个最小可行的版本，再根据反馈调整。",
      "- 留出复盘时间，别一次定死。",
    ].join("\n"),
  "slot-2": (topic, kw) =>
    [
      `「${topic}」这件事，关键在取舍。`,
      "",
      `如果更看重速度，可以先围绕「${kw[0]}」快速推进，代价是后面要返工。`,
      "如果更看重稳妥，就先把约束条件列清楚，慢一点但少走弯路。",
      "",
      "**我的倾向**：先求快，但给自己设一个明确的回头检查点。",
    ].join("\n"),
  "slot-3": (topic, kw) =>
    [
      `按步骤处理「${topic}」：`,
      "",
      `1. 明确目标：把「${kw[0]}」说成一句可以检验的话。`,
      `2. 收集信息：${kw[1] ? `重点看「${kw[1]}」相关的资料` : "列出你已知和未知的部分"}。`,
      "3. 列出两三个备选方案，各写一句优缺点。",
      "4. 选一个先试，约定一周后回看结果。",
    ].join("\n"),
  "slot-4": (topic, kw) =>
    [
      `先说风险。「${topic}」最容易出问题的地方有三处：`,
      "",
      `- 对「${kw[0]}」的预期过高，投入后落差大。`,
      "- 时间和精力被低估，中途放弃。",
      `- ${kw[1] ? `忽略了「${kw[1]}」带来的连锁影响` : "没有提前想好退出条件"}。`,
      "",
      "把这三点各配一个应对办法，再决定要不要开始。",
    ].join("\n"),
  "slot-5": (topic, kw) =>
    [
      `用一个具体例子说明「${topic}」。`,
      "",
      `假设小李也面对「${kw[0]}」的问题。他先花一个周末做了小范围尝试，`,
      `发现${kw[1] ? `「${kw[1]}」` : "真正的难点"}和他原先想的不一样，于是调整了计划。`,
      "",
      "> 先用很小的代价试一次，比想一个月更能看清问题。",
    ].join("\n"),
};

const FOLLOW_UPS: Record<SlotId, string> = {
  "slot-1": "补充一条：其他席位讲得已经很全，我只强调先定优先级。",
  "slot-2": "我和其他席位的分歧在于节奏：我仍倾向先快后稳。",
  "slot-3": "补一个他们没提到的步骤：做完之后写下复盘记录。",
  "slot-4": "其他席位偏乐观，我再提醒一次：先想好退出条件。",
  "slot-5": "换一个例子：如果小李时间更紧，他会只做第一步。",
};

/** 客户端本地伪造的演示正文。第一行固定为【演示回答】。 */
export function demoText(slotId: SlotId, userText: string, pass: number): string {
  const topic = topicOf(userText) || "这个问题";
  const kw = keywordsOf(userText);
  const body =
    pass > 0 ? `（第 ${pass + 1} 次发言）关于「${topic}」：\n\n${FOLLOW_UPS[slotId]}` : BODIES[slotId](topic, kw);
  return `${DEMO_HEADER}\n\n${body}`;
}

const TICK_MS = 32;
const CHARS_PER_TICK = 2;

/** 以约 16ms 一字的节奏把文本推给 onDelta。中止时立即返回。 */
export async function streamDemo(text: string, onDelta: (chunk: string) => void, signal: AbortSignal): Promise<void> {
  const chars = Array.from(text);
  for (let i = 0; i < chars.length; i += CHARS_PER_TICK) {
    await new Promise<void>((resolve) => {
      const t = setTimeout(resolve, TICK_MS);
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(t);
          resolve();
        },
        { once: true },
      );
    });
    if (signal.aborted) return;
    onDelta(chars.slice(i, i + CHARS_PER_TICK).join(""));
  }
}
