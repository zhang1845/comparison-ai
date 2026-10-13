"use client";

import { useId, useState } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { KIND_LABELS, PRESETS, PRESET_GROUPS, applyPreset, defaultDisplayName, getPreset } from "@/lib/presets";
import type { ProviderKind, SlotConfig, SlotId } from "@/lib/types";
import { LIMITS } from "@/lib/types";
import { SlotDot } from "./column";
import { useWorkspace } from "./provider";

function Field({ label, htmlFor, children, hint }: { label: string; htmlFor?: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function maskKey(key: string): string {
  return `${"•".repeat(Math.min(12, Math.max(4, key.length - 4)))}${key.slice(-4)}`;
}

function KeyField({ slotId }: { slotId: SlotId }) {
  const { state, setSecret } = useWorkspace();
  const saved = state.secrets.keys[slotId] ?? "";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const id = useId();
  return (
    <Field label="密钥" htmlFor={id} hint={saved ? "已保存。聚焦后输入新密钥将整段替换。" : undefined}>
      <Input
        id={id}
        type="password"
        autoComplete="off"
        spellCheck={false}
        placeholder={saved ? "" : "粘贴密钥"}
        value={editing ? draft : saved ? maskKey(saved) : ""}
        className="font-mono"
        onFocus={() => {
          setEditing(true);
          setDraft("");
        }}
        onBlur={() => setEditing(false)}
        onChange={(e) => {
          const v = e.target.value.trim();
          setDraft(e.target.value);
          if (v) setSecret(slotId, v);
        }}
      />
    </Field>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step,
  integer,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  integer?: boolean;
  onCommit: (v: number) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const normalize = (raw: string) => {
    const n = Number(raw);
    if (raw.trim() === "" || !Number.isFinite(n)) return value;
    const clamped = Math.min(max, Math.max(min, n));
    return integer ? Math.round(clamped) : Math.round(clamped * 10) / 10;
  };
  return (
    <Field label={label} htmlFor={id}>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        value={draft ?? String(value)}
        className="font-mono"
        onChange={(e) => {
          setDraft(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value !== "" && Number.isFinite(n) && n >= min && n <= max && (!integer || Number.isInteger(n))) {
            onCommit(integer ? n : Math.round(n * 10) / 10);
          }
        }}
        onBlur={(e) => {
          onCommit(normalize(e.target.value));
          setDraft(null);
        }}
      />
    </Field>
  );
}

function SlotForm({ slot }: { slot: SlotConfig }) {
  const { updateSlot, testConnection, fetchModels } = useWorkspace();
  const [probe, setProbe] = useState<{ state: "idle" | "running" | "ok" | "fail"; message?: string }>({ state: "idle" });
  const [models, setModels] = useState<{ state: "idle" | "running" | "fail"; ids: string[]; message?: string }>({
    state: "idle",
    ids: [],
  });
  const ids = { name: useId(), url: useId(), model: useId(), list: useId(), prompt: useId() };
  const preset = getPreset(slot.presetId);
  const isCustom = slot.presetId === "custom";

  const runProbe = async () => {
    setProbe({ state: "running" });
    const r = await testConnection(slot.id);
    setProbe(r.ok ? { state: "ok" } : { state: "fail", message: r.message });
  };

  const pullModels = async () => {
    setModels((m) => ({ ...m, state: "running" }));
    const r = await fetchModels(slot.id);
    setModels(r.ok ? { state: "idle", ids: r.ids } : { state: "fail", ids: [], message: r.message });
  };

  return (
    <div className="space-y-4">
      <Field label="显示名" htmlFor={ids.name}>
        <Input
          id={ids.name}
          value={slot.displayName}
          maxLength={LIMITS.displayName}
          onChange={(e) => updateSlot(slot.id, { displayName: e.target.value })}
          onBlur={(e) => {
            if (e.target.value.trim() === "") updateSlot(slot.id, { displayName: defaultDisplayName(slot.id) });
            else if (e.target.value !== e.target.value.trim()) updateSlot(slot.id, { displayName: e.target.value.trim() });
          }}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="预设">
          <Select value={slot.presetId} onValueChange={(v) => updateSlot(slot.id, (s) => applyPreset(s, v))}>
            <SelectTrigger className="w-full bg-white" aria-label="预设">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRESET_GROUPS.map((g) => (
                <SelectGroup key={g}>
                  <SelectLabel>{g}</SelectLabel>
                  {PRESETS.filter((p) => p.group === g).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="协议">
          <Select
            value={slot.kind}
            disabled={!isCustom}
            onValueChange={(v) => updateSlot(slot.id, { kind: v as ProviderKind })}
          >
            <SelectTrigger className="w-full bg-white" aria-label="协议">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(KIND_LABELS) as ProviderKind[]).map((k) => (
                <SelectItem key={k} value={k}>
                  {KIND_LABELS[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <Field
        label="接口地址"
        htmlFor={ids.url}
        hint={slot.kind === "openai" ? "请求发往 {接口地址}/chat/completions，需带上厂商要求的版本前缀。" : undefined}
      >
        <Input
          id={ids.url}
          value={slot.baseUrl}
          spellCheck={false}
          placeholder="https://"
          className="font-mono text-xs"
          onChange={(e) => updateSlot(slot.id, { baseUrl: e.target.value })}
          onBlur={(e) => {
            const clean = e.target.value.trim().replace(/\/+$/, "");
            if (clean !== slot.baseUrl) updateSlot(slot.id, { baseUrl: clean });
          }}
        />
      </Field>

      <Field label="模型 ID" htmlFor={ids.model}>
        <div className="flex gap-2">
          <Input
            id={ids.model}
            list={ids.list}
            value={slot.model}
            maxLength={LIMITS.model}
            spellCheck={false}
            placeholder={preset?.modelPlaceholder ?? "填写模型 ID"}
            className="min-w-0 flex-1 font-mono text-xs"
            onChange={(e) => updateSlot(slot.id, { model: e.target.value })}
          />
          {slot.kind === "openai" && (
            <Button variant="outline" size="sm" className="h-9" disabled={models.state === "running"} onClick={pullModels}>
              {models.state === "running" ? "拉取中" : "拉取模型列表"}
            </Button>
          )}
        </div>
        <datalist id={ids.list}>
          {models.ids.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
        {models.state === "fail" && (
          <p className="text-xs text-destructive">{models.message}。仍可手动填写模型 ID。</p>
        )}
        {models.ids.length > 0 && <p className="text-xs text-muted-foreground">已拉取 {models.ids.length} 个模型，可在输入框中选择。</p>}
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <NumberField
          label="温度（0–2）"
          value={slot.temperature}
          min={LIMITS.temperatureMin}
          max={LIMITS.temperatureMax}
          step={0.1}
          onCommit={(v) => updateSlot(slot.id, { temperature: v })}
        />
        <NumberField
          label="最大输出（256–8192）"
          value={slot.maxTokens}
          min={LIMITS.maxTokensMin}
          max={LIMITS.maxTokensMax}
          step={1}
          integer
          onCommit={(v) => updateSlot(slot.id, { maxTokens: v })}
        />
      </div>

      <Field label="席位补充要求" htmlFor={ids.prompt}>
        <Textarea
          id={ids.prompt}
          value={slot.systemPrompt}
          maxLength={LIMITS.prompt}
          placeholder="只对这个席位生效的补充要求"
          className="min-h-16 bg-white text-sm"
          onChange={(e) => updateSlot(slot.id, { systemPrompt: e.target.value })}
        />
      </Field>

      <KeyField slotId={slot.id} />

      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" disabled={probe.state === "running"} onClick={runProbe}>
          {probe.state === "running" ? "测试中" : "测试连接"}
        </Button>
        <p aria-live="polite" className="min-w-0 flex-1 text-xs break-words">
          {probe.state === "ok" && <span className="text-[#2f6f5e]">已连通</span>}
          {probe.state === "fail" && <span className="text-destructive">{probe.message}</span>}
        </p>
      </div>
    </div>
  );
}

export function SettingsSheet({
  open,
  onOpenChange,
  expanded,
  onExpandedChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  expanded: string;
  onExpandedChange: (v: string) => void;
}) {
  const { state, updateSettings, updateSlot, clearSecrets } = useWorkspace();
  const [confirmClear, setConfirmClear] = useState(false);
  const globalId = useId();
  const hasKeys = Object.keys(state.secrets.keys).length > 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-[420px]">
        <SheetHeader className="border-b px-5 py-4">
          <SheetTitle>席位设置</SheetTitle>
          <SheetDescription className="space-y-1 text-xs leading-relaxed">
            <span className="block">密钥只保存在这台浏览器。</span>
            <span className="block">请求直接发往你填写的厂商，费用记在对应账号上。</span>
            <span className="block">清除浏览器的站点数据会删掉全部设置、密钥和对话。</span>
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-5 px-5 py-4">
            <Field label="全局补充要求" htmlFor={globalId}>
              <Textarea
                id={globalId}
                value={state.settings.globalSystemPrompt}
                maxLength={LIMITS.prompt}
                placeholder="对所有席位生效的补充要求，例如：用中文回答，先给结论。"
                className="min-h-20 bg-white text-sm"
                onChange={(e) => updateSettings((s) => ({ ...s, globalSystemPrompt: e.target.value }))}
              />
            </Field>

            <Accordion type="single" collapsible value={expanded} onValueChange={onExpandedChange} className="rounded-lg border bg-white">
              {state.settings.slots.map((slot) => (
                <AccordionItem key={slot.id} value={slot.id} className="px-3">
                  <div className="flex items-center gap-2">
                    <AccordionTrigger className="min-w-0 items-center py-3 hover:no-underline">
                      <span className="flex min-w-0 items-center gap-2">
                        <SlotDot slotId={slot.id} />
                        <span className="shrink-0 text-sm font-medium">{slot.displayName}</span>
                        <span className="min-w-0 truncate font-mono text-xs font-normal text-muted-foreground">
                          {slot.model || "未填写模型"}
                        </span>
                      </span>
                    </AccordionTrigger>
                    <Switch
                      checked={slot.enabled}
                      aria-label={`启用${slot.displayName}`}
                      onCheckedChange={(v) => updateSlot(slot.id, { enabled: v })}
                    />
                  </div>
                  <AccordionContent className="pt-1 pb-4">
                    <SlotForm slot={slot} />
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>

            <Separator />

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  {state.settings.demo ? "正在使用演示回答，不会访问网络。" : "没有密钥时，可以先用演示回答看界面。"}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => updateSettings((s) => ({ ...s, demo: !s.demo }))}
                >
                  {state.settings.demo ? "关闭演示" : "使用演示回答"}
                </Button>
              </div>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">只删除密钥，不删除对话。</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive"
                  disabled={!hasKeys}
                  onClick={() => setConfirmClear(true)}
                >
                  清除全部密钥
                </Button>
              </div>
            </div>
          </div>
        </ScrollArea>
      </SheetContent>

      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>清除全部密钥？</AlertDialogTitle>
            <AlertDialogDescription>五个席位的密钥都会从这台浏览器删除，对话记录保留。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={clearSecrets}>
              清除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}
