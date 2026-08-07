import React from "react";
import { ProjectChatSidebar } from "../components/ProjectChatSidebar";
import { ChatWorkspace } from "./ChatWorkspace";
import type { Project } from "../types";

interface Props {
  project: Project;
  onBack: () => void;
}

// Project chat's own shell, mirroring QuickChatPage's sidebar + workspace
// pairing but scoped to a single project's chat history instead of the
// dashboard-wide quick-chat list.
export const ProjectChatPage: React.FC<Props> = ({ project, onBack }) => (
  <div className="h-screen flex bg-slate-50">
    <ProjectChatSidebar />
    <div className="flex-1 min-w-0">
      <ChatWorkspace project={project} onBack={onBack} />
    </div>
  </div>
);
