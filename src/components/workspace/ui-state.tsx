"use client";

import { createContext, useContext, useSyncExternalStore } from "react";
import type { Round, Session, SlotId, SlotTurn } from "@/lib/types";

export interface WorkspaceUi {
  openSettings: (slotId?: SlotId) => void;
}

export const WorkspaceUiContext = createContext<WorkspaceUi>({ openSettings: () => {} });

export function useWorkspaceUi(): WorkspaceUi {
  return useContext(WorkspaceUiContext);
}

export type Layout = "wide" | "medium" | "narrow";

function subscribe(cb: () => void) {
  const queries = [window.matchMedia("(min-width: 1200px)"), window.matchMedia("(min-width: 800px)")];
  queries.forEach((q) => q.addEventListener("change", cb));
  return () => queries.forEach((q) => q.removeEventListener("change", cb));
}

function snapshot(): Layout {
  if (window.matchMedia("(min-width: 1200px)").matches) return "wide";
  if (window.matchMedia("(min-width: 800px)").matches) return "medium";
  return "narrow";
}

export function useLayout(): Layout {
  return useSyncExternalStore(subscribe, snapshot, () => "wide");
}

/** 该席在该轮按 pass 排序的发言。 */
export function turnsOf(round: Round, slotId: SlotId): SlotTurn[] {
  return round.turns.filter((t) => t.slotId === slotId).sort((a, b) => a.pass - b.pass);
}

export function latestTurn(round: Round | undefined, slotId: SlotId): SlotTurn | undefined {
  if (!round) return undefined;
  return turnsOf(round, slotId).at(-1);
}

export function lastContentOf(session: Session | undefined, slotId: SlotId): string {
  if (!session) return "";
  for (let i = session.rounds.length - 1; i >= 0; i--) {
    const own = turnsOf(session.rounds[i], slotId).filter((t) => t.content.trim() !== "");
    if (own.length > 0) return own[own.length - 1].content;
  }
  return "";
}

export const STATUS_LABEL: Partial<Record<SlotTurn["status"], string>> = {
  pending: "等待",
  streaming: "正在回答",
  error: "失败",
  aborted: "已停止",
};
