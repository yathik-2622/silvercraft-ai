import React, { useEffect, useRef } from "react";
import { AlertCircle, ArrowRight, BookOpen, Circle, Sparkles, Terminal, Workflow } from "lucide-react";
import type { ReasoningEvent } from "../types";

interface Props {
  events: ReasoningEvent[];
  streamingText: string;
  isThinking: boolean;
  connectionStatus: "idle" | "connecting" | "open" | "closed" | "unauthorized";
}

function eventLine(event: ReasoningEvent): { icon: React.ReactNode; text: string; tone: string } {
  const { type, payload } = event;
  const source = payload.source || "system";

  switch (type) {
    case "node":
      return {
        icon: <Workflow className="w-3.5 h-3.5 text-slate-400" />,
        text: `${source} · ${payload.node} (${payload.phase})`,
        tone: "text-slate-500",
      };
    case "agent_call":
      return {
        icon: <ArrowRight className="w-3.5 h-3.5 text-brand-orange" />,
        text: `${source} → ${payload.target}: ${payload.message}`,
        tone: "text-slate-700",
      };
    case "tool_start":
      return {
        icon: <Terminal className="w-3.5 h-3.5 text-blue-500" />,
        text: `${source} called ${payload.tool}`,
        tone: "text-slate-600",
      };
    case "tool_end":
      return {
        icon: <Terminal className="w-3.5 h-3.5 text-emerald-500" />,
        text: `${source} · ${payload.tool} → ${payload.output_preview}`,
        tone: "text-slate-600",
      };
    case "citations":
      return {
        icon: <BookOpen className="w-3.5 h-3.5 text-purple-500" />,
        text: `${source} cited ${(payload.citations as unknown[] | undefined)?.length ?? 0} source(s)`,
        tone: "text-slate-600",
      };
    case "error":
      return {
        icon: <AlertCircle className="w-3.5 h-3.5 text-rose-500" />,
        text: `${source}: ${payload.message}`,
        tone: "text-rose-600 font-semibold",
      };
    default:
      return {
        icon: <Circle className="w-3.5 h-3.5 text-slate-300 fill-current" />,
        text: `${source}: ${payload.message}`,
        tone: "text-slate-500",
      };
  }
}

export const ReasoningPanel: React.FC<Props> = ({ events, streamingText, isThinking, connectionStatus }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events.length, streamingText]);

  return (
    <div className="h-full flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
      <div className="bg-slate-50/90 border-b border-slate-200 p-3 px-3.5 flex items-center justify-between gap-2 shrink-0">
        <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-brand-orange" />
          <span>Live Reasoning</span>
        </h3>
        {connectionStatus !== "idle" && (
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              connectionStatus === "open"
                ? "bg-emerald-100 text-emerald-700"
                : connectionStatus === "connecting"
                  ? "bg-amber-100 text-amber-700"
                  : "bg-rose-100 text-rose-700"
            }`}
          >
            {connectionStatus === "open" ? "Connected" : connectionStatus === "connecting" ? "Connecting…" : "Disconnected"}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2 text-xs font-mono">
        {events.length === 0 && !isThinking && (
          <p className="text-slate-400 text-center py-8">Send a message to see the orchestrator's reasoning trace here.</p>
        )}

        {events.map((event, idx) => {
          const { icon, text, tone } = eventLine(event);
          return (
            <div key={idx} className="flex items-start gap-2 leading-relaxed">
              <span className="mt-0.5 shrink-0">{icon}</span>
              <span className={tone}>{text}</span>
            </div>
          );
        })}

        {streamingText && (
          <div className="flex items-start gap-2 leading-relaxed text-slate-800">
            <span className="mt-0.5 shrink-0">
              <Circle className="w-3.5 h-3.5 text-brand-orange fill-current animate-pulse" />
            </span>
            <span className="whitespace-pre-wrap">{streamingText}</span>
          </div>
        )}

        {isThinking && !streamingText && (
          <div className="flex items-center gap-2 text-slate-400">
            <span className="w-2 h-2 rounded-full bg-brand-orange animate-pulse" />
            <span>Thinking…</span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
};
