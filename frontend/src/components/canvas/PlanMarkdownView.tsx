import React, { useEffect, useState } from "react";
import { MessageSquarePlus, Send } from "lucide-react";
import { contractsApi, skillsApi } from "../../api/client";
import type { ExecutionContract, PlannedTask, Skill } from "../../types";
import { ArtifactMarkdown } from "./renderers/ArtifactMarkdown";

interface Props {
  contract: ExecutionContract;
  onCommentAdded: () => void;
}

const STAGE_LABEL: Record<string, string> = {
  "1": "Stage 1 · Source Analysis",
  "2": "Stage 2 · Conceptual",
  "3": "Stage 3 · Logical",
  "4": "Stage 4 · Physical & STTM",
};

function taskMarkdown(task: PlannedTask, skill: Skill | undefined): string {
  const title = skill?.title || task.skill_id;
  const lines = [`### ${title}`];
  if (skill?.purpose) lines.push("", skill.purpose);
  if (skill?.expected_output) lines.push("", `**Expected output:** ${skill.expected_output}`);
  return lines.join("\n");
}

const TaskCommentEditor: React.FC<{
  contractId: string;
  taskId: string;
  existingText: string;
  onSaved: () => void;
  onCancel: () => void;
}> = ({ contractId, taskId, existingText, onSaved, onCancel }) => {
  const [text, setText] = useState(existingText);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!text.trim()) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await contractsApi.addComment(contractId, text.trim(), taskId);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save instruction.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mt-2 p-2.5 rounded-xl bg-brand-orange-light/40 border border-brand-orange/30 space-y-1.5">
      <textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="Give this task a direct instruction instead of the planner's default judgment..."
        className="w-full px-2.5 py-2 bg-white border border-slate-200 rounded-lg text-[11px] text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 focus:border-brand-orange"
      />
      {error && <p className="text-[10px] font-semibold text-rose-600">{error}</p>}
      <div className="flex items-center gap-1.5">
        <button
          onClick={handleSave}
          disabled={isSubmitting || !text.trim()}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-brand-orange hover:bg-brand-orange-hover text-white font-bold text-[11px] cursor-pointer disabled:opacity-50"
        >
          <Send className="w-3 h-3" />
          {isSubmitting ? "Saving..." : "Save instruction"}
        </button>
        <button
          onClick={onCancel}
          className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 font-bold text-[11px] cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

export const PlanMarkdownView: React.FC<Props> = ({ contract, onCommentAdded }) => {
  const [skillsById, setSkillsById] = useState<Record<string, Skill>>({});
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);

  useEffect(() => {
    const allTasks = Object.values(contract.stages).flat();
    const uniqueSkillIds = Array.from(new Set(allTasks.map((t) => t.skill_id)));
    const missing = uniqueSkillIds.filter((id) => !(id in skillsById));
    if (missing.length === 0) return;
    let cancelled = false;
    Promise.all(missing.map((id) => skillsApi.get(id).catch(() => null))).then((results) => {
      if (cancelled) return;
      setSkillsById((prev) => {
        const next = { ...prev };
        results.forEach((skill, idx) => {
          if (skill) next[missing[idx]] = skill;
        });
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contract]);

  const canAddTaskInstructions = contract.status === "draft";

  return (
    <div className="h-full overflow-y-auto p-4 space-y-5">
      {Object.keys(contract.stages)
        .sort()
        .map((stageKey) => {
          const tasks = contract.stages[stageKey];
          if (tasks.length === 0) return null;
          return (
            <div key={stageKey} className="space-y-3">
              <h2 className="text-xs font-black uppercase tracking-wider text-slate-400">
                {STAGE_LABEL[stageKey] || `Stage ${stageKey}`}
              </h2>
              {tasks.map((task) => {
                const taskComments = (contract.comments || []).filter((c) => c.task_id === task.task_id);
                const lastComment = taskComments[taskComments.length - 1];
                const isEditing = editingTaskId === task.task_id;
                return (
                  <div
                    key={task.task_id}
                    className="group relative bg-white border border-slate-200 rounded-xl p-3.5 hover:border-slate-300 transition-colors"
                  >
                    {canAddTaskInstructions && !isEditing && (
                      <button
                        onClick={() => setEditingTaskId(task.task_id)}
                        title="Give this task a direct instruction"
                        className="absolute top-3 right-3 p-1.5 rounded-lg text-slate-300 hover:text-brand-orange hover:bg-brand-orange-light opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                      >
                        <MessageSquarePlus className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <ArtifactMarkdown text={taskMarkdown(task, skillsById[task.skill_id])} />

                    {taskComments.length > 0 && !isEditing && (
                      <div className="mt-2 space-y-1">
                        {taskComments.map((c, idx) => (
                          <div
                            key={idx}
                            className="text-[11px] text-brand-orange bg-brand-orange-light rounded-lg px-2.5 py-1.5 font-semibold"
                          >
                            {c.text}
                          </div>
                        ))}
                      </div>
                    )}

                    {isEditing && (
                      <TaskCommentEditor
                        contractId={contract.contract_id}
                        taskId={task.task_id}
                        existingText={lastComment?.text || ""}
                        onSaved={() => {
                          setEditingTaskId(null);
                          onCommentAdded();
                        }}
                        onCancel={() => setEditingTaskId(null)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
    </div>
  );
};
