import React from "react";
import { LayoutGrid, Table2, FileText, HelpCircle } from "lucide-react";
import type { ArtifactKind, ChatArtifact } from "../../types";

interface Props {
  artifact: ChatArtifact;
  isActive: boolean;
  onClick: () => void;
}

// Same kind->icon/color mapping ArtifactStageTabs.tsx already uses —
// one visual language for "this is an ER diagram/table/markdown output"
// everywhere an artifact is represented, not a second one invented here.
const KIND_ICON: Record<ArtifactKind, React.ReactNode> = {
  "er-diagram": <LayoutGrid className="w-3 h-3" />,
  table: <Table2 className="w-3 h-3" />,
  markdown: <FileText className="w-3 h-3" />,
  keyvalue: <Table2 className="w-3 h-3" />,
};

const KIND_COLOR: Record<ArtifactKind, string> = {
  "er-diagram": "bg-purple-50 text-purple-700 border-purple-200",
  table: "bg-blue-50 text-blue-700 border-blue-200",
  markdown: "bg-emerald-50 text-emerald-700 border-emerald-200",
  keyvalue: "bg-slate-100 text-slate-600 border-slate-200",
};

export const ArtifactChip: React.FC<Props> = ({ artifact, isActive, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] font-bold transition-all cursor-pointer ${
      isActive
        ? "bg-brand-orange text-white border-brand-orange shadow-sm"
        : `${KIND_COLOR[artifact.kind]} hover:brightness-95`
    }`}
    title={`Open ${artifact.label} in the canvas`}
  >
    {KIND_ICON[artifact.kind] ?? <HelpCircle className="w-3 h-3" />}
    <span className="max-w-[180px] truncate">{artifact.label}</span>
  </button>
);

// Missing-artifact placeholder (e.g. the artifact hasn't finished
// hydrating yet, or a stale artifact_id from a since-deleted contract) —
// keeps the chip row from silently dropping a slot mid-layout.
export const ArtifactChipPlaceholder: React.FC = () => (
  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-400">
    <HelpCircle className="w-3 h-3" />
    Loading…
  </span>
);
