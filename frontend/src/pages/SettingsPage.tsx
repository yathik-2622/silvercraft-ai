import React from "react";
import { Mail, Settings as SettingsIcon, ShieldCheck, User } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { LlmRuntimeSettingsCard } from "../components/LlmRuntimeSettingsCard";

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

export const SettingsPage: React.FC = () => {
  const { user } = useAuth();

  return (
    <div className="w-full h-[calc(100vh-3.5rem)] overflow-y-auto p-4 md:p-6 space-y-6 bg-slate-100 text-slate-800">
      <main className="max-w-5xl mx-auto space-y-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-2xs space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-orange-light text-brand-orange flex items-center justify-center border border-brand-orange/20 shrink-0">
              <SettingsIcon className="w-5.5 h-5.5" />
            </div>
            <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">Settings</h1>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl shadow-2xs overflow-hidden divide-y divide-slate-100">
          <div className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-brand-orange text-white font-bold text-sm flex items-center justify-center shrink-0">
              {user?.username ? user.username.charAt(0).toUpperCase() : "U"}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-black uppercase tracking-wider text-slate-400">Username</div>
              <div className="text-sm font-bold text-slate-900 truncate">{user?.username}</div>
            </div>
          </div>

          <div className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center shrink-0">
              <Mail className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-black uppercase tracking-wider text-slate-400">Email</div>
              <div className="text-sm font-semibold text-slate-700 truncate">{user?.email || "Not set"}</div>
            </div>
          </div>

          <div className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center shrink-0">
              <User className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-black uppercase tracking-wider text-slate-400">Member Since</div>
              <div className="text-sm font-semibold text-slate-700">{user ? formatDate(user.created_at) : ""}</div>
            </div>
          </div>

          {user?.is_admin && (
            <div className="p-4 flex items-center gap-3 bg-brand-orange-light">
              <div className="w-9 h-9 rounded-full bg-brand-orange text-white flex items-center justify-center shrink-0">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-black uppercase tracking-wider text-brand-orange">Platform Role</div>
                <div className="text-sm font-bold text-slate-900">Administrator</div>
              </div>
            </div>
          )}
        </div>

        <LlmRuntimeSettingsCard />
      </main>
    </div>
  );
};
