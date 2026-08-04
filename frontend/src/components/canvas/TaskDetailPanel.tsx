import React, { useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import { hitlApi } from "../../api/client";
import type { HitlGate, PlannedTask, TaskResult } from "../../types";
import { TaskOutputRenderer } from "./TaskOutputRenderer";

interface Props {
  contractId: string;
  task: PlannedTask;
  result: TaskResult | undefined;
  gate: HitlGate | undefined;
  onResolved: () => void;
  onClose: () => void;
}

const HITL_LABEL: Record<PlannedTask["hitl_mode"], string> = {
  auto: "Auto — no review needed",
  confidence_gated: "Confidence-gated — review if uncertain",
  mandatory: "Mandatory human review",
};

export const TaskDetailPanel: React.FC<Props> = ({ contractId, task, result, gate, onResolved, onClose }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(() => JSON.stringify(result?.output ?? {}, null, 2));
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isPending = gate?.status === "pending";

  const handleApprove = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      await hitlApi.approve(contractId, task.task_id);
      onResolved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveEdit = async () => {
    setError(null);
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(editText);
    } catch {
      setError("That's not valid JSON.");
      return;
    }
    setIsSubmitting(true);
    try {
      await hitlApi.edit(contractId, task.task_id, parsed);
      setIsEditing(false);
      onResolved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save edit.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
      <div className="bg-slate-50/90 border-b border-slate-200 p-3 px-3.5 flex items-center justify-between gap-2 shrink-0">
        <div className="min-w-0">
          <h3 className="font-bold text-sm text-slate-800 truncate">{task.skill_id}</h3>
          <p className="text-[10px] text-slate-400">
            Stage {task.stage} · {HITL_LABEL[task.hitl_mode]}
          </p>
        </div>
        <button onClick={onClose} title="Close" className="text-slate-400 hover:text-slate-700 cursor-pointer shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3.5 space-y-3 text-xs">
        <p className="text-slate-500">{task.hitl_reason}</p>

        {result?.confidence !== undefined && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Confidence</span>
            <span className="text-[11px] font-bold text-slate-700">{Math.round(result.confidence * 100)}%</span>
          </div>
        )}

        {isEditing ? (
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            rows={12}
            className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 focus:border-brand-orange"
          />
        ) : result?.output ? (
          <TaskOutputRenderer output={result.output} />
        ) : (
          <p className="text-slate-400">This task hasn't run yet.</p>
        )}

        {result?.citations && result.citations.length > 0 && !isEditing && (
          <div className="pt-2 border-t border-slate-100">
            <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Knowledge Used</div>
            <div className="space-y-1">
              {(result.citations as { title?: string; snippet?: string }[]).map((c, idx) => (
                <div key={idx} className="text-[11px] text-slate-600 bg-slate-50 rounded-lg p-2 border border-slate-100">
                  <div className="font-bold text-slate-700">{c.title || "Untitled source"}</div>
                  {c.snippet && <div className="text-slate-500 mt-0.5">{c.snippet}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="text-[11px] font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
            {error}
          </div>
        )}
      </div>

      {isPending && (
        <div className="p-3 border-t border-slate-100 flex items-center gap-2 shrink-0">
          {isEditing ? (
            <>
              <button
                onClick={() => setIsEditing(false)}
                className="flex-1 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={isSubmitting}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-brand-orange hover:bg-brand-orange-hover text-white font-bold text-xs cursor-pointer disabled:opacity-60"
              >
                <Check className="w-3.5 h-3.5" />
                Save & Resume
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setIsEditing(true)}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
              >
                <Pencil className="w-3.5 h-3.5" />
                Edit
              </button>
              <button
                onClick={handleApprove}
                disabled={isSubmitting}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs cursor-pointer disabled:opacity-60"
              >
                <Check className="w-3.5 h-3.5" />
                Approve
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};
