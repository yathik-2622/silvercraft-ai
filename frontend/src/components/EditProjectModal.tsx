import React, { useRef, useState } from "react";
import { FileText, Pencil, Users, X } from "lucide-react";
import { projectsApi } from "../api/client";
import type { Project, ProjectLayer, TargetPlatform } from "../types";
import { CollaboratorsModal } from "./CollaboratorsModal";
import { ModernSelect } from "./ModernSelect";

interface Props {
  project: Project;
  onClose: () => void;
  onSaved: () => void;
}

const TARGET_PLATFORM_OPTIONS: { value: TargetPlatform; label: string }[] = [
  { value: "postgresql", label: "PostgreSQL" },
  { value: "snowflake", label: "Snowflake" },
  { value: "sqlserver", label: "SQL Server" },
];

const LAYER_OPTIONS: { value: ProjectLayer; label: string }[] = [
  { value: "silver", label: "Silver — Foundation" },
  { value: "gold", label: "Gold — Product" },
  { value: "bronze", label: "Bronze — Raw" },
];

const BUSINESS_STANDARDS_EXTENSIONS = ".md,.txt,.pdf,.docx,.pptx";

// Every field a project can be created with is editable here by its owner
// EXCEPT the DB connection (managed separately, once, at creation only —
// per the explicit "all apart from source db" scope). Member management
// reuses CollaboratorsModal directly rather than re-implementing it here.
export const EditProjectModal: React.FC<Props> = ({ project, onClose, onSaved }) => {
  const [name, setName] = useState(project.name);
  const [domain, setDomain] = useState(project.domain);
  const [layer, setLayer] = useState<ProjectLayer>(project.layer);
  const [targetPlatform, setTargetPlatform] = useState<TargetPlatform>(project.target_platform || "postgresql");
  const [bsFile, setBsFile] = useState<File | null>(null);
  const bsFileInputRef = useRef<HTMLInputElement>(null);
  const [showCollaborators, setShowCollaborators] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !domain.trim()) {
      setError("Name and domain can't be empty.");
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await projectsApi.patch(project.project_id, {
        name: name.trim(),
        domain: domain.trim(),
        target_platform: targetPlatform,
        layer,
      });
      if (bsFile) {
        try {
          await projectsApi.uploadBusinessStandards(project.project_id, bsFile);
        } catch (err) {
          setError(err instanceof Error ? `Project saved, but business standards upload failed: ${err.message}` : "Project saved, but business standards upload failed.");
          setIsSubmitting(false);
          onSaved();
          return;
        }
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save changes.");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-2xs flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden">
        <div className="bg-brand-orange-light border-b border-brand-orange/20 p-4 px-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Pencil className="w-4 h-4 text-brand-orange" />
            <h3 className="font-extrabold text-sm text-slate-900">Edit Project</h3>
          </div>
          <button onClick={onClose} title="Close" className="text-slate-400 hover:text-slate-700 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-5 space-y-3 text-xs">
          <div>
            <label className="text-[11px] font-bold text-slate-700 block mb-1">Project Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 focus:border-brand-orange"
            />
          </div>
          <div>
            <label className="text-[11px] font-bold text-slate-700 block mb-1">Domain</label>
            <input
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
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
                  className={`text-left p-2.5 rounded-xl border-2 transition-all cursor-pointer ${
                    layer === opt.value
                      ? "border-brand-orange bg-brand-orange-light"
                      : "border-slate-200 hover:border-slate-300 bg-slate-50"
                  }`}
                >
                  <div className={`text-[11px] font-bold ${layer === opt.value ? "text-brand-orange" : "text-slate-800"}`}>
                    {opt.label}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-700 block mb-1">Team Members</label>
            <button
              type="button"
              onClick={() => setShowCollaborators(true)}
              className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 hover:border-slate-300 text-slate-700 font-semibold text-xs cursor-pointer transition-colors"
            >
              <Users className="w-3.5 h-3.5 text-brand-orange" />
              Manage collaborators ({project.collaborator_user_ids.length})
            </button>
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-700 block mb-1">Target Platform</label>
            <ModernSelect value={targetPlatform} onChange={(v) => setTargetPlatform(v as TargetPlatform)} options={TARGET_PLATFORM_OPTIONS} />
            <p className="text-[10px] text-slate-400 mt-1">Determines the SQL dialect used for generated DDL.</p>
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-700 block mb-1">
              {project.has_business_standards ? "Replace Business Standards" : "Add Business Standards"} (optional)
            </label>
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
            <p className="text-[10px] text-slate-400 mt-1">
              {project.has_business_standards
                ? "Uploading a file here replaces the current standards document."
                : "To edit existing standards text directly, use the chip on the project card instead."}
            </p>
          </div>

          {error && (
            <div className="text-[11px] font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl bg-brand-orange hover:bg-brand-orange-hover text-white font-bold text-xs cursor-pointer disabled:opacity-60"
            >
              {isSubmitting ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
      {showCollaborators && (
        <CollaboratorsModal project={project} onClose={() => setShowCollaborators(false)} />
      )}
    </div>
  );
};
