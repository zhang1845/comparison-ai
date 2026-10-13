import { defaultDisplayName, defaultSettings, getPreset } from "./presets";
import type { ChatMode, ProviderKind, SecretMap, Session, Settings, SlotConfig, SlotId, WorkspaceView } from "./types";
import { LIMITS, SLOT_IDS } from "./types";

export const SETTINGS_KEY = "wuxi.settings.v1";
export const SECRETS_KEY = "wuxi.secrets.v1";
export const LAST_SESSION_KEY = "wuxi.lastSessionId";

const DB_NAME = "wuxi";
const DB_VERSION = 1;
const STORE = "sessions";

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function str(v: unknown, fallback: string, max: number): string {
  return typeof v === "string" ? v.slice(0, max) : fallback;
}

function clampNumber(v: unknown, min: number, max: number, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
}

/** 只挑已知字段，保证设置对象里不会混进密钥。 */
function sanitizeSlot(raw: unknown, fallback: SlotConfig): SlotConfig {
  if (!raw || typeof raw !== "object") return fallback;
  const r = raw as Record<string, unknown>;
  const kinds: ProviderKind[] = ["openai", "anthropic", "gemini"];
  const presetId = typeof r.presetId === "string" && getPreset(r.presetId) ? r.presetId : fallback.presetId;
  const displayName = str(r.displayName, fallback.displayName, LIMITS.displayName).trim();
  return {
    id: fallback.id,
    enabled: typeof r.enabled === "boolean" ? r.enabled : fallback.enabled,
    displayName: displayName || defaultDisplayName(fallback.id),
    presetId,
    kind: kinds.includes(r.kind as ProviderKind) ? (r.kind as ProviderKind) : fallback.kind,
    baseUrl: str(r.baseUrl, fallback.baseUrl, 2048),
    model: str(r.model, fallback.model, LIMITS.model),
    temperature: Math.round(clampNumber(r.temperature, 0, 2, fallback.temperature) * 10) / 10,
    maxTokens: Math.round(clampNumber(r.maxTokens, LIMITS.maxTokensMin, LIMITS.maxTokensMax, fallback.maxTokens)),
    systemPrompt: str(r.systemPrompt, fallback.systemPrompt, LIMITS.prompt),
  };
}

export function loadSettings(): Settings {
  const d = defaultSettings();
  const raw = readJson(SETTINGS_KEY) as Record<string, unknown> | null;
  if (!raw) return d;
  if (raw.version !== 1) {
    try {
      localStorage.removeItem(SETTINGS_KEY);
    } catch {}
    return d;
  }
  const slots = Array.isArray(raw.slots) ? raw.slots : [];
  return {
    version: 1,
    mode: raw.mode === "roundtable" || raw.mode === "parallel" ? (raw.mode as ChatMode) : d.mode,
    view: raw.view === "timeline" || raw.view === "columns" ? (raw.view as WorkspaceView) : d.view,
    globalSystemPrompt: str(raw.globalSystemPrompt, "", LIMITS.prompt),
    demo: raw.demo === true,
    slots: SLOT_IDS.map((id, i) =>
      sanitizeSlot(
        slots.find((s: unknown) => (s as { id?: unknown } | null)?.id === id),
        d.slots[i],
      ),
    ),
  };
}

export function saveSettings(settings: Settings): boolean {
  const clean: Settings = {
    version: 1,
    mode: settings.mode,
    view: settings.view,
    globalSystemPrompt: settings.globalSystemPrompt,
    demo: settings.demo,
    slots: settings.slots.map((s) => sanitizeSlot(s, s)),
  };
  return writeJson(SETTINGS_KEY, clean);
}

export function emptySecrets(): SecretMap {
  return { version: 1, keys: {} };
}

export function loadSecrets(): SecretMap {
  const raw = readJson(SECRETS_KEY) as Record<string, unknown> | null;
  if (!raw) return emptySecrets();
  if (raw.version !== 1 || !raw.keys || typeof raw.keys !== "object") {
    try {
      localStorage.removeItem(SECRETS_KEY);
    } catch {}
    return emptySecrets();
  }
  const keys: Partial<Record<SlotId, string>> = {};
  for (const id of SLOT_IDS) {
    const v = (raw.keys as Record<string, unknown>)[id];
    if (typeof v === "string" && v !== "") keys[id] = v;
  }
  return { version: 1, keys };
}

export function saveSecrets(secrets: SecretMap): boolean {
  return writeJson(SECRETS_KEY, secrets);
}

export function loadLastSessionId(): string | null {
  try {
    return localStorage.getItem(LAST_SESSION_KEY);
  } catch {
    return null;
  }
}

export function saveLastSessionId(id: string | null): void {
  try {
    if (id) localStorage.setItem(LAST_SESSION_KEY, id);
    else localStorage.removeItem(LAST_SESSION_KEY);
  } catch {}
}

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB 不可用"));
      return;
    }
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (e) {
      reject(e);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB 打不开"));
    req.onblocked = () => reject(new Error("IndexedDB 被占用"));
  });
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return openDb().then(
    (db) =>
      new Promise<T | undefined>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        t.oncomplete = () => resolve(req ? req.result : undefined);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }),
  );
}

export async function listSessions(): Promise<Session[]> {
  const all = ((await tx<Session[]>("readonly", (s) => s.getAll())) ?? []) as Session[];
  return all.filter((s) => s && typeof s.id === "string" && Array.isArray(s.rounds)).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function putSession(session: Session): Promise<void> {
  await tx("readwrite", (s) => s.put(session));
}

export async function deleteSession(id: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(id));
}
