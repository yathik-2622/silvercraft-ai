import React from "react";
import type { ChatArtifact } from "../../types";
import { TaskOutputRenderer } from "./TaskOutputRenderer";
import { ArtifactErDiagram } from "./renderers/ArtifactErDiagram";
import { ArtifactMarkdown } from "./renderers/ArtifactMarkdown";

interface Props {
  artifact: ChatArtifact;
}

export const ArtifactRenderer: React.FC<Props> = ({ artifact }) => {
  switch (artifact.kind) {
    case "er-diagram":
      return <ArtifactErDiagram output={artifact.output} />;
    case "markdown": {
      const text =
        typeof artifact.output === "string"
          ? artifact.output
          : ((artifact.output as { raw_text?: string } | null)?.raw_text ?? "");
      return <ArtifactMarkdown text={text} />;
    }
    case "table":
    case "keyvalue":
    default:
      return (
        <div className="p-3">
          <TaskOutputRenderer output={artifact.output ?? {}} />
        </div>
      );
  }
};
