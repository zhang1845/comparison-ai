"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { toast } from "sonner";
import { streamFromProxy, fetchModelIds } from "@/lib/client";
import { buildMessages, continuationState, isActive, maxPass } from "@/lib/context";
import { demoText, streamDemo } from "@/lib/demo";
import { errorTextFor } from "@/lib/errors";
import { exportFileName, sessionToMarkdown, titleFrom } from "@/lib/format";
import { defaultSettings, slotNumber } from "@/lib/presets";
import {
  deleteSession as dbDelete,
  emptySecrets,
  listSessions,
  loadLastSessionId,
  loadSecrets,
  loadSettings,
  putSession,
  saveLastSessionId,
  saveSecrets,
  saveSettings,
} from "@/lib/storage";
import type { Round, SecretMap, Session, Settings, SlotConfig, SlotId, SlotTurn, Usage, VoteChoice } from "@/lib/types";
import { LIMITS } from "@/lib/types";

const QUOTA_TEXT = "浏览器存储空间不足，这次修改没有保存。";
export const DB_UNAVAILABLE_TEXT = "这台浏览器存不了对话，发送仍可进行，但刷新后不会留下。";

interface State {
  ready: boolean;
  settings: Settings;
  secrets: SecretMap;
  sessions: Session[];
  currentId: string;
  dbAvailable: boolean;
}

type Action =
  | { type: "init"; settings: Settings; secrets: SecretMap; sessions: Session[]; currentId: string; dbAvailable: boolean }
  | { type: "settings"; settings: Settings }
  | { type: "secrets"; secrets: SecretMap }
  | { type: "upsertSession"; session: Session }
  | { type: "select"; id: string }
  | { type: "removeSession"; id: string }
  | { type: "patchTurn"; sessionId: string; roundId: string; turnId: string; patch: Partial<SlotTurn> }
  | { type: "appendDelta"; sessionId: string; roundId: string; turnId: string; text: string; now: number }
  | { type: "dbUnavailable" };

function mapTurn(state: State, sessionId: string, roundId: string, turnId: string, fn: (t: SlotTurn) => SlotTurn): State {
  let changed = false;
  const sessions = state.sessions.map((s) => {
    if (s.id !== sessionId) return s;
    const rounds = s.rounds.map((r) => {
      if (r.id !== roundId) return r;
      const turns = r.turns.map((t) => {
        if (t.id !== turnId) return t;
        changed = true;
        return fn(t);
      });
      return changed ? { ...r, turns } : r;
    });
    return changed ? { ...s, rounds } : s;
  });
  return changed ? { ...state, sessions } : state;
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "init":
      return {
        ready: true,
        settings: action.settings,
        secrets: action.secrets,
        sessions: action.sessions,
        currentId: action.currentId,
        dbAvailable: action.dbAvailable,
      };
    case "settings":
      return { ...state, settings: action.settings };
    case "secrets":
      return { ...state, secrets: action.secrets };
    case "upsertSession": {
      const exists = state.sessions.some((s) => s.id === action.session.id);
      return {
        ...state,
        sessions: exists
          ? state.sessions.map((s) => (s.id === action.session.id ? action.session : s))
          : [action.session, ...state.sessions],
      };
    }
    case "select":
      return {
        ...state,
        currentId: action.id,
        // 只保留当前这一个空草稿
        sessions: state.sessions.filter((s) => s.rounds.length > 0 || s.id === action.id),
      };
    case "removeSession":
      return { ...state, sessions: state.sessions.filter((s) => s.id !== action.id) };
    case "patchTurn":
      return mapTurn(state, action.sessionId, action.roundId, action.turnId, (t) => ({ ...t, ...action.patch }));
    case "appendDelta":
      return mapTurn(state, action.sessionId, action.roundId, action.turnId, (t) => ({
        ...t,
        status: "streaming",
        content: t.content + action.text,
        firstTokenAt: t.firstTokenAt ?? (action.text.trim() !== "" ? action.now : undefined),
      }));
    case "dbUnavailable":
      return { ...state, dbAvailable: false };
  }
}

