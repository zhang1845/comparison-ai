export type ProviderKind = "openai" | "anthropic" | "gemini";
export type ChatMode = "parallel" | "roundtable";
export type WorkspaceView = "columns" | "timeline";
export type TurnStatus = "pending" | "streaming" | "done" | "error" | "aborted";
export type SlotId = "slot-1" | "slot-2" | "slot-3" | "slot-4" | "slot-5";

export interface ChatMessageInput {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface SlotConfig {
  id: SlotId;
  enabled: boolean;
  displayName: string;
  presetId: string;
  kind: ProviderKind;
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
}

export interface Settings {
  version: 1;
  mode: ChatMode;
  view: WorkspaceView;
  globalSystemPrompt: string;
  demo: boolean;
  slots: SlotConfig[]; // 长度必须为 5，且 id 顺序固定
}

export interface SecretMap {
  version: 1;
  keys: Partial<Record<SlotId, string>>;
}

export interface Usage {
  inputTokens?: number;
  outputTokens?: number;
}

export interface SlotTurn {
  id: string;
  slotId: SlotId;
  pass: number;
  status: TurnStatus;
  content: string;
  errorCode?: string;
  errorMessage?: string;
  startedAt?: number;
  firstTokenAt?: number;
  finishedAt?: number;
  usage?: Usage;
  displayName: string;
  model: string;
  kind: ProviderKind;
  temperature: number;
  maxTokens: number;
}

export interface Round {
  id: string;
  createdAt: number;
  mode: ChatMode;
  userText: string;
  turns: SlotTurn[];
  winnerSlotId?: SlotId;
}

export interface Session {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  rounds: Round[];
}

export interface ChatProxyRequest {
  kind: ProviderKind;
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
  messages: ChatMessageInput[];
}

export const SLOT_IDS: readonly SlotId[] = ["slot-1", "slot-2", "slot-3", "slot-4", "slot-5"];

export const LIMITS = {
  displayName: 20,
  prompt: 8000,
  model: 128,
  input: 32000,
  rounds: 200,
  maxPass: 2,
  temperatureMin: 0,
  temperatureMax: 2,
  maxTokensMin: 256,
  maxTokensMax: 8192,
  probeMaxTokens: 16,
} as const;
