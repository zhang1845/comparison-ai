"use client";

import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  CopyIcon,
  HeartIcon,
  HeartOffIcon,
  MoreHorizontalIcon,
  PencilIcon,
  RefreshCwIcon,
  SquareIcon,
} from "lucide-react";
import { memo, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { isActive } from "@/lib/context";
import { turnErrorText, turnMetrics, firstTokenMs, totalMs } from "@/lib/format";
import { SLOT_COLORS, slotNumber } from "@/lib/presets";
import type { Round, SlotConfig, SlotId, SlotTurn } from "@/lib/types";
import { LIMITS } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Markdown } from "./markdown";
import { HeaderModelPicker } from "./model-picker";
import { useWorkspace } from "./provider";
import { lastContentOf, latestTurn, turnsOf, useWorkspaceUi } from "./ui-state";

export function SlotDot({ slotId, className }: { slotId: SlotId; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2 shrink-0 rounded-full", className)}
      style={{ backgroundColor: SLOT_COLORS[slotId] }}
    />
  );
}

/** 列头：色点、当前模型、刷新 / 复制 / 菜单。 */
export function ColumnHeader({ slot, className }: { slot: SlotConfig; className?: string }) {
  const { current, stopSlot, regenerate, updateSlot } = useWorkspace();
  const { openSettings } = useWorkspaceUi();
  const lastRound = current?.rounds.at(-1);
  const latest = latestTurn(lastRound, slot.id);
  const active = !!latest && isActive(latest);
  const canRegen = !!latest && !active;
  const title = `模型${slotNumber(slot.id)}`;

  const copyLast = async () => {
    const text = lastContentOf(current, slot.id);
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {}
  };

  return (
    <div className={cn("bg-white px-3 py-1.5", className)}>
      <div className="flex min-w-0 items-center gap-1.5">
        <SlotDot slotId={slot.id} />
        <HeaderModelPicker slot={slot} />
        <div className="ml-auto flex shrink-0 items-center">
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={active ? "停止此席" : "重新生成"}
            disabled={!active && !canRegen}
            onClick={() => (active ? stopSlot(slot.id) : regenerate(slot.id))}
          >
            {active ? <SquareIcon /> : <RefreshCwIcon />}
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="复制此席最后一条"
            disabled={!lastContentOf(current, slot.id)}
            onClick={copyLast}
          >
            <CopyIcon />
          </Button>
          <Button variant="ghost" size="xs" className="text-muted-foreground" onClick={() => openSettings(slot.id)}>
            编辑
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-xs" aria-label={`${title} 菜单`}>
                <MoreHorizontalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => updateSlot(slot.id, { enabled: !slot.enabled })}>
                {slot.enabled ? "停用此席" : "启用此席"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}

/** 用户消息：每列显示同一份，任意一列里编辑效果相同。 */
export function UserBubble({
  round,
  roundIndex,
  compact,
}: {
  round: Round;
  roundIndex: number;
  compact?: boolean;
}) {
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
    <div className={cn("group/user flex gap-1", compact ? "items-start" : "justify-end")}>
      {!compact && (
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
      )}
      {compact ? (
        <p className="min-w-0 flex-1 text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap break-words">
          {round.userText}
        </p>
      ) : (
        <div className="max-w-[92%] rounded-lg bg-[#f1ede6] px-3 py-2 text-sm whitespace-pre-wrap break-words">
          {round.userText}
        </div>
      )}
      {compact && (
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="编辑这条消息"
          className="opacity-0 transition-opacity group-hover/user:opacity-100 focus-visible:opacity-100"
          onClick={() => {
            setDraft(round.userText);
            setEditing(true);
          }}
        >
          <PencilIcon />
        </Button>
      )}
    </div>
  );
}

