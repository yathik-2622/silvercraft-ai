import React, { useState } from "react";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { AuthPage } from "./pages/AuthPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ChatWorkspace } from "./pages/ChatWorkspace";
import { SkillLibraryPage } from "./pages/SkillLibraryPage";
import { SettingsPage } from "./pages/SettingsPage";
import { AdminPage } from "./pages/AdminPage";
import { SidebarNavigator } from "./components/SidebarNavigator";
import { WorkspaceProvider, useWorkspace } from "./workspace/WorkspaceContext";

type View = "dashboard" | "skills" | "settings" | "admin";

const AuthenticatedShell: React.FC = () => {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [activeView, setActiveView] = useState<View>("dashboard");
  const { activeProject, isDashboardChat, closeProject } = useWorkspace();

  const navigate = (view: View) => {
    closeProject();
    setActiveView(view);
  };

  return (
    <div className="min-h-screen flex font-sans bg-slate-50 text-slate-800">
      <SidebarNavigator
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed((v) => !v)}
        onSelectProjects={() => navigate("dashboard")}
        onSelectSkillLibrary={() => navigate("skills")}
        onSelectSettings={() => navigate("settings")}
        onSelectAdmin={() => navigate("admin")}
        activeView={activeView}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-slate-200 bg-white flex items-center px-5 shrink-0">
          <span className="text-sm font-extrabold text-slate-900">Assisted Data Modelling</span>
        </header>
        <main className="flex-1 overflow-y-auto">
          {activeProject || isDashboardChat ? (
            <ChatWorkspace project={activeProject} onBack={closeProject} />
          ) : activeView === "skills" ? (
            <SkillLibraryPage />
          ) : activeView === "settings" ? (
            <SettingsPage />
          ) : activeView === "admin" ? (
            <AdminPage />
          ) : (
            <DashboardPage />
          )}
        </main>
      </div>
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
