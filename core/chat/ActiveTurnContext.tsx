"use client";

import { createContext, useContext } from "react";
import { createStore, StoreApi, useStore } from "zustand";
import {
  ApplyToolCallResults,
  CollectMessageContents,
  HumanConfirmation,
  Message,
  ToolResultContent,
  Turn,
  TurnStatus,
} from "./type";

export type ChatStatus = "idle" | "sending" | "reasoning" | "streaming" | "approval";

/**
 * The turn that is being processed, and the request that carries it.
 *
 * Life cycle of a turn here:
 *
 *   beginRequest -> startTurn -> (onReasoningStream | onStream | onStreamDone | onToolCall | onToolResult)*
 *                -> endTurn                 the turn settles into the conversation
 *                -> failTurn                the stream broke; the partial turn settles as "failed"
 *                -> cancelRequest           the user gave up; the partial turn is discarded
 *
 * A turn waiting for human approval stays open across turn.end: the backend sends turn.end to
 * release the turn's resources, but the turn resumes after the answer, through a new request.
 */
export interface ActiveTurnState {
  status: ChatStatus;

  /**
   * The turn in flight, or null when no turn is open. Messages land here iteration by iteration
   * (llm.complete); the user's messages come first.
   */
  turn: Turn | null;

  /**
   * The assistant message of the iteration that is still being generated (reasoning or text).
   * It is ephemeral: `onStreamDone` replaces it with the complete message of llm.complete.
   */
  draft: Message | null;

  /**
   * Tool calls that have been requested but not finished yet.
   */
  runningToolCalls: number;

  /**
   * Pending human-in-the-loop questions.
   */
  confirmation: HumanConfirmation[];

  /**
   * The AbortController of the in-flight request, or null.
   *
   * It is owned by this store, not by the composer: a request can outlive the component that
   * started it. The first turn is submitted on the landing page, whose composer unmounts during
   * navigation, while the request keeps streaming into the conversation page, whose cancel button
   * must still be able to abort it.
   */
  abortController: AbortController | null;

  actions: ActiveTurnActions;
}

export interface ActiveTurnActions {
  /**
   * A new request starts: abort the previous one (a new turn supersedes it), dismiss any pending
   * confirmation (a resume request answers it) and return a fresh controller.
   */
  beginRequest: () => AbortController;

  /**
   * The request's stream closed: unregister its controller. A late call of an already superseded
   * request is ignored.
   */
  endRequest: (controller: AbortController) => void;

  /**
   * Abort the in-flight request and discard the partial turn. Called by the composer's cancel
   * button.
   */
  cancelRequest: () => void;

  /**
   * turn.start. A new turn opens with the user's message(s); a resumed turn (same seq, or no user
   * message) keeps the open turn so the resumed stream continues it.
   */
  startTurn: (seq: number, messages: Message[]) => void;

  /**
   * turn.end: the turn is processed completely, so it settles into the conversation — unless it is
   * waiting for human approval. `latest` is the backend's up-to-date turn record (seq, tokens_used,
   * iterations...); it is merged into the turn, except messages and status.
   */
  endTurn: (latest?: Partial<Turn>) => void;

  /**
   * The request broke (error event or network failure). The partial turn settles as "failed" so
   * the user keeps what had arrived. Ignored when `controller` is no longer the current request.
   */
  failTurn: (controller: AbortController) => void;

  /** llm.delta: a chunk of the answer. It ends the reasoning phase and means no tool is running. */
  onStream: (id: string, chunk: string) => void;

  /** llm.reasoning.delta: a chunk of the reasoning summary. */
  onReasoningStream: (id: string, chunk: string) => void;

  /** llm.complete: the iteration is done; land its complete message in the turn. */
  onStreamDone: (message: Message) => void;

  /** tool.call: a tool starts running. Tools of one iteration run in parallel. */
  onToolCall: () => void;

  /** tool.result: attach results to the matching tool calls. Results without a call are ignored. */
  onToolResult: (results: ToolResultContent[]) => void;

  /** runtime.hitl: the agent asks the user, and waits. */
  onConfirmation: (confirmation: HumanConfirmation[]) => void;
}

export type ActiveTurnStore = StoreApi<ActiveTurnState>;

function newTurn(seq: number, messages: Message[]): Turn {
  return {
    conversation_id: "",
    messages,
    turn_seq: seq,
    status: "running",
    tokens_used: 0,
    iterations: 0,
    created_at: 0,
    updated_at: 0,
  };
}

