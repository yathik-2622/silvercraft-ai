import React, { useRef, useState } from "react";
import { ArrowLeft, Database, FileSpreadsheet, FileText, Plus, Rocket, User, X } from "lucide-react";
import { collaboratorsApi, dbConnectionsApi, projectsApi, uploadsApi } from "../api/client";
import { DIALECT_OPTIONS } from "../components/DbConnectionPicker";
import { ModernSelect } from "../components/ModernSelect";
import type { Project, ProjectLayer, RawFile, TargetPlatform } from "../types";
import { useAuth } from "../auth/AuthContext";

const BUSINESS_STANDARDS_EXTENSIONS = ".md,.txt,.pdf,.docx,.pptx";
const SOURCE_FILE_EXTENSIONS = ".csv,.tsv,.xlsx,.xls";

interface Props {
  onCancel: () => void;
  // The second arg carries any source files uploaded here so the project's
  // first chat can pre-attach them to the composer — see
  // WorkspaceContext.openProject/consumePendingAttachedFiles.
  onCreated: (project: Project, uploadedSourceFiles?: RawFile[]) => void;
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

export const CreateProjectCanvas: React.FC<Props> = ({ onCancel, onCreated }) => {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [layer, setLayer] = useState<ProjectLayer>("silver");
  const [targetPlatform, setTargetPlatform] = useState<TargetPlatform>("postgresql");
  const [memberUsername, setMemberUsername] = useState("");
  const [pendingMembers, setPendingMembers] = useState<string[]>([]);
  const [bsFile, setBsFile] = useState<File | null>(null);
  const bsFileInputRef = useRef<HTMLInputElement>(null);
  const [sourceFiles, setSourceFiles] = useState<File[]>([]);
  const sourceFilesInputRef = useRef<HTMLInputElement>(null);
  const [wantsDbConnection, setWantsDbConnection] = useState(false);
  const [dbDialect, setDbDialect] = useState(DIALECT_OPTIONS[0]);
  const [dbHost, setDbHost] = useState("");
  const [dbPort, setDbPort] = useState("");
  const [dbDatabase, setDbDatabase] = useState("");
  const [dbUsername, setDbUsername] = useState("");
  const [dbPassword, setDbPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const addPendingMember = () => {
    const trimmed = memberUsername.trim();
    if (!trimmed || trimmed === user?.username || pendingMembers.includes(trimmed)) return;
    setPendingMembers((prev) => [...prev, trimmed]);
    setMemberUsername("");
  };

  const handleLaunch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !domain.trim()) {
      setError("Project name and domain are both required.");
      return;
    }
    setError(null);
    setWarning(null);
    setIsSubmitting(true);
    try {
      let project = await projectsApi.create(name.trim(), domain.trim(), layer);
      // No POST /projects field for this — reuses the existing owner-only
      // PATCH endpoint right after create, same as editing it later.
      project = await projectsApi.patch(project.project_id, { target_platform: targetPlatform });

      const warnings: string[] = [];
      const failedMembers: string[] = [];
      for (const username of pendingMembers) {
        try {
          await collaboratorsApi.add(project.project_id, username);
        } catch {
          failedMembers.push(username);
        }
      }
      if (failedMembers.length > 0) {
        warnings.push(`couldn't add: ${failedMembers.join(", ")} (check the username exists)`);
      }

      if (bsFile) {
        try {
          await projectsApi.uploadBusinessStandards(project.project_id, bsFile);
          project = { ...project, has_business_standards: true };
        } catch {
          warnings.push("business standards upload failed — you can retry from the project card");
        }
      }
      const uploadedSourceFiles: RawFile[] = [];
      if (sourceFiles.length > 0) {
        const failedUploads: string[] = [];
        for (const file of sourceFiles) {
          try {
            uploadedSourceFiles.push(await uploadsApi.upload(file, project.project_id));
          } catch {
            failedUploads.push(file.name);
          }
        }
        if (failedUploads.length > 0) {
          warnings.push(`source file upload failed for: ${failedUploads.join(", ")} — you can attach them again in chat`);
        }
      }
      if (wantsDbConnection && dbHost.trim() && dbDatabase.trim() && dbUsername.trim()) {
        try {
          await dbConnectionsApi.create(project.project_id, {
            dialect: dbDialect, host: dbHost.trim(), port: Number(dbPort) || 5432,
            database: dbDatabase.trim(), username: dbUsername.trim(), password: dbPassword,
          });
        } catch {
          warnings.push("database connection failed to save — you can add it later");
        }
      }
      if (warnings.length > 0) {
        setWarning(`Project created, but ${warnings.join("; ")}.`);
      }
      onCreated(project, uploadedSourceFiles);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-5 pb-12">
      <div className="flex items-center gap-3 border-b border-slate-200 pb-3.5">
        <button
          onClick={onCancel}
          className="p-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs transition-all border border-slate-200 shadow-2xs flex items-center gap-1.5 cursor-pointer shrink-0"
        >
          <ArrowLeft className="w-4 h-4 text-brand-orange" />
          <span>Projects</span>
        </button>
        <h1 className="text-sm font-black text-slate-900">New Project</h1>
      </div>

      <form onSubmit={handleLaunch} className="space-y-5">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-2xs">
          <div>
            <label className="text-[11px] font-bold text-slate-700 block mb-1">Project Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Lakehouse Foundation Model"
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 focus:border-brand-orange"
            />
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-700 block mb-1">Domain</label>
            <input
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="e.g. Financial & Core Banking"
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 focus:border-brand-orange"
            />
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-700 block mb-2">Layer</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {LAYER_OPTIONS.map((opt) => (
                <button
                  type="button"
                  key={opt.value}
                  onClick={() => setLayer(opt.value)}
                  className={`text-left p-3 rounded-xl border-2 transition-all cursor-pointer ${
                    layer === opt.value
                      ? "border-brand-orange bg-brand-orange-light"
                      : "border-slate-200 hover:border-slate-300 bg-slate-50"
                  }`}
                >
                  <div className={`text-xs font-bold ${layer === opt.value ? "text-brand-orange" : "text-slate-800"}`}>
                    {opt.label}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{opt.hint}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-700 block mb-1">Target Platform</label>
            <ModernSelect value={targetPlatform} onChange={(v) => setTargetPlatform(v as TargetPlatform)} options={TARGET_PLATFORM_OPTIONS} />
            <p className="text-[10px] text-slate-500 mt-1">Determines the SQL dialect used for generated DDL at Stage 4.</p>
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-700 block mb-1">Source Files (optional)</label>
            <p className="text-[10px] text-slate-500 mb-1.5">
              CSV/TSV/XLSX data to model — attached to this project's first chat message automatically, same as
              attaching a file in the composer. You can also connect a live database below; both can be used together.
            </p>
            {sourceFiles.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-1.5">
                {sourceFiles.map((f, idx) => (
                  <span
                    key={`${f.name}-${f.size}-${idx}`}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 font-bold text-[11px]"
                  >
                    <FileSpreadsheet className="w-3 h-3" />
                    {f.name}
                    <button
                      type="button"
                      onClick={() => setSourceFiles((prev) => prev.filter((_, i) => i !== idx))}
                      className="hover:bg-blue-200 rounded p-0.5 cursor-pointer"
                      title="Remove"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <input
              ref={sourceFilesInputRef}
              type="file"
              multiple
              accept={SOURCE_FILE_EXTENSIONS}
              onChange={(e) => {
                const picked = Array.from(e.target.files || []);
                if (picked.length === 0) return;
                setSourceFiles((prev) => [
                  ...prev,
                  ...picked.filter((f) => !prev.some((p) => p.name === f.name && p.size === f.size)),
                ]);
                if (sourceFilesInputRef.current) sourceFilesInputRef.current.value = "";
              }}
              className="w-full text-[11px] text-slate-600 file:mr-2 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700 file:font-bold file:cursor-pointer"
            />
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-700 block mb-1">Business Standards (optional)</label>
            <p className="text-[10px] text-slate-500 mb-1.5">
              Project-scoped rules/standards text, stored whole as run-invariant context for every modeling run in
              this project. You can add or edit this later from the project card.
            </p>
            {bsFile ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-[11px]">
                <FileText className="w-3 h-3" />
                {bsFile.name}
                <button
                  type="button"
                  onClick={() => {
                    setBsFile(null);
                    if (bsFileInputRef.current) bsFileInputRef.current.value = "";
                  }}
                  className="hover:bg-emerald-200 rounded p-0.5 cursor-pointer"
                  title="Remove"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ) : (
              <input
                ref={bsFileInputRef}
                type="file"
                accept={BUSINESS_STANDARDS_EXTENSIONS}
                onChange={(e) => setBsFile(e.target.files?.[0] || null)}
                className="w-full text-[11px] text-slate-600 file:mr-2 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-brand-orange-light file:text-brand-orange file:font-bold file:cursor-pointer"
              />
            )}
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-700 block mb-1">Database Connection (optional)</label>
            <p className="text-[10px] text-slate-500 mb-1.5">
              Lets modeling runs in this project pull live source schema. Only one connection per project — this is
              now the only place to set it up; it can no longer be changed from inside a chat.
            </p>
            {!wantsDbConnection ? (
              <button
                type="button"
                onClick={() => setWantsDbConnection(true)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 hover:border-slate-300 text-slate-600 font-bold text-[11px] cursor-pointer"
              >
                <Database className="w-3 h-3" /> Add a database connection
              </button>
            ) : (
              <div className="space-y-1.5 p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Connection details</span>
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
                  className="w-full flex items-center justify-between px-2.5 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 hover:border-slate-300 transition-colors cursor-pointer"
                />
                <div className="grid grid-cols-3 gap-1.5">
                  <input
                    type="text"
                    value={dbHost}
                    onChange={(e) => setDbHost(e.target.value)}
                    placeholder="Host"
                    className="col-span-2 px-2.5 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800"
                  />
                  <input
                    type="number"
                    value={dbPort}
                    onChange={(e) => setDbPort(e.target.value)}
                    placeholder="Port"
                    className="px-2.5 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800"
                  />
                </div>
                <input
                  type="text"
                  value={dbDatabase}
                  onChange={(e) => setDbDatabase(e.target.value)}
                  placeholder="Database name"
                  className="w-full px-2.5 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800"
                />
                <div className="grid grid-cols-2 gap-1.5">
                  <input
                    type="text"
                    value={dbUsername}
                    onChange={(e) => setDbUsername(e.target.value)}
                    placeholder="Username"
                    className="px-2.5 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800"
                  />
                  <input
                    type="password"
                    value={dbPassword}
                    onChange={(e) => setDbPassword(e.target.value)}
                    placeholder="Password"
                    className="px-2.5 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3 shadow-2xs">
          <label className="text-[11px] font-bold text-slate-700 block">Team Members</label>

          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-[11px] font-semibold text-slate-600">
            <User className="w-3.5 h-3.5 text-brand-orange" />
            <span>{user?.username} (You — Owner)</span>
          </div>

          {pendingMembers.map((m) => (
            <div
              key={m}
              className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-[11px] font-semibold text-slate-600"
            >
              <span>{m}</span>
              <button
                type="button"
                onClick={() => setPendingMembers((prev) => prev.filter((x) => x !== m))}
                className="text-slate-400 hover:text-rose-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={memberUsername}
              onChange={(e) => setMemberUsername(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addPendingMember();
                }
              }}
              placeholder="Add teammate by username"
              className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 focus:border-brand-orange"
            />
            <button
              type="button"
              onClick={addPendingMember}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>

        {error && (
          <div className="text-[11px] font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
            {error}
          </div>
        )}
        {warning && (
          <div className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            {warning}
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-brand-orange hover:bg-brand-orange-hover text-white font-extrabold text-xs shadow-2xs transition-all cursor-pointer disabled:opacity-60"
          >
            <Rocket className="w-3.5 h-3.5" />
            <span>{isSubmitting ? "Creating..." : "Create & Launch"}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