function newDraft(): Session {
  const now = Date.now();
  return { id: crypto.randomUUID(), title: "", createdAt: now, updatedAt: now, rounds: [] };
}

function newTurn(slot: SlotConfig, pass: number): SlotTurn {
  return {
    id: crypto.randomUUID(),
    slotId: slot.id,
    pass,
    status: "pending",
    content: "",
    displayName: slot.displayName,
    model: slot.model.trim(),
    kind: slot.kind,
    temperature: slot.temperature,
    maxTokens: slot.maxTokens,
  };
}

/** 上次页面关闭时仍在进行的发言，恢复后标为已停止。 */
function settleInterrupted(s: Session): Session {
  if (!s.rounds.some((r) => r.turns.some(isActive))) return s;
  return {
    ...s,
    rounds: s.rounds.map((r) => ({
      ...r,
      turns: r.turns.map((t) => (isActive(t) ? { ...t, status: "aborted", finishedAt: t.finishedAt ?? Date.now() } : t)),
    })),
  };
}

function canStart(st: State, session: Session | undefined, text: string): session is Session {
  const t = text.trim();
  return (
    !!session &&
    t !== "" &&
    t.length <= LIMITS.input &&
    st.settings.slots.some((s) => s.enabled) &&
    session.rounds.length < LIMITS.rounds
  );
}

const INITIAL: State = {
  ready: false,
  settings: defaultSettings(),
  secrets: emptySecrets(),
  sessions: [],
  currentId: "",
  dbAvailable: true,
};

export type ProbeResult = { ok: true } | { ok: false; message: string };

export interface WorkspaceApi {
  state: State;
  current: Session | undefined;
  busy: boolean;
  announcement: string;
  updateSettings: (fn: (s: Settings) => Settings) => void;
  updateSlot: (id: SlotId, patch: Partial<SlotConfig> | ((s: SlotConfig) => SlotConfig)) => void;
  setSecret: (id: SlotId, key: string) => void;
  clearSecrets: () => void;
  newSession: () => void;
  selectSession: (id: string) => void;
  renameSession: (id: string, title: string) => void;
  removeSession: (id: string) => void;
  send: (text: string) => boolean;
  stopAll: () => void;
  stopSlot: (slotId: SlotId) => void;
  regenerate: (slotId: SlotId) => void;
  continueRound: () => void;
  editRound: (roundIndex: number, text: string) => boolean;
  toggleWinner: (roundId: string, choice: VoteChoice | null) => void;
  exportCurrent: () => void;
  testConnection: (slotId: SlotId) => Promise<ProbeResult>;
  fetchModels: (slotId: SlotId) => Promise<{ ok: true; ids: string[] } | { ok: false; message: string }>;
}

const WorkspaceContext = createContext<WorkspaceApi | null>(null);