/** 助手气泡。流式中纯文本，结束后 Markdown。 */
export const TurnBubble = memo(function TurnBubble({
  turn,
  retryable,
  showPass,
  hideMetrics,
}: {
  turn: SlotTurn;
  retryable: boolean;
  showPass: boolean;
  hideMetrics?: boolean;
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
      {turn.status === "done" && metrics && !hideMetrics && (
        <p className="font-mono text-xs text-muted-foreground">{metrics}</p>
      )}
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

function VotePill({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      aria-pressed={active}
      className={cn(
        "h-9 min-w-[5.5rem] rounded-lg border-[#ece8e0] bg-[#faf9f6] px-4 text-xs font-normal text-[#3f3a34] shadow-none hover:bg-white",
        active && "border-foreground/25 bg-white font-medium",
      )}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

/** 对照投票条：两席时用 A更好 / 都好 / 都不好 / B更好。 */
export function CompareVoteBar() {
  const { current, state, busy, toggleWinner } = useWorkspace();
  const round = current?.rounds.at(-1);
  if (!round || busy) return null;
  const slots = state.settings.slots.filter((s) => s.enabled);
  const ready = slots.filter((s) => latestTurn(round, s.id)?.status === "done");
  if (ready.length < 2) return null;

  const bothNeither = (
    <>
      <VotePill active={round.vote === "both"} onClick={() => toggleWinner(round.id, "both")}>
        <HeartIcon className="size-3" />
        都好
      </VotePill>
      <VotePill active={round.vote === "neither"} onClick={() => toggleWinner(round.id, "neither")}>
        <HeartOffIcon className="size-3" />
        都不好
      </VotePill>
    </>
  );

  if (slots.length === 2) {
    const [a, b] = slots;
    return (
      <div className="flex flex-wrap justify-center gap-2" aria-label="比较这两则回答">
        <VotePill active={round.winnerSlotId === a.id} onClick={() => toggleWinner(round.id, a.id)}>
          <ArrowLeftIcon className="size-3" />
          A更好
        </VotePill>
        {bothNeither}
        <VotePill active={round.winnerSlotId === b.id} onClick={() => toggleWinner(round.id, b.id)}>
          B更好
          <ArrowRightIcon className="size-3" />
        </VotePill>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap justify-center gap-2" aria-label="选出更好的回答">
      {slots.map((s, i) => (
        <VotePill
          key={s.id}
          active={round.winnerSlotId === s.id}
          onClick={() => toggleWinner(round.id, s.id)}
        >
          {String.fromCharCode(65 + i)}更好
        </VotePill>
      ))}
      {bothNeither}
    </div>
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

/** 单列卡片：列头 + 该席的全部轮次。 */
export function SlotColumn({
  slot,
  className,
  hideVote,
  canvas,
}: {
  slot: SlotConfig;
  className?: string;
  hideVote?: boolean;
  canvas?: boolean;
}) {
  const { current } = useWorkspace();
  const rounds = current?.rounds ?? [];
  return (
    <section
      aria-label={`模型${slotNumber(slot.id)}`}
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-2xl border border-[#e8e4dc] bg-white shadow-[0_8px_24px_rgba(28,25,21,0.04)]",
        className,
      )}
    >
      <ColumnHeader slot={slot} />
      <div
        className={cn(
          "m-2 mt-0 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-[#f4f2ee]",
          !slot.enabled && "opacity-60",
        )}
      >
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
          {rounds.length === 0 && <SlotEmpty slot={slot} />}
          {rounds.map((round, i) => (
            <div key={round.id} className="space-y-2 border-b border-dashed border-[#e4dfd6] pb-3 last:border-b-0">
              {canvas ? (
                <>
                  <UserBubble round={round} roundIndex={i} compact />
                  {turnsOf(round, slot.id).length === 0 ? (
                    <p className="text-xs text-muted-foreground">本轮未参与</p>
                  ) : (
                    turnsOf(round, slot.id).map((t, ti) => (
                      <TurnBubble
                        key={t.id}
                        turn={t}
                        hideMetrics
                        showPass={round.mode === "roundtable" && t.pass > 0}
                        retryable={i === rounds.length - 1 && ti === turnsOf(round, slot.id).length - 1 && !isActive(t)}
                      />
                    ))
                  )}
                </>
              ) : (
                <SlotCell slot={slot} round={round} roundIndex={i} isLastRound={i === rounds.length - 1} />
              )}
              {!canvas && (
                <div className="flex items-center justify-between gap-2">
                  <RoundTiming round={round} slotId={slot.id} />
                  {!hideVote && <VoteButton round={round} slotId={slot.id} />}
                </div>
              )}
            </div>
          ))}
        </div>
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

/** 宽屏与中屏：独立对照卡片并排，版式贴近两卡对照页。 */
export function ColumnsGrid() {
  const { state } = useWorkspace();
  const slots = state.settings.slots.filter((s) => s.enabled);
  const pair = slots.length <= 2;
  if (slots.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-sm text-muted-foreground">
        至少启用一个席位才能对照。
      </div>
    );
  }

  return (
    <div className="flex h-full items-stretch justify-center overflow-x-auto overflow-y-hidden px-5 py-4">
      <div className={cn("flex h-full w-full gap-4", pair ? "max-w-[1100px] justify-center" : "")}>
        {slots.map((slot) => (
          <SlotColumn
            key={slot.id}
            slot={slot}
            hideVote
            canvas
            className={cn("min-w-[220px] flex-1", pair && "max-w-[520px]")}
          />
        ))}
      </div>
    </div>
  );
}
