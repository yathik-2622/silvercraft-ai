import React from "react";
import { QuickChatSidebar } from "../components/QuickChatSidebar";
import { ChatWorkspace } from "./ChatWorkspace";

interface Props {
  onHome: () => void;
}

// Standalone Quick Chat surface (Phase 4) — full page, no dashboard header,
// no Upload/Skills icons. Just chat history (QuickChatSidebar) + the same
// project-less chat mode ChatWorkspace already supported. Complex requests
// still graduate into a real project via ChatWorkspace's own
// CreateProjectPromptCard flow, which calls openProject() and transitions
// out of this page automatically.
export const QuickChatPage: React.FC<Props> = ({ onHome }) => (
  <div className="h-screen flex bg-slate-50">
    <QuickChatSidebar onHome={onHome} />
    <div className="flex-1 min-w-0">
      <ChatWorkspace project={null} onBack={onHome} />
    </div>
  </div>
);