export function useWorkspace(): WorkspaceApi {
  const v = useContext(WorkspaceContext);
  if (!v) throw new Error("useWorkspace 必须在 WorkspaceProvider 内使用");
  return v;
}

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, INITIAL);
  // 事件函数需要同步读到最新状态：每次派发时同样推进这份副本
  const live = useRef<State>(INITIAL);
  const controllers = useRef(new Map<string, { ctrl: AbortController; sessionId: string; slotId: SlotId }>());
  const pendingSaves = useRef(new Map<string, () => void>());
  const [announcement, setAnnouncement] = useState("");

  const act = useCallback((a: Action) => {
    live.current = reducer(live.current, a);
    dispatch(a);
  }, []);

  const onDbError = useCallback(() => {
    if (!live.current.dbAvailable) return;
    act({ type: "dbUnavailable" });
    toast.error(DB_UNAVAILABLE_TEXT);
  }, [act]);

  const flushSave = useCallback(
    (id: string) => {
      pendingSaves.current.delete(id);
      if (!live.current.dbAvailable) return;
      const s = live.current.sessions.find((x) => x.id === id);
      if (!s || s.rounds.length === 0) return;
      putSession(s).catch(onDbError);
    },
    [onDbError],
  );

  /** delta 用一帧合并写入；终态与结构变化立即写入。 */
  const scheduleSave = useCallback(
    (id: string, immediate = false) => {
      const pending = pendingSaves.current.get(id);
      if (immediate) {
        pending?.();
        flushSave(id);
        return;
      }
      if (pending) return;
      const handles = { raf: 0, timer: undefined as ReturnType<typeof setTimeout> | undefined };
      const cancel = () => {
        cancelAnimationFrame(handles.raf);
        clearTimeout(handles.timer);
        pendingSaves.current.delete(id);
      };
      const run = () => {
        cancel();
        flushSave(id);
      };
      handles.raf = requestAnimationFrame(run);
      handles.timer = setTimeout(run, 250); // 后台标签页不触发 rAF
      pendingSaves.current.set(id, cancel);
    },
    [flushSave],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const settings = loadSettings();
      const secrets = loadSecrets();
      const lastId = loadLastSessionId();
      let sessions: Session[] = [];
      let dbAvailable = true;
      try {
        sessions = (await listSessions()).map(settleInterrupted);
      } catch {
        dbAvailable = false;
      }
      if (cancelled) return;
      const last = sessions.find((s) => s.id === lastId);
      const current = last ?? newDraft();
      act({
        type: "init",
        settings,
        secrets,
        sessions: last ? sessions : [current, ...sessions],
        currentId: current.id,
        dbAvailable,
      });
      if (!dbAvailable) toast.error(DB_UNAVAILABLE_TEXT);
    })();
    return () => {
      cancelled = true;
    };
  }, [act]);

  const currentSession = useCallback(
    () => live.current.sessions.find((s) => s.id === live.current.currentId),
    [],
  );

  const commitSession = useCallback(
    (session: Session, immediate = true) => {
      act({ type: "upsertSession", session });
      scheduleSave(session.id, immediate);
    },
    [act, scheduleSave],
  );

  const runTurn = useCallback(
    async (sessionId: string, roundId: string, turnId: string) => {
      const st = live.current;
      const session = st.sessions.find((s) => s.id === sessionId);
      const roundIndex = session?.rounds.findIndex((r) => r.id === roundId) ?? -1;
      const round = session?.rounds[roundIndex];
      const turn = round?.turns.find((t) => t.id === turnId);
      if (!session || !round || !turn) return;
      const slot = st.settings.slots.find((s) => s.id === turn.slotId)!;
      const label = `席位 ${slotNumber(turn.slotId)}`;

      const patch = (p: Partial<SlotTurn>) => act({ type: "patchTurn", sessionId, roundId, turnId, patch: p });
      const ctrl = new AbortController();
      controllers.current.set(turnId, { ctrl, sessionId, slotId: turn.slotId });

      let announced = false;
      const onDelta = (text: string) => {
        if (!text) return;
        act({ type: "appendDelta", sessionId, roundId, turnId, text, now: Date.now() });
        scheduleSave(sessionId);
        if (!announced) {
          announced = true;
          setAnnouncement(`${label} 正在回答`);
        }
      };
      const finish = (p: Partial<SlotTurn>) => {
        patch({ ...p, finishedAt: Date.now() });
        scheduleSave(sessionId, true);
        if (p.status === "done") setAnnouncement(`${label} 回答完成`);
        else if (p.status === "error") setAnnouncement(`${label} 回答失败`);
        else if (p.status === "aborted") setAnnouncement(`${label} 已停止`);
      };
      const fail = (code: string, message?: string) =>
        finish({ status: "error", errorCode: code, errorMessage: message || errorTextFor(code) });

      patch({ status: "pending", startedAt: Date.now() });
      try {
        if (st.settings.demo) {
          await streamDemo(demoText(turn.slotId, round.userText, turn.pass), onDelta, ctrl.signal);
          finish({ status: ctrl.signal.aborted ? "aborted" : "done" });
          return;
        }
        const key = st.secrets.keys[turn.slotId]?.trim();
        if (!key) return fail("missing_key");
        if (!turn.model) return fail("invalid_request", "请填写模型 ID");
        let messages;
        try {
          messages = buildMessages({
            rounds: session.rounds,
            roundIndex,
            slotId: turn.slotId,
            pass: turn.pass,
            globalSystemPrompt: st.settings.globalSystemPrompt,
            slotSystemPrompt: slot.systemPrompt,
          });
        } catch (e) {
          return fail("invalid_request", e instanceof Error ? e.message : undefined);
        }
        const result = await streamFromProxy(
          {
            kind: turn.kind,
            baseUrl: slot.baseUrl,
            model: turn.model,
            temperature: turn.temperature,
            maxTokens: turn.maxTokens,
            messages,
          },
          key,
          ctrl.signal,
          {
            onOpen: () => patch({ status: "streaming" }),
            onDelta,
            onUsage: (usage: Usage) => patch({ usage }),
          },
        );
        if (ctrl.signal.aborted) finish({ status: "aborted" });
        else if (result.ok) finish({ status: "done" });
        else fail(result.code, result.message);
      } catch {
        if (ctrl.signal.aborted) finish({ status: "aborted" });
        else fail("network");
      } finally {
        controllers.current.delete(turnId);
      }
    },
    [act, scheduleSave],
  );

  const startRound = useCallback(
    (base: Session, text: string) => {
      const st = live.current;
      const enabled = st.settings.slots.filter((s) => s.enabled);
      const now = Date.now();
      const round: Round = {
        id: crypto.randomUUID(),
        createdAt: now,
        mode: st.settings.mode,
        userText: text,
        turns: enabled.map((s) => newTurn(s, 0)),
      };
      const session: Session = {
        ...base,
        title: base.title || titleFrom(text),
        rounds: [...base.rounds, round],
        updatedAt: now,
      };
      commitSession(session);
      act({ type: "select", id: session.id });
      saveLastSessionId(session.id);
      for (const t of round.turns) void runTurn(session.id, round.id, t.id);
    },
    [act, commitSession, runTurn],
  );

  const send = useCallback(
    (text: string) => {
      const session = currentSession();
      if (!canStart(live.current, session, text) || session.rounds.some((r) => r.turns.some(isActive))) return false;
      startRound(session, text.trim());
      return true;
    },
    [currentSession, startRound],
  );

  const abortWhere = useCallback((match: (e: { sessionId: string; slotId: SlotId }) => boolean) => {
    for (const entry of controllers.current.values()) if (match(entry)) entry.ctrl.abort();
  }, []);

  const stopAll = useCallback(() => {
    const id = live.current.currentId;
    abortWhere((e) => e.sessionId === id);
  }, [abortWhere]);

  const stopSlot = useCallback(
    (slotId: SlotId) => {
      const id = live.current.currentId;
      abortWhere((e) => e.sessionId === id && e.slotId === slotId);
    },
    [abortWhere],
  );

  const regenerate = useCallback(
    (slotId: SlotId) => {
      const session = currentSession();
      const round = session?.rounds.at(-1);
      if (!session || !round) return;
      const own = round.turns.filter((t) => t.slotId === slotId);
      if (own.length === 0) return;
      const target = own.reduce((a, b) => (b.pass > a.pass ? b : a));
      if (isActive(target)) return;
      const slot = live.current.settings.slots.find((s) => s.id === slotId)!;
      const fresh = newTurn(slot, target.pass);
      const nextRound: Round = { ...round, turns: round.turns.map((t) => (t.id === target.id ? fresh : t)) };
      commitSession({ ...session, rounds: [...session.rounds.slice(0, -1), nextRound], updatedAt: Date.now() });
      void runTurn(session.id, round.id, fresh.id);
    },
    [commitSession, currentSession, runTurn],
  );

  const continueRound = useCallback(() => {
    const session = currentSession();
    const round = session?.rounds.at(-1);
    if (!session || !round || live.current.settings.mode !== "roundtable") return;
    if (!continuationState(round).available) return;
    const pass = maxPass(round) + 1;
    const added = live.current.settings.slots.filter((s) => s.enabled).map((s) => newTurn(s, pass));
    if (added.length === 0) return;
    const nextRound: Round = { ...round, turns: [...round.turns, ...added] };
    commitSession({ ...session, rounds: [...session.rounds.slice(0, -1), nextRound], updatedAt: Date.now() });
    for (const t of added) void runTurn(session.id, round.id, t.id);
  }, [commitSession, currentSession, runTurn]);

  const editRound = useCallback(
    (roundIndex: number, text: string) => {
      const session = currentSession();
      if (!session || roundIndex < 0 || roundIndex >= session.rounds.length) return false;
      const base = { ...session, rounds: session.rounds.slice(0, roundIndex) };
      if (!canStart(live.current, base, text)) return false;
      abortWhere((e) => e.sessionId === session.id);
      startRound(base, text.trim());
      return true;
    },
    [abortWhere, currentSession, startRound],
  );

  const toggleWinner = useCallback(
    (roundId: string, choice: VoteChoice | null) => {
      const session = currentSession();
      if (!session) return;
      commitSession({
        ...session,
        rounds: session.rounds.map((r) => {
          if (r.id !== roundId) return r;
          if (choice === null) return { ...r, winnerSlotId: undefined, vote: undefined };
          if (choice === "both" || choice === "neither") {
            return {
              ...r,
              winnerSlotId: undefined,
              vote: r.vote === choice ? undefined : choice,
            };
          }
          return {
            ...r,
            vote: undefined,
            winnerSlotId: r.winnerSlotId === choice ? undefined : choice,
          };
        }),
      });
    },
    [commitSession, currentSession],
  );

  const updateSettings = useCallback(
    (fn: (s: Settings) => Settings) => {
      const next = fn(live.current.settings);
      act({ type: "settings", settings: next });
      if (!saveSettings(next)) toast.error(QUOTA_TEXT);
    },
    [act],
  );

  const updateSlot = useCallback(
    (id: SlotId, patch: Partial<SlotConfig> | ((s: SlotConfig) => SlotConfig)) => {
      updateSettings((s) => ({
        ...s,
        slots: s.slots.map((slot) =>
          slot.id === id ? (typeof patch === "function" ? patch(slot) : { ...slot, ...patch }) : slot,
        ),
      }));
    },
    [updateSettings],
  );

  const writeSecrets = useCallback(
    (secrets: SecretMap) => {
      act({ type: "secrets", secrets });
      if (!saveSecrets(secrets)) toast.error(QUOTA_TEXT);
    },
    [act],
  );

  const setSecret = useCallback(
    (id: SlotId, key: string) => {
      const keys = { ...live.current.secrets.keys };
      if (key) keys[id] = key;
      else delete keys[id];
      writeSecrets({ version: 1, keys });
    },
    [writeSecrets],
  );

  const clearSecrets = useCallback(() => writeSecrets(emptySecrets()), [writeSecrets]);

  const newSession = useCallback(() => {
    const session = currentSession();
    if (session && session.rounds.length === 0) return;
    const draft = newDraft();
    act({ type: "upsertSession", session: draft });
    act({ type: "select", id: draft.id });
    saveLastSessionId(null);
  }, [act, currentSession]);

  const selectSession = useCallback(
    (id: string) => {
      if (!live.current.sessions.some((s) => s.id === id)) return;
      act({ type: "select", id });
      saveLastSessionId(id);
    },
    [act],
  );

  const renameSession = useCallback(
    (id: string, title: string) => {
      const session = live.current.sessions.find((s) => s.id === id);
      const t = title.trim().slice(0, 60);
      if (!session || !t || t === session.title) return;
      commitSession({ ...session, title: t, updatedAt: Date.now() });
    },
    [commitSession],
  );

  const removeSession = useCallback(
    (id: string) => {
      abortWhere((e) => e.sessionId === id);
      act({ type: "removeSession", id });
      pendingSaves.current.get(id)?.();
      if (live.current.dbAvailable) dbDelete(id).catch(onDbError);
      if (live.current.currentId === id) {
        const next = live.current.sessions.find((s) => s.rounds.length > 0);
        if (next) {
          act({ type: "select", id: next.id });
          saveLastSessionId(next.id);
        } else {
          const draft = newDraft();
          act({ type: "upsertSession", session: draft });
          act({ type: "select", id: draft.id });
          saveLastSessionId(null);
        }
      }
    },
    [abortWhere, act, onDbError],
  );

  const exportCurrent = useCallback(() => {
    const session = currentSession();
    if (!session) return;
    try {
      const now = Date.now();
      const blob = new Blob([sessionToMarkdown(session, now)], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = exportFileName(session, now);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      toast.error("导出失败");
    }
  }, [currentSession]);

  const testConnection = useCallback(async (slotId: SlotId): Promise<ProbeResult> => {
    const st = live.current;
    const slot = st.settings.slots.find((s) => s.id === slotId)!;
    const key = st.secrets.keys[slotId]?.trim();
    if (!key) return { ok: false, message: errorTextFor("missing_key") };
    if (!slot.model.trim()) return { ok: false, message: "请填写模型 ID" };
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 100_000);
    try {
      const r = await streamFromProxy(
        {
          kind: slot.kind,
          baseUrl: slot.baseUrl,
          model: slot.model.trim(),
          temperature: slot.temperature,
          maxTokens: LIMITS.probeMaxTokens,
          messages: [{ role: "user", content: "Reply with the single word: ok" }],
        },
        key,
        ctrl.signal,
      );
      return r.ok ? { ok: true } : { ok: false, message: r.message || errorTextFor(r.code) };
    } catch {
      return { ok: false, message: ctrl.signal.aborted ? errorTextFor("timeout") : errorTextFor("network") };
    } finally {
      clearTimeout(timer);
    }
  }, []);

  const fetchModels = useCallback(async (slotId: SlotId) => {
    const st = live.current;
    const slot = st.settings.slots.find((s) => s.id === slotId)!;
    const key = st.secrets.keys[slotId]?.trim();
    if (!key) return { ok: false as const, message: errorTextFor("missing_key") };
    return fetchModelIds(slot.baseUrl, key);
  }, []);

  const current = state.sessions.find((s) => s.id === state.currentId);
  const busy = !!current?.rounds.some((r) => r.turns.some(isActive));

  const api = useMemo<WorkspaceApi>(
    () => ({
      state,
      current,
      busy,
      announcement,
      updateSettings,
      updateSlot,
      setSecret,
      clearSecrets,
      newSession,
      selectSession,
      renameSession,
      removeSession,
      send,
      stopAll,
      stopSlot,
      regenerate,
      continueRound,
      editRound,
      toggleWinner,
      exportCurrent,
      testConnection,
      fetchModels,
    }),
    [
      state,
      current,
      busy,
      announcement,
      updateSettings,
      updateSlot,
      setSecret,
      clearSecrets,
      newSession,
      selectSession,
      renameSession,
      removeSession,
      send,
      stopAll,
      stopSlot,
      regenerate,
      continueRound,
      editRound,
      toggleWinner,
      exportCurrent,
      testConnection,
      fetchModels,
    ],
  );

  return <WorkspaceContext.Provider value={api}>{children}</WorkspaceContext.Provider>;
}
