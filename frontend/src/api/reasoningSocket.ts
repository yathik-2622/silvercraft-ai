import { API_BASE_URL, getToken } from "./client";
import type { ArtifactEvent, ChatMessage, ContractEvent, ReasoningEvent } from "../types";

const CONTRACT_EVENT_TYPES = new Set([
  "plan_ready",
  "run_completed",
  "hitl_pending",
  "skill_import_clarification",
  "kb_ingest_complete",
  "kb_ingest_failed",
]);

function wsUrl(chatId: string): string {
  const token = getToken();
  const base = API_BASE_URL.replace(/^http/, "ws");
  return `${base}/ws/chats/${chatId}?token=${encodeURIComponent(token || "")}`;
}

export interface ReasoningSocketHandlers {
  onReasoningEvent: (event: ReasoningEvent) => void;
  onAssistantMessage: (message: ChatMessage) => void;
  onContractEvent?: (event: ContractEvent) => void;
  onArtifact?: (event: ArtifactEvent) => void;
  onStatusChange: (status: "connecting" | "open" | "closed" | "unauthorized") => void;
}

export function openReasoningSocket(chatId: string, handlers: ReasoningSocketHandlers): () => void {
  let socket: WebSocket | null = null;
  let closedByCaller = false;

  const connect = () => {
    handlers.onStatusChange("connecting");
    socket = new WebSocket(wsUrl(chatId));

    socket.onopen = () => handlers.onStatusChange("open");

    socket.onmessage = (evt) => {
      let parsed: { type: string; payload: unknown };
      try {
        parsed = JSON.parse(evt.data);
      } catch {
        return;
      }
      if (parsed.type === "orchestrator_response") {
        handlers.onAssistantMessage(parsed.payload as ChatMessage);
        return;
      }
      if (CONTRACT_EVENT_TYPES.has(parsed.type)) {
        handlers.onContractEvent?.(parsed as ContractEvent);
        return;
      }
      if (parsed.type === "artifact") {
        handlers.onArtifact?.(parsed as ArtifactEvent);
        return;
      }
      if (
        parsed.type === "log" ||
        parsed.type === "node" ||
        parsed.type === "agent_call" ||
        parsed.type === "tool_start" ||
        parsed.type === "tool_end" ||
        parsed.type === "token" ||
        parsed.type === "error" ||
        parsed.type === "citations"
      ) {
        handlers.onReasoningEvent(parsed as ReasoningEvent);
      }
    };

    socket.onclose = (evt) => {
      if (closedByCaller) return;
      handlers.onStatusChange(evt.code === 4401 ? "unauthorized" : "closed");
    };

    socket.onerror = () => {
      // onclose fires right after and carries the real signal
    };
  };

  connect();

  return () => {
    closedByCaller = true;
    socket?.close();
  };
}
