import React, { useEffect, useState } from "react";
import { CheckCircle2, Rocket } from "lucide-react";
import { contractsApi } from "../../api/client";
import type { ExecutionContract, RunState } from "../../types";
import { ContractCompletionPanel } from "./ContractCompletionPanel";
import { PlanMarkdownView } from "./PlanMarkdownView";

interface Props {
  contractId: string;
}

const STATUS_LABEL: Record<ExecutionContract["status"], { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-slate-100 text-slate-700 border-slate-200" },
  approved: { label: "Approved", className: "bg-blue-100 text-blue-700 border-blue-200" },
  running: { label: "Running", className: "bg-amber-100 text-amber-700 border-amber-200" },
  paused: { label: "Awaiting Review", className: "bg-amber-100 text-amber-700 border-amber-200" },
  completed: { label: "Completed", className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  failed: { label: "Failed", className: "bg-rose-100 text-rose-700 border-rose-200" },
};

// Single dynamic canvas (Phase 3) — the Plan renders as formatted markdown
// only, no separate graph/node-picker view. An artifact chip click in a
// message always wins and opens ArtifactCanvas directly instead (see
// ChatWorkspace.tsx); this component only ever renders when no artifact is
// actively selected.
export const PlanCanvas: React.FC<Props> = ({ contractId }) => {
  const [contract, setContract] = useState<ExecutionContract | null>(null);
  const [runState, setRunState] = useState<RunState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isApproving, setIsApproving] = useState(false);

  const refresh = () => {
    contractsApi
      .status(contractId)
      .then(({ contract, run_state }) => {
        setContract(contract);
        setRunState(run_state);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Failed to load plan."));
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractId]);

  useEffect(() => {
    if (!contract || !["running", "approved", "paused"].includes(contract.status)) return;
    const interval = setInterval(refresh, 4000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contract?.status]);

  const handleApprove = async () => {
    if (!contract) return;
    setIsApproving(true);
    try {
      await contractsApi.approve(contract.contract_id);
      refresh();
    } finally {
      setIsApproving(false);
    }
  };

  if (loadError) {
    return <div className="h-full flex items-center justify-center text-xs font-semibold text-rose-600">{loadError}</div>;
  }

  if (!contract) {
    return <div className="h-full flex items-center justify-center text-xs text-slate-400">Loading plan...</div>;
  }

  const status = STATUS_LABEL[contract.status];

  return (
    <div className="h-full flex flex-col bg-white/70 backdrop-blur-xl border border-slate-200 rounded-xl overflow-hidden shadow-sm">
      <div className="bg-slate-50/90 border-b border-slate-200 p-3 px-3.5 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <h3 className="font-bold text-sm text-slate-800">Plan</h3>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${status.className}`}>{status.label}</span>
        </div>
        {contract.status === "draft" && (
          <button
            onClick={handleApprove}
            disabled={isApproving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-brand-orange hover:bg-brand-orange-hover text-white font-bold text-xs cursor-pointer disabled:opacity-60"
          >
            <Rocket className="w-3.5 h-3.5" />
            {isApproving ? "Approving..." : "Approve & Run"}
          </button>
        )}
        {contract.status === "completed" && (
          <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-700">
            <CheckCircle2 className="w-3.5 h-3.5" />
            All stages complete
          </span>
        )}
      </div>

      <div className="flex-1 min-h-0">
        <PlanMarkdownView contract={contract} runState={runState} onCommentAdded={refresh} />
      </div>

      {contract.status === "completed" && <ContractCompletionPanel contractId={contract.contract_id} />}
    </div>
  );
};
