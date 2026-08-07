import React, { useEffect, useState } from "react";
import { ChevronDown, FileText, LayoutGrid, Table2 } from "lucide-react";
import type { ArtifactKind, ChatArtifact } from "../../types";
import { stageLabel } from "./stageLabels";

interface Props {
  artifacts: ChatArtifact[];
  activeId: string | null;
  onSelect: (id: string) => void;
}

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

function groupByStage(artifacts: ChatArtifact[]): [number, ChatArtifact[]][] {
  const byStage = new Map<number, ChatArtifact[]>();
  for (const a of artifacts) {
    const list = byStage.get(a.stage);
    if (list) list.push(a);
    else byStage.set(a.stage, [a]);
  }
  return Array.from(byStage.entries()).sort(([a], [b]) => a - b);
}

// Two-level navigation for the canvas history: stages are main tabs,
// stacked vertically as an accordion (each one independently collapsible,
// several can be open at once); a stage's own tasks are its sub-tabs,
// shown horizontally only while that stage is expanded. Replaces the old
// flat ArtifactHistoryStrip, which put every task from every stage in one
// undifferentiated horizontal row — fine for a single-stage run, unreadable
// once Source Analysis through PDM are all producing artifacts at once.
export const ArtifactStageTabs: React.FC<Props> = ({ artifacts, activeId, onSelect }) => {
  const grouped = groupByStage(artifacts);
  const activeStage = artifacts.find((a) => a.artifact_id === activeId)?.stage ?? null;
  const [expandedStages, setExpandedStages] = useState<Set<number>>(() => new Set(activeStage !== null ? [activeStage] : []));

  // Keep whichever stage the active artifact belongs to expanded — covers
  // both the initial mount (handled by useState above) and later switches,
  // e.g. a new artifact auto-focusing in a stage the user hadn't opened yet.
  useEffect(() => {
    if (activeStage === null) return;
    setExpandedStages((prev) => (prev.has(activeStage) ? prev : new Set(prev).add(activeStage)));
  }, [activeStage]);

  const toggleStage = (stage: number) => {
    setExpandedStages((prev) => {
      const next = new Set(prev);
      if (next.has(stage)) next.delete(stage);
      else next.add(stage);
      return next;
    });
  };

  if (artifacts.length === 0) return null;

  return (
    <div className="border-b border-slate-200 bg-slate-50/60 shrink-0 max-h-[45%] overflow-y-auto">
      {grouped.map(([stage, stageArtifacts]) => {
        const isOpen = expandedStages.has(stage);
        return (
          <div key={stage} className="border-b border-slate-200/70 last:border-b-0">
            <button
              type="button"
              onClick={() => toggleStage(stage)}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left cursor-pointer hover:bg-slate-100/80 transition-colors"
            >
              <ChevronDown className={`w-3 h-3 text-slate-400 shrink-0 transition-transform ${isOpen ? "" : "-rotate-90"}`} />
              <span className="text-[9px] font-black text-brand-orange bg-brand-orange-light rounded px-1.5 py-0.5 shrink-0">
                Stage {stage}
              </span>
              <span className="text-[11px] font-bold text-slate-700 truncate flex-1 min-w-0">{stageLabel(stage)}</span>
              <span className="text-[9px] font-bold text-slate-400 shrink-0">{stageArtifacts.length}</span>
            </button>
            {isOpen && (
              <div className="flex items-center gap-1.5 overflow-x-auto px-2.5 pb-2 pt-0.5">
                {stageArtifacts.map((a) => (
                  <button
                    key={a.artifact_id}
                    onClick={() => onSelect(a.artifact_id)}
                    className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-bold whitespace-nowrap shrink-0 transition-all cursor-pointer ${
                      a.artifact_id === activeId
                        ? "bg-brand-orange text-white border-brand-orange"
                        : `${KIND_COLOR[a.kind]} hover:brightness-95`
                    }`}
                    title={a.label}
                  >
                    {KIND_ICON[a.kind]}
                    <span className="max-w-[110px] truncate">{a.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
