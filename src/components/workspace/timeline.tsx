"use client";

import { Button } from "@/components/ui/button";
import { isActive } from "@/lib/context";
import { MODE_LABEL, formatClock } from "@/lib/format";
import { SLOT_COLORS } from "@/lib/presets";
import type { Round, SlotTurn } from "@/lib/types";
import { SLOT_IDS } from "@/lib/types";
import { FollowScroller, RoundTiming, SlotDot, SlotEmpty, TurnBubble, UserBubble, VoteButton } from "./column";
import { useWorkspace } from "./provider";
import { STATUS_LABEL } from "./ui-state";

function TurnCard({ turn, retryable }: { turn: SlotTurn; retryable: boolean }) {
  const { stopSlot } = useWorkspace();
  const status = STATUS_LABEL[turn.status];
  return (
    <article
      className="rounded-lg border border-l-[3px] bg-white px-3 py-2.5"
      style={{ borderLeftColor: SLOT_COLORS[turn.slotId] }}
    >
      <header className="mb-1.5 flex min-w-0 items-center gap-2">
        <SlotDot slotId={turn.slotId} />
        <span className="shrink-0 text-sm font-medium">{turn.displayName}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">{turn.model}</span>
        {status && (
          <span className={turn.status === "error" ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
            {status}
          </span>
        )}
        {isActive(turn) && (
          <Button size="xs" variant="ghost" onClick={() => stopSlot(turn.slotId)}>
            停止此席
          </Button>
        )}
      </header>
      <TurnBubble turn={turn} retryable={retryable} showPass={false} />
    </article>
  );
}

function TimelineRound({ round, index, isLast }: { round: Round; index: number; isLast: boolean }) {
  const passes = Array.from(new Set(round.turns.map((t) => t.pass))).sort((a, b) => a - b);
  const topPassOf = (slotId: SlotTurn["slotId"]) =>
    round.turns.filter((t) => t.slotId === slotId).reduce((m, t) => Math.max(m, t.pass), 0);
  const slotsInRound = SLOT_IDS.filter((id) => round.turns.some((t) => t.slotId === id));

  return (
    <section aria-label={`第 ${index + 1} 轮`} className="space-y-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">第 {index + 1} 轮</span>
        <span>{MODE_LABEL[round.mode]}</span>
        <span className="font-mono">{formatClock(round.createdAt)}</span>
      </div>
      <UserBubble round={round} roundIndex={index} />
      {passes.map((pass) => (
        <div key={pass} className="space-y-2">
          {passes.length > 1 && <p className="text-xs text-muted-foreground">第 {pass + 1} 次发言</p>}
          <div className="grid gap-2">
            {round.turns
              .filter((t) => t.pass === pass)
              .sort((a, b) => SLOT_IDS.indexOf(a.slotId) - SLOT_IDS.indexOf(b.slotId))
              .map((t) => (
                <TurnCard
                  key={t.id}
                  turn={t}
                  retryable={isLast && t.pass === topPassOf(t.slotId) && !isActive(t)}
                />
              ))}
          </div>
        </div>
      ))}
      {slotsInRound.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-lg border bg-[#faf8f4] px-3 py-1.5">
          {slotsInRound.map((id) => (
            <div key={id} className="flex items-center gap-1.5">
              <SlotDot slotId={id} />
              <RoundTiming round={round} slotId={id} />
              <VoteButton round={round} slotId={id} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function Timeline() {
  const { current, state } = useWorkspace();
  const rounds = current?.rounds ?? [];

  return (
    <div className="relative h-full">
      <FollowScroller dep={current} className="h-full overflow-y-auto px-3 py-3">
        <div className="mx-auto max-w-3xl space-y-8 pb-4">
          {rounds.length === 0 && (
            <div className="grid gap-2">
              {state.settings.slots.map((slot) => (
                <div
                  key={slot.id}
                  className="flex items-center gap-3 rounded-lg border border-l-[3px] bg-white px-3 py-2.5"
                  style={{ borderLeftColor: SLOT_COLORS[slot.id] }}
                >
                  <span className="text-sm font-medium">{slot.displayName}</span>
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">{slot.model}</span>
                  <SlotEmpty slot={slot} />
                </div>
              ))}
            </div>
          )}
          {rounds.map((round, i) => (
            <TimelineRound key={round.id} round={round} index={i} isLast={i === rounds.length - 1} />
          ))}
        </div>
      </FollowScroller>
    </div>
  );
}
