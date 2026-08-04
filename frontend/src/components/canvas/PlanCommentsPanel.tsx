import React, { useState } from "react";
import { MessageSquare, Send } from "lucide-react";
import { contractsApi } from "../../api/client";
import type { PlanComment } from "../../types";

interface Props {
  contractId: string;
  comments: PlanComment[];
  onCommentAdded: () => void;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString([], { hour: "2-digit", minute: "2-digit", month: "short", day: "numeric" });
}

export const PlanCommentsPanel: React.FC<Props> = ({ contractId, comments, onCommentAdded }) => {
  const [text, setText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setIsSubmitting(true);
    try {
      await contractsApi.addComment(contractId, text.trim());
      setText("");
      onCommentAdded();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="border-t border-slate-200 bg-slate-50/60 p-3 space-y-2">
      <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
        <MessageSquare className="w-3 h-3" />
        Plan Comments ({comments.length})
      </div>

      {comments.length > 0 && (
        <div className="space-y-1.5 max-h-28 overflow-y-auto">
          {comments.map((c, idx) => (
            <div key={idx} className="text-[11px] bg-white rounded-lg border border-slate-200 px-2.5 py-1.5">
              <div className="flex items-center justify-between gap-2 text-[10px] text-slate-400">
                <span className="font-bold text-slate-600">{c.author_user_id}</span>
                <span>{formatTime(c.created_at)}</span>
              </div>
              <div className="text-slate-700 mt-0.5">{c.text}</div>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex items-center gap-1.5">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Comment on this plan..."
          className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 focus:border-brand-orange"
        />
        <button
          type="submit"
          disabled={!text.trim() || isSubmitting}
          className="p-2 rounded-xl bg-brand-orange hover:bg-brand-orange-hover disabled:opacity-50 text-white cursor-pointer"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );
};
