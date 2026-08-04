import React from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { CheckCircle2, Circle, Lock, ShieldAlert } from "lucide-react";
import type { HitlMode } from "../../types";

export interface TaskNodeData {
  label: string;
  hitlMode: HitlMode;
  status: "not_started" | "done" | "pending_review";
}

const HITL_BADGE: Record<HitlMode, { label: string; className: string }> = {
  auto: { label: "Auto", className: "bg-slate-100 text-slate-600 border-slate-200" },
  confidence_gated: { label: "Confidence-gated", className: "bg-amber-100 text-amber-700 border-amber-200" },
  mandatory: { label: "Mandatory review", className: "bg-rose-100 text-rose-700 border-rose-200" },
};

const STATUS_ICON: Record<TaskNodeData["status"], React.ReactNode> = {
  not_started: <Circle className="w-3.5 h-3.5 text-slate-300" />,
  done: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />,
  pending_review: <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />,
};

export const TaskNode: React.FC<NodeProps<TaskNodeData>> = ({ data, selected }) => {
  const hitl = HITL_BADGE[data.hitlMode];
  return (
    <div
      className={`w-56 rounded-xl border-2 bg-white shadow-sm px-3 py-2.5 space-y-1.5 transition-all ${
        selected ? "border-brand-orange shadow-md" : "border-slate-200"
      }`}
    >
      <Handle type="target" position={Position.Left} className="!bg-slate-300 !w-2 !h-2" />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-slate-800 truncate">{data.label}</span>
        {STATUS_ICON[data.status]}
      </div>
      <span className={`inline-block text-[9px] font-bold px-1.5 py-0.5 rounded border ${hitl.className}`}>
        {data.hitlMode === "mandatory" && <Lock className="w-2.5 h-2.5 inline mr-0.5 -mt-0.5" />}
        {hitl.label}
      </span>
      <Handle type="source" position={Position.Right} className="!bg-slate-300 !w-2 !h-2" />
    </div>
  );
};
