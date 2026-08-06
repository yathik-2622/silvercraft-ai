import React, { useEffect, useRef, useState } from "react";
import { Eye, FileText, Pencil, Save, Upload, X } from "lucide-react";
import { projectsApi } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import type { BusinessStandardsDocument, Project } from "../types";
import { ArtifactMarkdown } from "./canvas/renderers/ArtifactMarkdown";

interface Props {
  project: Project;
  onClose: () => void;
  onSaved: () => void;
}

const BUSINESS_STANDARDS_EXTENSIONS = ".md,.txt,.pdf,.docx,.pptx";

export const BusinessStandardsModal: React.FC<Props> = ({ project, onClose, onSaved }) => {
  const { user } = useAuth();
  const isOwner = user?.user_id === project.owner_user_id;

  const [doc, setDoc] = useState<BusinessStandardsDocument | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<"preview" | "edit">("preview");
  const [editText, setEditText] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    projectsApi
      .getBusinessStandards(project.project_id)
      .then((d) => {
        setDoc(d);
        setEditText(d.full_text);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Failed to load business standards."));
  }, [project.project_id]);

  const handleSaveText = async () => {
    if (!editText.trim()) {
      setSaveError("Text can't be empty.");
      return;
    }
    setSaveError(null);
    setIsSaving(true);
    try {
      await projectsApi.editBusinessStandards(project.project_id, editText.trim());
      const refreshed = await projectsApi.getBusinessStandards(project.project_id);
      setDoc(refreshed);
      setMode("preview");
      onSaved();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save changes.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleReplaceFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSaveError(null);
    setIsSaving(true);
    try {
      await projectsApi.uploadBusinessStandards(project.project_id, file);
      const refreshed = await projectsApi.getBusinessStandards(project.project_id);
      setDoc(refreshed);
      setEditText(refreshed.full_text);
      setMode("preview");
      onSaved();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to upload file.");
    } finally {
      setIsSaving(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-2xs flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        <div className="bg-brand-orange-light border-b border-brand-orange/20 p-4 px-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="w-4 h-4 text-brand-orange shrink-0" />
            <div className="min-w-0">
              <h3 className="font-extrabold text-sm text-slate-900 truncate">Business Standards</h3>
              <p className="text-[10px] text-slate-500 truncate">{project.name}</p>
            </div>
          </div>
          <button onClick={onClose} title="Close" className="text-slate-400 hover:text-slate-700 cursor-pointer shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {isOwner && doc && (
          <div className="flex items-center gap-1.5 px-4 pt-3 shrink-0">
            <button
              type="button"
              onClick={() => setMode("preview")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer transition-all ${
                mode === "preview" ? "bg-brand-orange text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              <Eye className="w-3 h-3" />
              Preview
            </button>
            <button
              type="button"
              onClick={() => setMode("edit")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer transition-all ${
                mode === "edit" ? "bg-brand-orange text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              <Pencil className="w-3 h-3" />
              Edit
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all"
            >
              <Upload className="w-3 h-3" />
              Replace with file...
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept={BUSINESS_STANDARDS_EXTENSIONS}
              onChange={handleReplaceFile}
              className="hidden"
            />
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-5">
          {loadError ? (
            <p className="text-xs font-semibold text-rose-600">{loadError}</p>
          ) : !doc ? (
            <p className="text-xs text-slate-400">Loading...</p>
          ) : mode === "edit" && isOwner ? (
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              rows={16}
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 focus:border-brand-orange"
            />
          ) : (
            <ArtifactMarkdown text={doc.full_text} />
          )}
        </div>

        {saveError && (
          <div className="mx-5 mb-2 text-[11px] font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 shrink-0">
            {saveError}
          </div>
        )}

        {isOwner && doc && mode === "edit" && (
          <div className="p-4 border-t border-slate-100 flex justify-end gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setEditText(doc.full_text);
                setMode("preview");
              }}
              className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveText}
              disabled={isSaving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-orange hover:bg-brand-orange-hover text-white font-bold text-xs cursor-pointer disabled:opacity-60"
            >
              <Save className="w-3.5 h-3.5" />
              {isSaving ? "Saving..." : "Save"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