/**
 * @param onSettle receives the turn once it is finished (done or failed); the provider wires it to
 * the conversation so this store does not depend on it.
 */
export function createActiveTurnStore(onSettle: (turn: Turn) => void): ActiveTurnStore {
  return createStore<ActiveTurnState>()((set, get) => {
    // Close the open turn: leave the active state first, then hand the turn over, so it is never
    // rendered in both places.
    const settle = (status: TurnStatus) => {
      const { turn } = get();
      set({ turn: null, draft: null, status: "idle", runningToolCalls: 0, confirmation: [] });
      if (turn) {
        onSettle({ ...turn, status });
      }
    };

    const actions: ActiveTurnActions = {
      beginRequest: () => {
        get().abortController?.abort();
        const controller = new AbortController();
        set({ abortController: controller, status: "sending", confirmation: [] });
        return controller;
      },

      endRequest: (controller) => {
        if (get().abortController === controller) {
          set({ abortController: null });
        }
      },

      cancelRequest: () => {
        get().abortController?.abort();
        // The aborted stream never delivers turn.end, so reset everything here.
        set({
          abortController: null,
          status: "idle",
          turn: null,
          draft: null,
          runningToolCalls: 0,
          confirmation: [],
        });
      },

      startTurn: (seq, messages) => {
        const { turn } = get();
        if (turn && (messages.length === 0 || turn.turn_seq === seq)) {
          set({ status: "streaming" });
          return;
        }
        set({ turn: newTurn(seq, messages), draft: null, status: "streaming" });
      },

      endTurn: (latest) => {
        // The messages were assembled from the stream, so keep them; take the rest (seq, token usage,
        // iterations, timestamps...) from the backend's authoritative record.
        if (latest) {
          const meta = { ...latest };
          delete meta.messages;
          delete meta.status;
          set(({ turn }) => (turn ? { turn: { ...turn, ...meta } } : {}));
        }
        if (get().confirmation.length > 0) {
          return;
        }
        settle("done");
      },

      failTurn: (controller) => {
        if (get().abortController !== controller) {
          return;
        }
        settle("failed");
      },

      onStream: (id, chunk) =>
        set(({ draft }) => ({
          status: "streaming",
          // The model is called only after all tools finish, so the first chunk means none is running.
          runningToolCalls: 0,
          // Text only: this also drops the streamed reasoning, the full summary arrives with llm.complete.
          draft: {
            id,
            role: "assistant",
            contents: [{ type: "text", text: (draft ? CollectMessageContents(draft) : "") + chunk }],
          },
        })),

      onReasoningStream: (id, chunk) =>
        set(({ draft }) => {
          const previous = draft?.contents.find((c) => c.type === "reasoning")?.summary ?? "";
          return {
            status: "reasoning",
            draft: { id, role: "assistant", contents: [{ type: "reasoning", id, summary: previous + chunk }] },
          };
        }),

      onStreamDone: (message) =>
        set(({ turn }) =>
          turn ? { turn: { ...turn, messages: [...turn.messages, message] }, draft: null } : {},
        ),

      onToolCall: () => set((s) => ({ runningToolCalls: s.runningToolCalls + 1 })),

      onToolResult: (results) =>
        set(({ turn, runningToolCalls }) => {
          const messages = turn ? ApplyToolCallResults(turn.messages, results) : null;
          return {
            runningToolCalls: Math.max(0, runningToolCalls - results.length),
            ...(turn && messages ? { turn: { ...turn, messages } } : {}),
          };
        }),

      onConfirmation: (confirmation) => set({ confirmation, status: "approval" }),
    };

    return {
      status: "idle",
      turn: null,
      draft: null,
      runningToolCalls: 0,
      confirmation: [],
      abortController: null,
      actions,
    };
  });
}

export const ActiveTurnContext = createContext<ActiveTurnStore | null>(null);

// Used when a consumer renders outside a ChatContextProvider (ex: the composer on the landing
// page), so the hooks return inert defaults instead of throwing.
const fallbackStore = createActiveTurnStore(() => {});

export function useActiveTurn<T>(selector: (state: ActiveTurnState) => T): T {
  return useStore(useContext(ActiveTurnContext) ?? fallbackStore, selector);
}

export function useActiveTurnActions(): ActiveTurnActions {
  return useActiveTurn((s) => s.actions);
}
