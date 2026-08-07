import React, { useState } from "react";
import { Database, FolderPlus, Rocket, X } from "lucide-react";
import { DIALECT_OPTIONS } from "./DbConnectionPicker";
import { ModernSelect } from "./ModernSelect";
import type { CreateProjectPrompt, ProjectLayer, TargetPlatform } from "../types";

export interface QuickChatDbConnectionDraft {
  dialect: string;
  host: string;
  port: string;
  database: string;
  username: string;
  password: string;
}

interface Props {
  prompt: CreateProjectPrompt;
  isSubmitting: boolean;
  error: string | null;
  onCreate: (
    name: string,
    domain: string,
    layer: ProjectLayer,
    targetPlatform: TargetPlatform,
    dbConnection: QuickChatDbConnectionDraft | null,
  ) => void;
}

const LAYER_OPTIONS: { value: ProjectLayer; label: string; hint: string }[] = [
  { value: "silver", label: "Silver — Foundation", hint: "Cleansed, normalized enterprise layer" },
  { value: "gold", label: "Gold — Product", hint: "Curated marts for analytics delivery" },
  { value: "bronze", label: "Bronze — Raw", hint: "Landed source data, minimal transformation" },
];

const TARGET_PLATFORM_OPTIONS: { value: TargetPlatform; label: string }[] = [
  { value: "postgresql", label: "PostgreSQL" },
  { value: "snowflake", label: "Snowflake" },
  { value: "sqlserver", label: "SQL Server" },
];

