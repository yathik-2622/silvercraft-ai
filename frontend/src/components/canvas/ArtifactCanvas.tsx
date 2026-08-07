import React, { useEffect, useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { collaboratorsApi, contractsApi } from "../../api/client";
import type { ChatArtifact, Collaborator, ExecutionContract, RunState } from "../../types";
import { ArtifactStageTabs } from "./ArtifactStageTabs";
import { ArtifactHitlWrapper } from "./ArtifactHitlWrapper";
import { ArtifactRenderer } from "./ArtifactRendererRegistry";

// Builds task_id -> position in the workflow's own declared order (stage,
// then step-within-stage) — the WS/fetch arrival order artifacts stream in
// isn't the same thing (a fan-out batch can complete out of order), so the
// history strip needs this to show tasks left-to-right the way the
// workflow skill actually defines them, not however they happened to finish.
function buildTaskOrder(contract: ExecutionContract | null): Map<string, number> {
  const order = new Map<string, number>();
  if (!contract) return order;
  let i = 0;
  for (const stageKey of Object.keys(contract.stages).sort((a, b) => Number(a) - Number(b))) {
    for (const task of contract.stages[stageKey]) {
      order.set(task.task_id, i++);
    }
  }
  return order;
}

interface Props {
  artifacts: ChatArtifact[];
  activeArtifactId: string | null;
  onSelectArtifact: (id: string) => void;
  isEmpty: boolean;
  // Only known once a plan exists — lets the canvas offer Approve/Edit for
  // whichever artifact's task is currently paused on a HITL gate (Phase 3:
  // this replaces TaskDetailPanel's graph-node-click-only review flow,
  // reached instead via the artifact's own chat chip).
  contractId?: string | null;
}

export const ArtifactCanvas: React.FC<Props> = ({ artifacts, activeArtifactId, onSelectArtifact, isEmpty, contractId }) => {
  const [runState, setRunState] = useState<RunState | null>(null);
  const [contract, setContract] = useState<ExecutionContract | null>(null);
  // Contracts are shared per-project now — fetched once the contract (and
  // therefore its project_id) is known, so "Last touched by X" and the
  // conflict modal can resolve a user_id to a real username instead of a
  // raw id. Not re-fetched on every 4s poll — the collaborator list itself
  // changes rarely, only the project_id it's keyed on matters here.
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);

  const taskOrder = useMemo(() => buildTaskOrder(contract), [contract]);
  const orderedArtifacts = useMemo(() => {
    if (taskOrder.size === 0) return artifacts;
    return [...artifacts].sort((a, b) => {
      const orderA = taskOrder.get(a.task_id) ?? Number.MAX_SAFE_INTEGER;
      const orderB = taskOrder.get(b.task_id) ?? Number.MAX_SAFE_INTEGER;
      return orderA - orderB;
    });
  }, [artifacts, taskOrder]);

  const active = orderedArtifacts.find((a) => a.artifact_id === activeArtifactId) ?? orderedArtifacts[orderedArtifacts.length - 1];

  const refreshGateState = () => {
    if (!contractId) return;
    contractsApi
      .status(contractId)
      .then(({ contract, run_state }) => {
        setContract(contract);
        setRunState(run_state);
      })
      .catch(() => {});
  };

  useEffect(() => {
    refreshGateState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractId]);

  useEffect(() => {
    if (!contractId) return;
    const interval = setInterval(refreshGateState, 4000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractId]);

  useEffect(() => {
    if (!contract?.project_id) return;
    collaboratorsApi.list(contract.project_id).then(setCollaborators).catch(() => {});
  }, [contract?.project_id]);

  const usernameByUserId = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of collaborators) map.set(c.user_id, c.username);
    return map;
  }, [collaborators]);

  const activeGate = active && runState?.hitl_gates.find((g) => g.task_id === active.task_id);
  const isActivePending = activeGate?.status === "pending";
  const activeTaskResult = active && runState?.task_results[active.task_id];
  const activeRevisionCount = activeTaskResult?.history?.length ?? 0;
  const lastTouchedByUsername = activeGate?.resolved_by_user_id
    ? (usernameByUserId.get(activeGate.resolved_by_user_id) ?? null)
    : null;

  return (
    <div className="h-full flex flex-col bg-white/70 backdrop-blur-xl border border-slate-200 rounded-xl overflow-hidden shadow-sm">
      {isEmpty ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 p-6 text-center">
          <div className="w-9 h-9 rounded-xl bg-brand-orange-light text-brand-orange flex items-center justify-center border border-brand-orange/20">
            <Sparkles className="w-4.5 h-4.5" />
          </div>
          <p className="text-xs font-semibold text-slate-500">
            Tables, ER diagrams, and other generated output will appear here automatically as your run produces them.
          </p>
        </div>
      ) : (
        <>
          <ArtifactStageTabs artifacts={orderedArtifacts} activeId={active?.artifact_id ?? null} onSelect={onSelectArtifact} />
          <div className="flex-1 min-h-0 overflow-y-auto">
            {active ? (
              contractId ? (
                <ArtifactHitlWrapper
                  key={active.artifact_id}
                  contractId={contractId}
                  artifact={active}
                  isPending={isActivePending}
                  revisionCount={activeRevisionCount}
                  usernameByUserId={usernameByUserId}
                  onResolved={refreshGateState}
                >
                  <ArtifactRenderer artifact={active} lastTouchedByUsername={lastTouchedByUsername} />
                </ArtifactHitlWrapper>
              ) : (
                <ArtifactRenderer artifact={active} lastTouchedByUsername={lastTouchedByUsername} />
              )
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">No artifact selected.</div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
