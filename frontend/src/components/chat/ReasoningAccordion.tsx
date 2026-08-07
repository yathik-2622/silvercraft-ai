import React, { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, Sparkles } from "lucide-react";
import type { ReasoningEvent } from "../../types";
import { reasoningEventLine } from "./reasoningEventLine";

interface Props {
  events: ReasoningEvent[];
  isStreaming: boolean;
  title?: string;
}

/** A collapsible per-message reasoning trace — expanded while its turn is
 * streaming, auto-collapses once the response completes. Redesigned from a
 * bare monospace step list into a card with a two-line header (title + a
 * live one-line preview of the latest step), a step-count badge, an
 * animated expand/collapse, and each step rendered as its own row with the
 * event's icon in a small badge rather than raw inline monospace text —
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
    <div className="rounded-2xl border border-slate-200 bg-white/70 backdrop-blur-sm overflow-hidden shadow-2xs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-left cursor-pointer hover:bg-slate-50 transition-colors"
      >
        <div
          className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 border transition-colors ${
            isStreaming ? "bg-brand-orange-light border-brand-orange/20 text-brand-orange" : "bg-slate-100 border-slate-200 text-slate-400"
          }`}
        >
          <Sparkles className={`w-3.5 h-3.5 ${isStreaming ? "animate-pulse" : ""}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-bold text-slate-700 truncate">{title}</div>
          <div className="text-[10px] text-slate-400 truncate">{lastLine?.text ?? "—"}</div>
        </div>
        <span className="text-[9px] font-black text-slate-500 bg-slate-100 rounded-full px-2 py-0.5 shrink-0">
          {events.length} step{events.length === 1 ? "" : "s"}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="overflow-hidden border-t border-slate-100"
          >
            <div className="px-2 py-1.5 space-y-0.5 max-h-56 overflow-y-auto">
              {events.map((event, idx) => {
                const { icon, text, tone } = reasoningEventLine(event);
                return (
                  <div key={idx} className="flex items-start gap-2 px-1.5 py-1 rounded-lg hover:bg-slate-50 transition-colors">
                    <span className="mt-0.5 w-5 h-5 rounded-md bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0">
                      {icon}
                    </span>
                    <span className={`text-[11px] leading-relaxed pt-0.5 ${tone}`}>{text}</span>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