// Full field set, matching CreateProjectCanvas (the dashboard's own "New
// Project" page) — this inline chat card used to only ask for
// Name/Domain/Layer, leaving Target Platform stuck on its default and no
// way to attach a source DB from Quick Chat at all. Business standards
// upload and team members stay dashboard-only (this card is meant to stay
// a quick, in-conversation step, not a full replacement for that page).
export const CreateProjectPromptCard: React.FC<Props> = ({ prompt, isSubmitting, error, onCreate }) => {
  const [name, setName] = useState("");
  const [domain, setDomain] = useState(prompt.suggested_domain || "");
  const [layer, setLayer] = useState<ProjectLayer>(prompt.suggested_layer || "silver");
  const [targetPlatform, setTargetPlatform] = useState<TargetPlatform>("postgresql");
  const [wantsDbConnection, setWantsDbConnection] = useState(false);
  const [dbDialect, setDbDialect] = useState(DIALECT_OPTIONS[0]);
  const [dbHost, setDbHost] = useState("");
  const [dbPort, setDbPort] = useState("");
  const [dbDatabase, setDbDatabase] = useState("");
  const [dbUsername, setDbUsername] = useState("");
  const [dbPassword, setDbPassword] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !domain.trim()) return;
    const dbConnection =
      wantsDbConnection && dbHost.trim() && dbDatabase.trim() && dbUsername.trim()
        ? { dialect: dbDialect, host: dbHost.trim(), port: dbPort.trim(), database: dbDatabase.trim(), username: dbUsername.trim(), password: dbPassword }
        : null;
    onCreate(name.trim(), domain.trim(), layer, targetPlatform, dbConnection);
  };

  return (
    <div className="ml-9.5 max-w-[88%] bg-white border-2 border-dashed border-brand-orange rounded-2xl p-4 space-y-3 shadow-2xs">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-brand-orange-light text-brand-orange flex items-center justify-center shrink-0 border border-brand-orange/20">
          <FolderPlus className="w-4 h-4" />
        </div>
        <span className="text-xs font-extrabold text-slate-900">Create a project to continue</span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-2.5">
        <div>
          <label className="text-[10px] font-bold text-slate-600 block mb-1">Project Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Lakehouse Foundation Model"
            autoFocus
            className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 focus:border-brand-orange"
          />
        </div>
        <div>
          <label className="text-[10px] font-bold text-slate-600 block mb-1">Domain</label>
          <input
            type="text"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="e.g. Retail & E-Commerce"
            className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 focus:border-brand-orange"
          />
        </div>

        <div>
          <label className="text-[10px] font-bold text-slate-600 block mb-1">Layer</label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
            {LAYER_OPTIONS.map((opt) => (
              <button
                type="button"
                key={opt.value}
                onClick={() => setLayer(opt.value)}
                className={`text-left p-2 rounded-lg border-2 transition-all cursor-pointer ${
                  layer === opt.value ? "border-brand-orange bg-brand-orange-light" : "border-slate-200 hover:border-slate-300 bg-slate-50"
                }`}
              >
                <div className={`text-[10px] font-bold ${layer === opt.value ? "text-brand-orange" : "text-slate-800"}`}>{opt.label}</div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-[10px] font-bold text-slate-600 block mb-1">Target Platform</label>
          <div className="grid grid-cols-3 gap-1.5">
            {TARGET_PLATFORM_OPTIONS.map((opt) => (
              <button
                type="button"
                key={opt.value}
                onClick={() => setTargetPlatform(opt.value)}
                className={`text-center p-2 rounded-lg border-2 transition-all cursor-pointer ${
                  targetPlatform === opt.value ? "border-brand-orange bg-brand-orange-light" : "border-slate-200 hover:border-slate-300 bg-slate-50"
                }`}
              >
                <div className={`text-[10px] font-bold ${targetPlatform === opt.value ? "text-brand-orange" : "text-slate-800"}`}>{opt.label}</div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-[10px] font-bold text-slate-600 block mb-1">Database Connection (optional)</label>
          {!wantsDbConnection ? (
            <button
              type="button"
              onClick={() => setWantsDbConnection(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 hover:border-slate-300 text-slate-600 font-bold text-[10px] cursor-pointer"
            >
              <Database className="w-3 h-3" /> Add a database connection
            </button>
          ) : (
            <div className="space-y-1.5 p-2.5 rounded-lg bg-slate-50 border border-slate-200">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Connection details</span>
                <button
                  type="button"
                  onClick={() => {
                    setWantsDbConnection(false);
                    setDbHost("");
                    setDbPort("");
                    setDbDatabase("");
                    setDbUsername("");
                    setDbPassword("");
                  }}
                  className="text-slate-400 hover:text-rose-600 cursor-pointer"
                  title="Remove"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <ModernSelect
                value={dbDialect}
                onChange={setDbDialect}
                options={DIALECT_OPTIONS.map((d) => ({ value: d, label: d }))}
                className="w-full flex items-center justify-between px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-800 hover:border-slate-300 transition-colors cursor-pointer"
              />
              <div className="grid grid-cols-3 gap-1.5">
                <input
                  type="text"
                  value={dbHost}
                  onChange={(e) => setDbHost(e.target.value)}
                  placeholder="Host, e.g. db.internal.co"
                  className="col-span-2 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-800"
                />
                <input
                  type="number"
                  value={dbPort}
                  onChange={(e) => setDbPort(e.target.value)}
                  placeholder="Port"
                  className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-800"
                />
              </div>
              <input
                type="text"
                value={dbDatabase}
                onChange={(e) => setDbDatabase(e.target.value)}
                placeholder="Database name, e.g. analytics_prod"
                className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-800"
              />
              <div className="grid grid-cols-2 gap-1.5">
                <input
                  type="text"
                  value={dbUsername}
                  onChange={(e) => setDbUsername(e.target.value)}
                  placeholder="Username"
                  className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-800"
                />
                <input
                  type="password"
                  value={dbPassword}
                  onChange={(e) => setDbPassword(e.target.value)}
                  placeholder="Password"
                  className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-800"
                />
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="text-[10px] font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1.5">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting || !name.trim() || !domain.trim()}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-brand-orange hover:bg-brand-orange-hover disabled:opacity-50 text-white font-extrabold text-xs shadow-2xs transition-all cursor-pointer"
        >
          <Rocket className="w-3.5 h-3.5" />
          <span>{isSubmitting ? "Creating..." : "Create Project & Continue"}</span>
        </button>
      </form>
    </div>
  );
};
