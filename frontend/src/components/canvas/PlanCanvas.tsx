import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, { Background, Controls, MarkerType, type Edge, type Node, type ReactFlowInstance } from "reactflow";
import "reactflow/dist/style.css";
import { CheckCircle2, Rocket } from "lucide-react";
import { contractsApi } from "../../api/client";
import type { ExecutionContract, PlannedTask, RunState } from "../../types";
import { TaskNode, type TaskNodeData } from "./TaskNode";
import { TaskDetailPanel } from "./TaskDetailPanel";
import { PlanCommentsPanel } from "./PlanCommentsPanel";
import { ContractCompletionPanel } from "./ContractCompletionPanel";

interface Props {
  contractId: string;
}

const nodeTypes = { task: TaskNode };

const STAGE_LABEL: Record<string, string> = {
  "1": "Stage 1 · Source Analysis",
  "2": "Stage 2 · Conceptual",
  "3": "Stage 3 · Logical",
  "4": "Stage 4 · Physical & STTM",
};

const STATUS_LABEL: Record<ExecutionContract["status"], { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-slate-100 text-slate-700 border-slate-200" },
  approved: { label: "Approved", className: "bg-blue-100 text-blue-700 border-blue-200" },
  running: { label: "Running", className: "bg-amber-100 text-amber-700 border-amber-200" },
  paused: { label: "Awaiting Review", className: "bg-amber-100 text-amber-700 border-amber-200" },
  completed: { label: "Completed", className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  failed: { label: "Failed", className: "bg-rose-100 text-rose-700 border-rose-200" },
};

function buildGraph(contract: ExecutionContract, runState: RunState | null): { nodes: Node<TaskNodeData>[]; edges: Edge[] } {
  const nodes: Node<TaskNodeData>[] = [];
  const edges: Edge[] = [];
  let prevTaskId: string | null = null;

  for (const stageKey of Object.keys(contract.stages).sort()) {
    const tasks = contract.stages[stageKey];
    tasks.forEach((task, idx) => {
      const gate = runState?.hitl_gates.find((g) => g.task_id === task.task_id);
      const result = runState?.task_results[task.task_id];
      const status: TaskNodeData["status"] = gate?.status === "pending" ? "pending_review" : result ? "done" : "not_started";

      nodes.push({
        id: task.task_id,
        type: "task",
        position: { x: (Number(stageKey) - 1) * 280, y: idx * 110 },
        data: { label: task.skill_id, hitlMode: task.hitl_mode, status },
      });

      if (prevTaskId) {
        edges.push({
          id: `${prevTaskId}->${task.task_id}`,
          source: prevTaskId,
          target: task.task_id,
          markerEnd: { type: MarkerType.ArrowClosed },
          animated: status === "not_started",
        });
      }
      prevTaskId = task.task_id;
    });
  }

  return { nodes, edges };
}

export const PlanCanvas: React.FC<Props> = ({ contractId }) => {
  const [contract, setContract] = useState<ExecutionContract | null>(null);
  const [runState, setRunState] = useState<RunState | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isApproving, setIsApproving] = useState(false);
  const reactFlowRef = useRef<ReactFlowInstance | null>(null);

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

  const { nodes, edges } = useMemo(
    () => (contract ? buildGraph(contract, runState) : { nodes: [], edges: [] }),
    [contract, runState],
  );

  useEffect(() => {
    // The `fitView` prop only fits once at mount — it doesn't re-run when
    // `nodes` changes shape/count later (new stage data, a resumed run),
    // which left nodes clipped at the viewport edge. Re-fit imperatively
    // every time the node set actually changes, same pattern as Aigers'
    // WorkflowCanvas.jsx's setCenter effect.
    if (nodes.length === 0) return;
    const id = window.setTimeout(() => reactFlowRef.current?.fitView({ padding: 0.3 }), 30);
    return () => window.clearTimeout(id);
  }, [nodes]);

  const allTasks: PlannedTask[] = useMemo(
    () => (contract ? Object.values(contract.stages).flat() : []),
    [contract],
  );
  const selectedTask = allTasks.find((t) => t.task_id === selectedTaskId) || null;

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
    <div className="h-full flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
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

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 min-h-0">
        <div className="lg:col-span-2 relative min-h-[260px]">
          {Object.keys(contract.stages)
            .sort()
            .map((stageKey) => (
              <div
                key={stageKey}
                className="absolute top-2 text-[10px] font-black uppercase tracking-wider text-slate-400"
                style={{ left: (Number(stageKey) - 1) * 280 + 8 }}
              >
                {STAGE_LABEL[stageKey] || `Stage ${stageKey}`}
              </div>
            ))}
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodeClick={(_, node) => setSelectedTaskId(node.id)}
            onInit={(instance) => {
              reactFlowRef.current = instance;
              instance.fitView({ padding: 0.3 });
            }}
            fitViewOptions={{ padding: 0.3 }}
            minZoom={0.1}
            proOptions={{ hideAttribution: true }}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable
          >
            <Background gap={20} size={1} color="#e2e8f0" />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>

        <div className="border-t lg:border-t-0 lg:border-l border-slate-200 flex flex-col min-h-0">
          {selectedTask ? (
            <div className="flex-1 min-h-0 p-2">
              <TaskDetailPanel
                contractId={contract.contract_id}
                task={selectedTask}
                result={runState?.task_results[selectedTask.task_id]}
                gate={runState?.hitl_gates.find((g) => g.task_id === selectedTask.task_id)}
                onResolved={refresh}
                onClose={() => setSelectedTaskId(null)}
              />
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-[11px] text-slate-400 p-4 text-center">
              Click a task on the graph to see its details.
            </div>
          )}
          <PlanCommentsPanel contractId={contract.contract_id} comments={contract.comments} onCommentAdded={refresh} />
        </div>
      </div>

      {contract.status === "completed" && <ContractCompletionPanel contractId={contract.contract_id} />}
    </div>
  );
};
