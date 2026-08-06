import React, { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Sparkles } from "lucide-react";
import type { ReasoningEvent } from "../../types";
import { reasoningEventLine } from "./reasoningEventLine";

interface Props {
  events: ReasoningEvent[];
  isStreaming: boolean;
  title?: string;
}

/** A collapsible per-message reasoning trace — expanded while its turn is
 * streaming, auto-collapses once the response completes. Modeled on the
 * aigers-universe-main reference app's ActivityConsole.jsx (collapsed
 * header with a live one-line summary + step count). Replaces the old
 * always-visible global ReasoningPanel, which lived in the right canvas —
 * this lives inline in the chat, one per assistant turn. */
export const ReasoningAccordion: React.FC<Props> = ({ events, isStreaming, title = "Reasoning" }) => {
  const [open, setOpen] = useState(isStreaming);

  useEffect(() => {
    if (isStreaming) setOpen(true);
  }, [isStreaming]);

  useEffect(() => {
    if (!isStreaming && events.length > 0) {
      // Give the user a beat to see the final line before collapsing.
      const id = window.setTimeout(() => setOpen(false), 800);
      return () => window.clearTimeout(id);
    }
  }, [isStreaming, events.length]);

  if (events.length === 0) return null;

  const last = events[events.length - 1];
  const lastLine = last ? reasoningEventLine(last) : null;

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left cursor-pointer hover:bg-slate-100/80 transition-colors"
      >
        {open ? (
          <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
        ) : (
          <ChevronRight className="w-3 h-3 text-slate-400 shrink-0" />
        )}
        <Sparkles className={`w-3 h-3 shrink-0 ${isStreaming ? "text-brand-orange animate-pulse" : "text-slate-400"}`} />
        <span className="text-[10px] font-semibold text-slate-500 truncate flex-1 min-w-0">{lastLine?.text ?? title}</span>
        <span className="text-[9px] font-bold text-slate-400 shrink-0">{events.length} step(s)</span>
      </button>
      {open && (
        <div className="px-2.5 pb-2 pt-0.5 space-y-1 text-[11px] font-mono max-h-56 overflow-y-auto">
          {events.map((event, idx) => {
            const { icon, text, tone } = reasoningEventLine(event);
            return (
              <div key={idx} className="flex items-start gap-1.5 leading-relaxed">
                <span className="mt-0.5 shrink-0">{icon}</span>
                <span className={tone}>{text}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
