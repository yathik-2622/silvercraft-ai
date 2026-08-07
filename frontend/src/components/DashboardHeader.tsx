import React, { useState } from "react";
import { motion } from "motion/react";
import { BookOpen, ChevronDown, Home, LogOut, Settings, ShieldCheck } from "lucide-react";
import { useAuth } from "../auth/AuthContext";

export type TopView = "dashboard" | "skills" | "settings" | "admin";

interface Props {
  activeView: TopView;
  onSelectDashboard: () => void;
  onSelectSkills: () => void;
  onSelectAdmin: () => void;
  onSelectSettings: () => void;
}

// The dashboard's only chrome (Phase 4) — replaces the old always-on global
// sidebar. Two icons on the right (Upload, only for admins; Skills), each
// labeled so the icon's purpose is never ambiguous, plus a profile menu
// carrying what used to live in the sidebar footer (Settings, Sign Out).
export const DashboardHeader: React.FC<Props> = ({
  activeView,
  onSelectDashboard,
  onSelectSkills,
  onSelectAdmin,
  onSelectSettings,
}) => {
  const { user, logout } = useAuth();
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-5">
        <button
          type="button"
          onClick={onSelectDashboard}
          className="flex items-center gap-2.5 cursor-pointer"
          title="Home"
        >
          <div className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-brand-orange to-brand-orange-hover text-white shadow-2xs">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div className="text-left">
            <div className="text-xs font-extrabold leading-none tracking-tight text-slate-900">Assisted Data Modelling</div>
            <div className="text-[9px] font-semibold uppercase tracking-widest text-slate-400 mt-0.5">Enterprise Studio</div>
          </div>
        </button>

        <div className="flex items-center gap-1.5">
          {activeView !== "dashboard" && (
            <button
              type="button"
              onClick={onSelectDashboard}
              title="Home"
              className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors cursor-pointer font-bold text-xs"
            >
              <Home className="h-4 w-4" />
              <span className="hidden sm:inline">Home</span>
            </button>
          )}
          {user?.is_admin && (
            <button
              type="button"
              onClick={onSelectAdmin}
              title="Upload — Knowledge Base"
              className={`p-2 rounded-xl transition-colors cursor-pointer ${
                activeView === "admin" ? "bg-brand-orange-light text-brand-orange" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              <ShieldCheck className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={onSelectSkills}
            title="Skill Repository"
            className={`p-2 rounded-xl transition-colors cursor-pointer ${
              activeView === "skills" ? "bg-brand-orange-light text-brand-orange" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            <BookOpen className="h-4 w-4" />
          </button>

          <div className="h-5 w-px bg-slate-200 mx-1" />

          <div className="relative">
            <motion.button
              type="button"
              onClick={() => setShowProfileMenu((v) => !v)}
              whileTap={{ scale: 0.96 }}
              className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 pl-1 pr-2 py-1 hover:bg-slate-100 transition-colors cursor-pointer"
              title={user?.username}
            >
              <div className="w-6 h-6 rounded-full bg-brand-orange text-white font-bold text-[10px] flex items-center justify-center shrink-0">
                {user?.username ? user.username.charAt(0).toUpperCase() : "U"}
              </div>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </motion.button>

            {showProfileMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowProfileMenu(false)} />
                <div className="absolute right-0 top-full mt-2 w-52 bg-white rounded-2xl shadow-xl border border-slate-200 z-50 overflow-hidden text-xs divide-y divide-slate-100">
                  <div className="p-3 bg-slate-50">
                    <div className="font-bold text-slate-900 truncate">{user?.username}</div>
                    {user?.is_admin && <div className="text-[10px] text-brand-orange font-bold mt-0.5">Upload Access</div>}
                  </div>
                  <div className="p-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setShowProfileMenu(false);
                        onSelectSettings();
                      }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors cursor-pointer font-medium text-xs ${
                        activeView === "settings" ? "bg-slate-100 text-slate-900 font-bold" : "text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      <Settings className="w-4 h-4 text-slate-500" />
                      <span>Settings</span>
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowProfileMenu(false);
                      logout();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer font-bold text-xs"
                  >
                    <LogOut className="w-4 h-4 text-rose-600" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
