import React, { useEffect, useRef } from "react";
import { LayoutGrid, Table2, FileText } from "lucide-react";
import type { ArtifactKind, ChatArtifact } from "../../types";

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

export const ArtifactHistoryStrip: React.FC<Props> = ({ artifacts, activeId, onSelect }) => {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", inline: "end" });
  }, [artifacts.length]);

  if (artifacts.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto px-2 py-1.5 border-b border-slate-200 bg-slate-50/60 shrink-0">
      {artifacts.map((a) => (
        <button
          key={a.artifact_id}
          onClick={() => onSelect(a.artifact_id)}
          className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-bold whitespace-nowrap shrink-0 transition-all cursor-pointer ${
            a.artifact_id === activeId
              ? "bg-brand-orange text-white border-brand-orange"
              : `${KIND_COLOR[a.kind]} hover:brightness-95`
          }`}
          title={`${a.label} (stage ${a.stage})`}
        >
          {KIND_ICON[a.kind]}
          <span className="max-w-[110px] truncate">{a.label}</span>
        </button>
      ))}
      <div ref={endRef} />
    </div>
  );
};
