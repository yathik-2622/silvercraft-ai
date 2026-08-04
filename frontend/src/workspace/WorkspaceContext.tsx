import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { chatsApi, projectsApi } from "../api/client";
import type { Chat, Project } from "../types";

interface WorkspaceContextValue {
  activeProject: Project | null;
  chats: Chat[];
  activeChatId: string | null;
  isLoadingChats: boolean;
  isDashboardChat: boolean;
  openProject: (project: Project) => void;
  closeProject: () => void;
  openDashboardChat: (chatId: string | null) => void;
  selectChat: (chatId: string | null) => void;
  refreshChats: () => Promise<void>;
  refreshActiveProject: () => Promise<void>;
  renameChat: (chatId: string, title: string) => Promise<void>;
  deleteChat: (chatId: string) => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);

export const WorkspaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [isLoadingChats, setIsLoadingChats] = useState(false);
  // True while viewing a project-less ("dashboard") chat — activeProject is
  // null in that case too, so this is what distinguishes "dashboard chat
  // open" from "dashboard project grid" in App.tsx's routing.
  const [isDashboardChat, setIsDashboardChat] = useState(false);

  const refreshChats = useCallback(async () => {
    if (!activeProject && !isDashboardChat) return;
    setIsLoadingChats(true);
    try {
      setChats(activeProject ? await chatsApi.list(activeProject.project_id) : await chatsApi.list());
    } finally {
      setIsLoadingChats(false);
    }
  }, [activeProject, isDashboardChat]);

  useEffect(() => {
    if (activeProject || isDashboardChat) refreshChats();
  }, [activeProject, isDashboardChat, refreshChats]);

  const openProject = (project: Project) => {
    setActiveProject(project);
    setIsDashboardChat(false);
    setActiveChatId(null);
    setChats([]);
  };

  const closeProject = () => {
    setActiveProject(null);
    setIsDashboardChat(false);
    setActiveChatId(null);
    setChats([]);
  };

  const openDashboardChat = (chatId: string | null) => {
    setActiveProject(null);
    setIsDashboardChat(true);
    setActiveChatId(chatId);
  };

  const selectChat = (chatId: string | null) => setActiveChatId(chatId);

  const refreshActiveProject = async () => {
    if (!activeProject) return;
    setActiveProject(await projectsApi.get(activeProject.project_id));
  };

  const renameChat = async (chatId: string, title: string) => {
    await chatsApi.patch(chatId, { title });
    await refreshChats();
  };

  const deleteChat = async (chatId: string) => {
    await chatsApi.remove(chatId);
    if (activeChatId === chatId) setActiveChatId(null);
    await refreshChats();
  };

  return (
    <WorkspaceContext.Provider
      value={{
        activeProject,
        chats,
        activeChatId,
        isLoadingChats,
        isDashboardChat,
        openProject,
        closeProject,
        openDashboardChat,
        selectChat,
        refreshChats,
        refreshActiveProject,
        renameChat,
        deleteChat,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
};

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return ctx;
}
