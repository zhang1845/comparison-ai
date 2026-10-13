import { errorTextFor } from "./errors";
import type { ChatMode, Session, SlotTurn } from "./types";
import { SLOT_IDS } from "./types";

export const MODE_LABEL: Record<ChatMode, string> = { parallel: "并行对比", roundtable: "圆桌" };
export const UNTITLED = "未命名对话";

const pad = (n: number) => String(n).padStart(2, "0");

export function formatClock(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatDateTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${formatClock(ts)}`;
}

export function formatStamp(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

export function firstTokenMs(t: SlotTurn): number | undefined {
  return t.startedAt !== undefined && t.firstTokenAt !== undefined ? t.firstTokenAt - t.startedAt : undefined;
}

export function totalMs(t: SlotTurn): number | undefined {
  return t.startedAt !== undefined && t.finishedAt !== undefined ? t.finishedAt - t.startedAt : undefined;
}

/** `1.2s 首字 · 4.8s 完成 · 入 120 · 出 340`，缺失的段省略。 */
export function turnMetrics(t: SlotTurn, opts: { includeUsage?: boolean } = {}): string {
  const parts: string[] = [];
  const ft = firstTokenMs(t);
  const total = totalMs(t);
  if (ft !== undefined) parts.push(`${seconds(ft)} 首字`);
  if (total !== undefined) parts.push(`${seconds(total)} 完成`);
  if (opts.includeUsage !== false && t.usage) {
    if (t.usage.inputTokens !== undefined) parts.push(`入 ${t.usage.inputTokens}`);
    if (t.usage.outputTokens !== undefined) parts.push(`出 ${t.usage.outputTokens}`);
  }
  return parts.join(" · ");
}

export function turnErrorText(t: SlotTurn): string {
  return t.errorMessage || errorTextFor(t.errorCode);
}

export function sessionTitle(session: Session | undefined): string {
  return session?.title || UNTITLED;
}

export function titleFrom(text: string): string {
  return text.trim().slice(0, 24) || UNTITLED;
}

/** 附录 D 的导出格式。不含密钥：会话对象本身不存密钥，错误说明已在服务端脱敏。 */
export function sessionToMarkdown(session: Session, now: number): string {
  const lines: string[] = [];
  lines.push(`# ${sessionTitle(session)}`, "");
  lines.push(`- 导出时间：${formatDateTime(now)}`);
  const modes = Array.from(new Set(session.rounds.map((r) => r.mode)));
  if (modes.length > 0) lines.push(`- 模式：${modes.map((m) => MODE_LABEL[m]).join("、")}`);

  session.rounds.forEach((round, i) => {
    lines.push("", `## 第 ${i + 1} 轮 · ${MODE_LABEL[round.mode]}`, "", round.userText);
    const turns = [...round.turns].sort(
      (a, b) => a.pass - b.pass || SLOT_IDS.indexOf(a.slotId) - SLOT_IDS.indexOf(b.slotId),
    );
    for (const t of turns) {
      const passLabel = t.pass > 0 ? ` · 第 ${t.pass + 1} 次发言` : "";
      lines.push("", `### ${t.displayName} · ${t.model}${passLabel}`);
      let meta = "";
      if (t.status === "done") meta = turnMetrics(t);
      else if (t.status === "error") meta = `失败 · ${turnErrorText(t)}`;
      else if (t.status === "aborted") meta = t.content.trim() ? "已停止，以下为未完成输出" : "已停止";
      else meta = "未完成";
      if (meta) lines.push(meta);
      if (t.content.trim()) lines.push("", t.content.trim());
    }
    if (round.winnerSlotId) {
      const w = round.turns.find((t) => t.slotId === round.winnerSlotId);
      if (w) lines.push("", `人工选择：${w.displayName}`);
    }
  });
  return `${lines.join("\n")}\n`;
}

export function exportFileName(session: Session, now: number): string {
  const safe = sessionTitle(session).replace(/[\\/:*?"<>|\r\n]+/g, " ").trim() || UNTITLED;
  return `五席-${safe}-${formatStamp(now)}.md`;
}
