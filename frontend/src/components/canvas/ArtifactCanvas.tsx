import React from "react";
import { Sparkles } from "lucide-react";
import type { ChatArtifact } from "../../types";
import { ArtifactHistoryStrip } from "./ArtifactHistoryStrip";
import { ArtifactRenderer } from "./ArtifactRendererRegistry";

interface Props {
  artifacts: ChatArtifact[];
  activeArtifactId: string | null;
  onSelectArtifact: (id: string) => void;
  isEmpty: boolean;
}

export const ArtifactCanvas: React.FC<Props> = ({ artifacts, activeArtifactId, onSelectArtifact, isEmpty }) => {
  const active = artifacts.find((a) => a.artifact_id === activeArtifactId) ?? artifacts[artifacts.length - 1];

  return (
    <div className="h-full flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
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
          <ArtifactHistoryStrip artifacts={artifacts} activeId={active?.artifact_id ?? null} onSelect={onSelectArtifact} />
          <div className="flex-1 min-h-0 overflow-y-auto">
            {active ? (
              <ArtifactRenderer artifact={active} />
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">No artifact selected.</div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
