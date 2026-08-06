import React from "react";
import { AlertCircle, ArrowRight, BookOpen, Circle, Terminal, Workflow } from "lucide-react";
import type { ReasoningEvent } from "../../types";

export interface EventLine {
  icon: React.ReactNode;
  text: string;
  tone: string;
}

/** Tone/icon-per-event-type mapping, extracted from the old always-visible
 * ReasoningPanel so the same logic backs the new per-message
 * ReasoningAccordion. */
export function reasoningEventLine(event: ReasoningEvent): EventLine {
  const { type, payload } = event;
  const source = payload.source || "system";

  switch (type) {
    case "node":
      return {
        icon: React.createElement(Workflow, { className: "w-3.5 h-3.5 text-slate-400" }),
        text: `${source} · ${payload.node} (${payload.phase})`,
        tone: "text-slate-500",
      };
    case "agent_call":
      return {
        icon: React.createElement(ArrowRight, { className: "w-3.5 h-3.5 text-brand-orange" }),
        text: `${source} → ${payload.target}: ${payload.message}`,
        tone: "text-slate-700",
      };
    case "tool_start":
      return {
        icon: React.createElement(Terminal, { className: "w-3.5 h-3.5 text-blue-500" }),
        text: `${source} called ${payload.tool}`,
        tone: "text-slate-600",
      };
    case "tool_end":
      return {
        icon: React.createElement(Terminal, { className: "w-3.5 h-3.5 text-emerald-500" }),
        text: `${source} · ${payload.tool} → ${payload.output_preview}`,
        tone: "text-slate-600",
      };
    case "citations":
      return {
        icon: React.createElement(BookOpen, { className: "w-3.5 h-3.5 text-purple-500" }),
        text: `${source} cited ${(payload.citations as unknown[] | undefined)?.length ?? 0} source(s)`,
        tone: "text-slate-600",
      };
    case "error":
      return {
        icon: React.createElement(AlertCircle, { className: "w-3.5 h-3.5 text-rose-500" }),
        text: `${source}: ${payload.message}`,
        tone: "text-rose-600 font-semibold",
      };
    default:
      return {
        icon: React.createElement(Circle, { className: "w-3.5 h-3.5 text-slate-300 fill-current" }),
        text: `${source}: ${payload.message}`,
        tone: "text-slate-500",
      };
  }
}
