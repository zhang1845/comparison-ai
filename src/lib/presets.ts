import type { ProviderKind, Settings, SlotConfig, SlotId } from "./types";
import { SLOT_IDS } from "./types";

export type PresetGroup = "国际" | "国内" | "本地" | "自定义";

export interface Preset {
  id: string;
  name: string;
  group: PresetGroup;
  /** 自定义预设由用户选协议，为 null */
  kind: ProviderKind | null;
  baseUrl: string;
  suggestedModel: string;
  modelPlaceholder?: string;
}

export const PRESETS: Preset[] = [
  { id: "openai", name: "OpenAI", group: "国际", kind: "openai", baseUrl: "https://api.openai.com/v1", suggestedModel: "gpt-4o" },
  { id: "anthropic", name: "Anthropic", group: "国际", kind: "anthropic", baseUrl: "https://api.anthropic.com", suggestedModel: "claude-sonnet-4-5" },
  { id: "gemini", name: "Gemini", group: "国际", kind: "gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta", suggestedModel: "gemini-2.5-pro" },
  { id: "openrouter", name: "OpenRouter", group: "国际", kind: "openai", baseUrl: "https://openrouter.ai/api/v1", suggestedModel: "" },
  { id: "groq", name: "Groq", group: "国际", kind: "openai", baseUrl: "https://api.groq.com/openai/v1", suggestedModel: "" },
  { id: "deepseek", name: "DeepSeek", group: "国内", kind: "openai", baseUrl: "https://api.deepseek.com/v1", suggestedModel: "deepseek-chat" },
  { id: "qwen", name: "通义千问", group: "国内", kind: "openai", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", suggestedModel: "qwen-plus" },
  { id: "moonshot", name: "Kimi", group: "国内", kind: "openai", baseUrl: "https://api.moonshot.cn/v1", suggestedModel: "moonshot-v1-128k" },
  { id: "zhipu", name: "智谱", group: "国内", kind: "openai", baseUrl: "https://open.bigmodel.cn/api/paas/v4", suggestedModel: "glm-4-flash" },
  { id: "siliconflow", name: "硅基流动", group: "国内", kind: "openai", baseUrl: "https://api.siliconflow.cn/v1", suggestedModel: "" },
  { id: "ark", name: "火山方舟", group: "国内", kind: "openai", baseUrl: "https://ark.cn-beijing.volces.com/api/v3", suggestedModel: "", modelPlaceholder: "接入点 ID" },
  { id: "ollama", name: "Ollama", group: "本地", kind: "openai", baseUrl: "http://127.0.0.1:11434/v1", suggestedModel: "llama3.1" },
  { id: "custom", name: "自定义", group: "自定义", kind: null, baseUrl: "", suggestedModel: "" },
];

export const PRESET_GROUPS: PresetGroup[] = ["国际", "国内", "本地", "自定义"];

export const KIND_LABELS: Record<ProviderKind, string> = {
  openai: "OpenAI 兼容",
  anthropic: "Anthropic",
  gemini: "Gemini",
};

export function getPreset(id: string): Preset | undefined {
  return PRESETS.find((p) => p.id === id);
}

export const SLOT_COLORS: Record<SlotId, string> = {
  "slot-1": "#c4552a",
  "slot-2": "#2f6f5e",
  "slot-3": "#3d5a80",
  "slot-4": "#a15c2f",
  "slot-5": "#6b4c7a",
};

const DEFAULT_SLOT_PRESETS: Record<SlotId, string> = {
  "slot-1": "openai",
  "slot-2": "anthropic",
  "slot-3": "gemini",
  "slot-4": "deepseek",
  "slot-5": "qwen",
};

export function slotNumber(id: SlotId): number {
  return SLOT_IDS.indexOf(id) + 1;
}

export function defaultDisplayName(id: SlotId): string {
  return `席位 ${slotNumber(id)}`;
}

export function defaultSlot(id: SlotId): SlotConfig {
  const preset = getPreset(DEFAULT_SLOT_PRESETS[id])!;
  return {
    id,
    enabled: true,
    displayName: defaultDisplayName(id),
    presetId: preset.id,
    kind: preset.kind ?? "openai",
    baseUrl: preset.baseUrl,
    model: preset.suggestedModel,
    temperature: 0.7,
    maxTokens: 2048,
    systemPrompt: "",
  };
}

export function defaultSettings(): Settings {
  return {
    version: 1,
    mode: "parallel",
    view: "columns",
    globalSystemPrompt: "",
    demo: false,
    slots: SLOT_IDS.map(defaultSlot),
  };
}

/** 切换预设：模型框仍是上一个预设的建议模型（或为空）时才替换。 */
export function applyPreset(slot: SlotConfig, presetId: string): SlotConfig {
  const next = getPreset(presetId);
  if (!next) return slot;
  const prev = getPreset(slot.presetId);
  const untouched = slot.model.trim() === "" || (prev !== undefined && slot.model === prev.suggestedModel);
  return {
    ...slot,
    presetId: next.id,
    kind: next.kind ?? slot.kind,
    baseUrl: next.baseUrl,
    model: untouched ? next.suggestedModel : slot.model,
  };
}
