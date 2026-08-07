import React from "react";
import { User } from "lucide-react";
import type { ChatArtifact } from "../../types";
import { TaskOutputRenderer } from "./TaskOutputRenderer";
import { ArtifactErDiagram } from "./renderers/ArtifactErDiagram";
import { ArtifactMarkdown } from "./renderers/ArtifactMarkdown";
import { stageLabel } from "./stageLabels";

interface Props {
  artifact: ChatArtifact;
  // Resolved username of whoever last approved/edited this artifact's HITL
  // gate — undefined when nobody's touched it yet (still system-generated,
  // revision 0) or the username couldn't be resolved. Contracts are shared
  // per-project now, so this is real "who on the team last acted on this"
  // information, not just "me."
  lastTouchedByUsername?: string | null;
}

// "Stage N" then the task's own title as a sub-header above whatever
// renderer handles the actual output — so a task's place in the workflow
// is always visible, not just its raw output (matches how the workflow
// skill's own stage/step structure is presented everywhere else).
const ArtifactHeader: React.FC<{ artifact: ChatArtifact; lastTouchedByUsername?: string | null }> = ({
  artifact,
  lastTouchedByUsername,
}) => (
  <div className="px-3 pt-3 pb-1">
    <div className="flex items-center justify-between gap-2 flex-wrap">
      <div className="text-[10px] font-black uppercase tracking-wider text-brand-orange">
        Stage {artifact.stage} · {stageLabel(artifact.stage)}
      </div>
      {lastTouchedByUsername && (
        <div className="flex items-center gap-1 text-[10px] font-semibold text-slate-400">
          <User className="w-2.5 h-2.5" />
          Last touched by <span className="text-slate-600">{lastTouchedByUsername}</span>
        </div>
      )}
    </div>
    <h3 className="text-sm font-extrabold text-slate-900 mt-0.5">{artifact.label}</h3>
  </div>
);

export const ArtifactRenderer: React.FC<Props> = ({ artifact, lastTouchedByUsername }) => {
  switch (artifact.kind) {
    case "er-diagram":
      return (
        <div className="h-full flex flex-col">
          <ArtifactHeader artifact={artifact} lastTouchedByUsername={lastTouchedByUsername} />
          <div className="flex-1 min-h-0">
            <ArtifactErDiagram output={artifact.output} />
          </div>
        </div>
      );
    case "markdown": {
      const text =
        typeof artifact.output === "string"
          ? artifact.output
          : ((artifact.output as { raw_text?: string } | null)?.raw_text ?? "");
      return (
        <div>
          <ArtifactHeader artifact={artifact} lastTouchedByUsername={lastTouchedByUsername} />
          <div className="p-3 pt-1">
            <ArtifactMarkdown text={text} />
          </div>
        </div>
      );
    }
    case "table":
    case "keyvalue":
    default:
      return (
        <div>
          <ArtifactHeader artifact={artifact} lastTouchedByUsername={lastTouchedByUsername} />
          <div className="p-3 pt-1">
            <TaskOutputRenderer output={artifact.output ?? {}} />
          </div>
        </div>
      );
  }
};
