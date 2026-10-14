"use client";

import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import type { SlotConfig } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useWorkspace } from "./provider";
import { useWorkspaceUi } from "./ui-state";

type ModelListState = { state: "idle" | "running" | "fail"; ids: string[]; message?: string };

export function useSlotModelList(slot: SlotConfig) {
  const { state, fetchModels } = useWorkspace();
  const savedKey = state.secrets.keys[slot.id] ?? "";
  const hasKey = savedKey.trim() !== "";
  const keySig = `${savedKey.length}:${savedKey.slice(-4)}`;
  const canPull = slot.kind === "openai";
  const [models, setModels] = useState<ModelListState>({ state: "idle", ids: [] });
  const [filter, setFilter] = useState("");

  const pullModels = async () => {
    if (!canPull) return;
    setModels((m) => ({ ...m, state: "running" }));
    const r = await fetchModels(slot.id);
    setModels(r.ok ? { state: "idle", ids: r.ids } : { state: "fail", ids: [], message: r.message });
  };

  useEffect(() => {
    if (!canPull || !hasKey || slot.baseUrl.trim() === "") {
      setModels({ state: "idle", ids: [] });
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setModels((m) => ({ ...m, state: "running" }));
      const r = await fetchModels(slot.id);
      if (cancelled) return;
      setModels(r.ok ? { state: "idle", ids: r.ids } : { state: "fail", ids: [], message: r.message });
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [canPull, fetchModels, hasKey, keySig, slot.baseUrl, slot.id]);

  const q = filter.trim().toLowerCase();
  const filtered = q ? models.ids.filter((m) => m.toLowerCase().includes(q)) : models.ids;
  return { models, filter, setFilter, filtered, pullModels, hasKey, canPull };
}

function ModelMenuBody({
  slot,
  list,
}: {
  slot: SlotConfig;
  list: ReturnType<typeof useSlotModelList>;
}) {
  const { updateSlot } = useWorkspace();
  const { models, filter, setFilter, filtered } = list;
  const current = slot.model.trim();
  const showFilter = models.ids.length > 5;

  return (
    <>
      {showFilter && (
        <div className="p-1">
          <Input
            value={filter}
            placeholder="筛选模型"
            className="h-8 font-mono text-xs"
            onKeyDown={(e) => e.stopPropagation()}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
      )}
      <div className="max-h-56 overflow-y-auto">
        {models.state === "running" && models.ids.length === 0 && (
          <p className="px-2 py-2 text-xs text-muted-foreground">正在拉取模型…</p>
        )}
        {models.state === "fail" && models.ids.length === 0 && (
          <p className="px-2 py-2 text-xs text-destructive">{models.message}。可去席位设置手写 ID。</p>
        )}
        {models.ids.length > 0 && filtered.length === 0 && (
          <p className="px-2 py-2 text-xs text-muted-foreground">没有匹配的模型。</p>
        )}
        {filtered.map((m) => (
          <DropdownMenuItem key={m} className="font-mono text-xs" onSelect={() => updateSlot(slot.id, { model: m })}>
            <CheckIcon className={cn("size-3", m === current ? "opacity-100" : "opacity-0")} />
            <span className="min-w-0 truncate">{m}</span>
          </DropdownMenuItem>
        ))}
      </div>
    </>
  );
}

/** 列头上的当前模型：点开后从列表里选择。没有密钥则打开席位设置。 */
export function HeaderModelPicker({
  slot,
  variant = "header",
}: {
  slot: SlotConfig;
  variant?: "header" | "chip";
}) {
  const { openSettings } = useWorkspaceUi();
  const list = useSlotModelList(slot);
  const [open, setOpen] = useState(false);
  const label = slot.model.trim() || "选择模型";
  const chip = variant === "chip";

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        if (next && !list.hasKey) {
          openSettings(slot.id);
          return;
        }
        if (next && list.canPull && list.models.ids.length === 0 && list.models.state !== "running") {
          void list.pullModels();
        }
        if (next) list.setFilter("");
        setOpen(next);
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="xs"
          aria-label="选择模型"
          title={list.hasKey ? "点击选择模型" : "先填写密钥再选择模型"}
          className={cn(
            "h-auto min-w-0 justify-start px-1 py-0.5 font-normal hover:text-foreground",
            chip
              ? "max-w-[11rem] rounded-full border border-[#ece8e0] bg-[#faf9f6] px-2.5 py-1 font-mono text-xs text-muted-foreground"
              : "flex-1 px-0 font-mono text-[13px] text-foreground",
          )}
        >
          <span className="min-w-0 truncate">{label}</span>
          <ChevronDownIcon className="size-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <ModelMenuBody slot={slot} list={list} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function SettingsModelPickerButton({
  slot,
  list,
}: {
  slot: SlotConfig;
  list: ReturnType<typeof useSlotModelList>;
}) {
  if (!list.canPull) return null;
  if (list.models.ids.length === 0) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="h-9 shrink-0"
        disabled={!list.hasKey || list.models.state === "running"}
        onClick={() => void list.pullModels()}
      >
        {list.models.state === "running" ? "拉取中" : "拉取模型列表"}
      </Button>
    );
  }
  return (
    <DropdownMenu onOpenChange={(next) => next && list.setFilter("")}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 shrink-0">
          选择模型
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <ModelMenuBody slot={slot} list={list} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function settingsModelHints(list: ReturnType<typeof useSlotModelList>): ReactNode {
  const { canPull, hasKey, models } = list;
  return (
    <>
      {!canPull && <p className="text-xs text-muted-foreground">该协议需手写模型 ID。</p>}
      {canPull && !hasKey && <p className="text-xs text-muted-foreground">填写密钥后可选择模型。</p>}
      {canPull && hasKey && models.state === "running" && (
        <p className="text-xs text-muted-foreground">正在拉取模型…</p>
      )}
      {models.state === "fail" && (
        <p className="text-xs text-destructive">{models.message}。仍可手动填写模型 ID。</p>
      )}
      {models.ids.length > 0 && (
        <p className="text-xs text-muted-foreground">已列出 {models.ids.length} 个模型，可点选或继续手写。</p>
      )}
    </>
  );
}
