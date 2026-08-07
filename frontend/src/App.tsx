import React, { useState } from "react";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { AuthPage } from "./pages/AuthPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ProjectChatPage } from "./pages/ProjectChatPage";
import { QuickChatPage } from "./pages/QuickChatPage";
import { SkillLibraryPage } from "./pages/SkillLibraryPage";
import { SettingsPage } from "./pages/SettingsPage";
import { AdminPage } from "./pages/AdminPage";
import { DashboardHeader, type TopView } from "./components/DashboardHeader";
import { FloatingQuickChatButton } from "./components/FloatingQuickChatButton";
import { WorkspaceProvider, useWorkspace } from "./workspace/WorkspaceContext";

// Phase 4 navigation rebuild: no more persistent global sidebar around
// every view. Three distinct top-level shells instead:
//   1. Project chat (activeProject set) — ProjectChatPage fills the whole
//      screen: a chat-history sidebar scoped to this project alongside
//      ChatWorkspace.
//   2. Quick Chat (isDashboardChat set, no project) — QuickChatPage fills
//      the whole screen with its own local sidebar, no dashboard header.
//   3. Dashboard family (neither) — DashboardHeader + whichever of
//      Dashboard/Skills/Upload/Settings is active, plus the floating
//      Quick Chat launcher.
const AuthenticatedShell: React.FC = () => {
  const [topView, setTopView] = useState<TopView>("dashboard");
  const { activeProject, isDashboardChat, closeProject, openDashboardChat } = useWorkspace();

  if (activeProject) {
    return <ProjectChatPage project={activeProject} onBack={closeProject} />;
  }

  if (isDashboardChat) {
    return <QuickChatPage onHome={closeProject} />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-800">
      <DashboardHeader
        activeView={topView}
        onSelectDashboard={() => setTopView("dashboard")}
        onSelectSkills={() => setTopView("skills")}
        onSelectAdmin={() => setTopView("admin")}
        onSelectSettings={() => setTopView("settings")}
      />
      <main className="flex-1">
        {topView === "skills" ? (
          <SkillLibraryPage />
        ) : topView === "settings" ? (
          <SettingsPage />
        ) : topView === "admin" ? (
          <AdminPage />
        ) : (
          <DashboardPage />
        )}
      </main>
      <FloatingQuickChatButton onClick={() => openDashboardChat(null)} />
    </div>
  );
};

const AppShell: React.FC = () => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-400 text-xs font-semibold">
        Loading...
      </div>
    );
  }

  return user ? (
    <WorkspaceProvider>
      <AuthenticatedShell />
    </WorkspaceProvider>
  ) : (
    <AuthPage />
  );
};

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}
