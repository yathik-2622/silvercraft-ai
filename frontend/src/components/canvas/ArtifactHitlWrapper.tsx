import React, { useState } from "react";
import { Check, Pencil } from "lucide-react";
import { hitlApi, parseHitlEditConflict } from "../../api/client";
import type { ChatArtifact } from "../../types";
import { EditableTaskOutput } from "./EditableTaskOutput";
import { ConflictResolutionModal } from "./ConflictResolutionModal";

interface Props {
  contractId: string;
  artifact: ChatArtifact;
  isPending: boolean;
  // How many task_results[task_id].history entries this artifact has right
  // now — captured the moment editing starts and sent back as
  // base_revision_count, so ADM_hitl_edit can tell whether a collaborator
  // saved a newer one in between (see ADM_ExecutionContract's backend
  // module note on shared, versioned contracts).
  revisionCount: number;
  // Resolved username for a user_id — used to show who last touched the
  // conflicting revision in ConflictResolutionModal. Undefined/missing ids
  // fall back to the raw id so the modal still renders something useful.
  usernameByUserId?: Map<string, string>;
  onResolved: () => void;
  children: React.ReactNode;
}

// Approve/Edit review controls for an artifact whose task is paused on a
// HITL gate — replaces TaskDetailPanel's graph-node-click-only version
// (Phase 3: HITL review now lives wherever the artifact itself is shown,
// reached via its chat chip, not a separate graph side-panel). Wraps the
// normal dynamic renderer (`children`) rather than reimplementing output
// display — editing swaps it for EditableTaskOutput's structured inline
// editor, not a raw JSON textarea.
export const ArtifactHitlWrapper: React.FC<Props> = ({
  contractId,
  artifact,
  isPending,
  revisionCount,
  usernameByUserId,
  onResolved,
  children,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draftOutput, setDraftOutput] = useState<Record<string, unknown> | Record<string, unknown>[]>(
    () => (artifact.output ?? {}) as Record<string, unknown> | Record<string, unknown>[],
  );
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editStartRevisionCount, setEditStartRevisionCount] = useState(0);
  const [conflict, setConflict] = useState<{
    current_output: unknown;
    resolved_by_user_id: string | null;
    updated_at: string;
    revision_count: number;
  } | null>(null);

  const handleApprove = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      await hitlApi.approve(contractId, artifact.task_id);
      onResolved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const startEditing = () => {
    setEditStartRevisionCount(revisionCount);
    setIsEditing(true);
  };

  const saveEdit = async (baseRevisionCount: number) => {
    setError(null);
    setIsSubmitting(true);
    try {
      await hitlApi.edit(contractId, artifact.task_id, draftOutput, baseRevisionCount);
      setIsEditing(false);
      setConflict(null);
      onResolved();
    } catch (err) {
      const parsedConflict = parseHitlEditConflict(err);
      if (parsedConflict) {
        setConflict(parsedConflict);
      } else {
        setError(err instanceof Error ? err.message : "Failed to save edit.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveEdit = () => saveEdit(editStartRevisionCount);

  // Their version is already the saved server state (that's what caused
  // the conflict) — nothing left to write, just stop editing and let the
  // read-only view pick it up on refresh.
  const handleTakeTheirs = () => {
    setConflict(null);
    setIsEditing(false);
    onResolved();
  };

  // Force-save this draft on top of their revision — resubmits with the
  // now-current revision count from the conflict response, so the retry
  // succeeds instead of colliding again.
  const handleKeepMine = () => {
    if (!conflict) return;
    saveEdit(conflict.revision_count);
  };

  if (!isPending) return <>{children}</>;

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-0 overflow-y-auto">
        {isEditing ? (
          <div className="p-3">
            <EditableTaskOutput output={draftOutput} onChange={setDraftOutput} />
          </div>
        ) : (
          children
        )}
      </div>
      {error && (
        <div className="mx-3 mb-2 text-[11px] font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
          {error}
        </div>
      )}
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
              onClick={startEditing}
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

      {conflict && (
        <ConflictResolutionModal
          myDraftOutput={draftOutput}
          theirOutput={conflict.current_output}
          theirUsername={
            (conflict.resolved_by_user_id && usernameByUserId?.get(conflict.resolved_by_user_id)) ||
            conflict.resolved_by_user_id ||
            "a collaborator"
          }
          theirTimestamp={conflict.updated_at}
          onTakeTheirs={handleTakeTheirs}
          onKeepMine={handleKeepMine}
          onCancel={() => setConflict(null)}
        />
      )}
    </div>
  );
};
