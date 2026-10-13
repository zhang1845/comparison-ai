"use client";

import { ArrowDownIcon, MoreHorizontalIcon, PencilIcon } from "lucide-react";
import { memo, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { isActive } from "@/lib/context";
import { turnErrorText, turnMetrics, firstTokenMs, totalMs } from "@/lib/format";
import { SLOT_COLORS } from "@/lib/presets";
import type { Round, SlotConfig, SlotId, SlotTurn } from "@/lib/types";
import { LIMITS } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Markdown } from "./markdown";
import { useWorkspace } from "./provider";
import { STATUS_LABEL, lastContentOf, latestTurn, turnsOf, useWorkspaceUi } from "./ui-state";

export function SlotDot({ slotId, className }: { slotId: SlotId; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2 shrink-0 rounded-full", className)}
      style={{ backgroundColor: SLOT_COLORS[slotId] }}
    />
  );
}

/** 列头：色点、显示名、模型 ID、状态、菜单。 */
export function ColumnHeader({ slot, className }: { slot: SlotConfig; className?: string }) {
  const { current, stopSlot, regenerate, updateSlot } = useWorkspace();
  const lastRound = current?.rounds.at(-1);
  const latest = latestTurn(lastRound, slot.id);
  const active = !!latest && isActive(latest);
  const status = !slot.enabled ? "已停用" : latest ? STATUS_LABEL[latest.status] : undefined;
  const canRegen = !!latest && !active;

  const copyLast = async () => {
    const text = lastContentOf(current, slot.id);
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {}
  };

  return (
    <div
      className={cn("border-t-[3px] bg-white px-3 py-2", className)}
      style={{ borderTopColor: SLOT_COLORS[slot.id] }}
    >
      <div className="flex min-w-0 items-center gap-2">
        <SlotDot slotId={slot.id} />
        <span className="shrink-0 truncate text-sm font-medium">{slot.displayName}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground" title={slot.model}>
          {slot.model || "未填写模型"}
        </span>
        {status && (
          <span
            className={cn(
              "shrink-0 text-xs",
              latest?.status === "error" ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {status}
          </span>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-xs" aria-label={`${slot.displayName} 菜单`}>
              <MoreHorizontalIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {active ? (
              <DropdownMenuItem onSelect={() => stopSlot(slot.id)}>停止此席</DropdownMenuItem>
            ) : (
              <DropdownMenuItem disabled={!canRegen} onSelect={() => regenerate(slot.id)}>
                重新生成
              </DropdownMenuItem>
            )}
            <DropdownMenuItem disabled={!lastContentOf(current, slot.id)} onSelect={copyLast}>
              复制此席最后一条
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => updateSlot(slot.id, { enabled: !slot.enabled })}>
              {slot.enabled ? "停用此席" : "启用此席"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {!slot.enabled && <p className="mt-1 text-xs text-muted-foreground">此席已停用</p>}
    </div>
  );
}

/** 用户消息：每列显示同一份，任意一列里编辑效果相同。 */
export function UserBubble({ round, roundIndex }: { round: Round; roundIndex: number }) {
  const { editRound } = useWorkspace();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(round.userText);

  if (editing) {
    const commit = () => {
      if (editRound(roundIndex, draft)) setEditing(false);
    };
    return (
      <div className="ml-auto w-full space-y-2">
        <Textarea
          value={draft}
          maxLength={LIMITS.input}
          autoFocus
          aria-label="编辑这条消息"
          className="min-h-20 bg-white text-sm"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              e.stopPropagation();
              setEditing(false);
            }
          }}
        />
        <p className="text-xs text-muted-foreground">确认后会删掉这一轮及之后的轮次，并用新文本重新发送。</p>
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            取消
          </Button>
          <Button size="sm" disabled={draft.trim() === ""} onClick={commit}>
            确认并重新发送
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="group/user flex justify-end gap-1">
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="编辑这条消息"
        className="mt-1 opacity-0 transition-opacity group-hover/user:opacity-100 focus-visible:opacity-100"
        onClick={() => {
          setDraft(round.userText);
          setEditing(true);
        }}
      >
        <PencilIcon />
      </Button>
      <div className="max-w-[92%] rounded-lg bg-[#f1ede6] px-3 py-2 text-sm whitespace-pre-wrap break-words">
        {round.userText}
      </div>
    </div>
  );
}

/** 助手气泡。流式中纯文本，结束后 Markdown。 */
export const TurnBubble = memo(function TurnBubble({
  turn,
  retryable,
  showPass,
}: {
  turn: SlotTurn;
  retryable: boolean;
  showPass: boolean;
}) {
  const { regenerate } = useWorkspace();
  const { openSettings } = useWorkspaceUi();
  const hasText = turn.content.trim() !== "";
  const finished = turn.status === "done" || turn.status === "error" || turn.status === "aborted";
  const metrics = turnMetrics(turn);

  return (
    <div className="space-y-1.5">
      {showPass && <p className="text-xs text-muted-foreground">第 {turn.pass + 1} 次发言</p>}
      {turn.status === "pending" && !hasText && <p className="text-sm text-muted-foreground">等待</p>}
      {turn.status === "aborted" && (
        <p className="text-xs text-muted-foreground">{hasText ? "已停止，以下为未完成输出" : "已停止"}</p>
      )}
      {hasText &&
        (finished ? (
          <div className="text-sm">
            <Markdown text={turn.content} />
          </div>
        ) : (
          <div className="text-sm leading-relaxed whitespace-pre-wrap break-words">{turn.content}</div>
        ))}
      {turn.status === "error" && (
        <div className="rounded-md border border-destructive/25 bg-destructive/5 px-2.5 py-2 text-sm">
          <p className="break-words text-destructive">{turnErrorText(turn)}</p>
          <div className="mt-1.5 flex gap-2">
            {retryable && (
              <Button size="xs" variant="outline" onClick={() => regenerate(turn.slotId)}>
                重试
              </Button>
            )}
            {turn.errorCode === "missing_key" && (
              <Button size="xs" variant="outline" onClick={() => openSettings(turn.slotId)}>
                去设置
              </Button>
            )}
          </div>
        </div>
      )}
      {turn.status === "done" && metrics && <p className="font-mono text-xs text-muted-foreground">{metrics}</p>}
    </div>
  );
});

/** 某席在某轮的全部内容：用户消息 + 该席各次发言。 */
export function SlotCell({
  slot,
  round,
  roundIndex,
  isLastRound,
}: {
  slot: SlotConfig;
  round: Round;
  roundIndex: number;
  isLastRound: boolean;
}) {
  const turns = turnsOf(round, slot.id);
  const multi = round.mode === "roundtable" && round.turns.some((t) => t.pass > 0);
  return (
    <div className="space-y-3">
      <UserBubble round={round} roundIndex={roundIndex} />
      {turns.length === 0 ? (
        <p className="text-xs text-muted-foreground">本轮未参与</p>
      ) : (
        turns.map((t, i) => (
          <TurnBubble key={t.id} turn={t} showPass={multi} retryable={isLastRound && i === turns.length - 1 && !isActive(t)} />
        ))
      )}
    </div>
  );
}

export function SlotEmpty({ slot }: { slot: SlotConfig }) {
  const { state } = useWorkspace();
  const { openSettings } = useWorkspaceUi();
  if (!slot.enabled) return <p className="text-sm text-muted-foreground">此席已停用</p>;
  if (!state.settings.demo && !state.secrets.keys[slot.id]) {
    return (
      <div className="space-y-2 text-sm text-muted-foreground">
        <p>尚未配置密钥</p>
        <Button size="sm" variant="outline" onClick={() => openSettings(slot.id)}>
          去设置
        </Button>
      </div>
    );
  }
  return null;
}

export function VoteButton({ round, slotId }: { round: Round; slotId: SlotId }) {
  const { toggleWinner } = useWorkspace();
  const turn = latestTurn(round, slotId);
  const chosen = round.winnerSlotId === slotId;
  if (!turn || (turn.status !== "done" && !chosen)) return null;
  return (
    <Button
      size="xs"
      variant={chosen ? "secondary" : "ghost"}
      aria-pressed={chosen}
      className={cn("text-xs", chosen && "font-medium")}
      onClick={() => toggleWinner(round.id, slotId)}
    >
      {chosen ? `已选${turn.displayName}` : "这条更好"}
    </Button>
  );
}

const sec = (ms: number | undefined) => (ms === undefined ? "—" : `${(ms / 1000).toFixed(1)}s`);

export function RoundTiming({ round, slotId }: { round: Round; slotId: SlotId }) {
  const turn = latestTurn(round, slotId);
  if (!turn) return <span className="text-xs text-muted-foreground">未参与</span>;
  return (
    <span className="font-mono text-xs text-muted-foreground">
      首字 {sec(firstTokenMs(turn))} · 完成 {sec(turn.status === "done" ? totalMs(turn) : undefined)}
    </span>
  );
}

/** 窄屏单列：列头 + 该席的全部轮次。 */
export function SlotColumn({ slot, className }: { slot: SlotConfig; className?: string }) {
  const { current } = useWorkspace();
  const rounds = current?.rounds ?? [];
  return (
    <section
      aria-label={slot.displayName}
      className={cn("flex min-h-0 flex-col overflow-hidden rounded-lg border bg-white", className)}
    >
      <ColumnHeader slot={slot} className="border-b" />
      <div className={cn("min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-3", !slot.enabled && "opacity-60")}>
        {rounds.length === 0 && <SlotEmpty slot={slot} />}
        {rounds.map((round, i) => (
          <div key={round.id} className="space-y-2 border-b border-dashed pb-3 last:border-b-0">
            <SlotCell slot={slot} round={round} roundIndex={i} isLastRound={i === rounds.length - 1} />
            <div className="flex items-center justify-between gap-2">
              <RoundTiming round={round} slotId={slot.id} />
              <VoteButton round={round} slotId={slot.id} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/** 滚动容器：内容增长时贴底；用户向上阅读时暂停，给出「回到底部」。 */
export function FollowScroller({
  dep,
  className,
  children,
}: {
  dep: unknown;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const followingRef = useRef(true);
  const [following, setFollowing] = useState(true);

  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    if (atBottom !== followingRef.current) {
      followingRef.current = atBottom;
      setFollowing(atBottom);
    }
  };

  useLayoutEffect(() => {
    const el = ref.current;
    if (el && followingRef.current) el.scrollTop = el.scrollHeight;
  }, [dep]);

  const toBottom = () => {
    const el = ref.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    followingRef.current = true;
    setFollowing(true);
  };

  return (
    <>
      <div ref={ref} onScroll={onScroll} className={className}>
        {children}
      </div>
      {!following && (
        <Button size="sm" variant="outline" className="absolute right-6 bottom-4 z-20 bg-white" onClick={toBottom}>
          <ArrowDownIcon />
          回到底部
        </Button>
      )}
    </>
  );
}

/** 宽屏与中屏的分栏：五列共用一个滚动容器，每轮一行，行尾一条跨五列的细栏。 */
export function ColumnsGrid() {
  const { state, current } = useWorkspace();
  const slots = state.settings.slots;
  const rounds = current?.rounds ?? [];
  const bodyRows = rounds.length === 0 ? 1 : rounds.length * 2;

  return (
    <div className="relative h-full pt-3">
      <FollowScroller
        dep={current}
        className="h-full snap-x snap-mandatory scroll-px-3 overflow-auto px-3 pb-3 min-[1200px]:snap-none"
      >
        <div
          className="grid min-h-full grid-cols-[repeat(5,minmax(280px,1fr))] gap-x-2 min-[1200px]:grid-cols-[repeat(5,minmax(0,1fr))]"
          style={{ gridTemplateRows: `auto repeat(${bodyRows}, auto) 1fr` }}
        >
          {slots.map((slot) => (
            <ColumnHeader key={slot.id} slot={slot} className="sticky top-0 z-10 snap-start rounded-t-lg border" />
          ))}

          {rounds.length === 0 &&
            slots.map((slot) => (
              <div key={slot.id} className="border-x bg-white px-3 py-3">
                <SlotEmpty slot={slot} />
              </div>
            ))}

          {rounds.map((round, i) => (
            <RoundRow key={round.id} round={round} roundIndex={i} isLastRound={i === rounds.length - 1} slots={slots} />
          ))}

          {slots.map((slot) => (
            <div key={slot.id} className="rounded-b-lg border-x border-b bg-white" />
          ))}
        </div>
      </FollowScroller>
    </div>
  );
}

function RoundRow({
  round,
  roundIndex,
  isLastRound,
  slots,
}: {
  round: Round;
  roundIndex: number;
  isLastRound: boolean;
  slots: SlotConfig[];
}) {
  return (
    <>
      {slots.map((slot) => (
        <div key={slot.id} className={cn("border-x bg-white px-3 pt-3 pb-4", !slot.enabled && "opacity-60")}>
          <SlotCell slot={slot} round={round} roundIndex={roundIndex} isLastRound={isLastRound} />
        </div>
      ))}
      <div className="col-span-5 grid grid-cols-subgrid" aria-label={`第 ${roundIndex + 1} 轮对照`}>
        {slots.map((slot) => (
          <div
            key={slot.id}
            className="flex min-h-9 flex-wrap items-center justify-between gap-1 border-x border-y bg-[#faf8f4] px-3 py-1"
          >
            <RoundTiming round={round} slotId={slot.id} />
            <VoteButton round={round} slotId={slot.id} />
          </div>
        ))}
      </div>
    </>
  );
}
