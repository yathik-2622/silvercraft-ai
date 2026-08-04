import React, { useEffect, useRef, useState } from "react";
import { Check, CheckCircle2, Sparkles, Upload, X } from "lucide-react";
import { ApiError, skillDraftsApi, skillsApi } from "../../api/client";
import type { HitlMode, Skill, SkillDraftExtracted } from "../../types";

interface Props {
  projectId: string;
  onClose: () => void;
  onCreated?: (skill: Skill) => void;
}

type Phase = "compose" | "processing" | "preview" | "done";

const HITL_OPTIONS: { value: HitlMode; label: string }[] = [
  { value: "auto", label: "Auto — no review needed" },
  { value: "confidence_gated", label: "Confidence-gated — review if uncertain" },
  { value: "mandatory", label: "Mandatory human review" },
];

const ACCEPTED_EXTENSIONS = [".yaml", ".yml", ".md", ".txt"];

export const CreateSkillModal: React.FC<Props> = ({ projectId, onClose, onCreated }) => {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [phase, setPhase] = useState<Phase>("compose");
  const [error, setError] = useState<string | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [form, setForm] = useState<SkillDraftExtracted>({});
  const [toolsText, setToolsText] = useState("");
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [createdSkill, setCreatedSkill] = useState<Skill | null>(null);
  const pollRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(
    () => () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    },
    [],
  );

  const handleFile = (f: File) => {
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ""));
  };

  const pollDraft = (id: string) => {
    setDraftId(id);
    pollRef.current = window.setInterval(async () => {
      try {
        const draft = await skillDraftsApi.get(id);
        if (pollRef.current) window.clearInterval(pollRef.current);
        setForm(draft.extracted);
        setToolsText((draft.extracted.tools || []).join(", "));
        setMissingFields(draft.missing_fields);
        setPhase("preview");
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return; // draft not written yet — keep polling
        if (pollRef.current) window.clearInterval(pollRef.current);
        setError(err instanceof Error ? err.message : "Failed to load draft.");
        setPhase("compose");
      }
    }, 1500);
  };

  const handleEnhance = async () => {
    setError(null);
    if (!title.trim() && !description.trim() && !file) {
      setError("Add a title, description, or file first.");
      return;
    }
    setPhase("processing");
    try {
      if (file) {
        const result = await skillsApi.importFile(projectId, file);
        if (result.status === "uploaded") {
          const skill = await skillsApi.get(result.skill_id);
          setCreatedSkill(skill);
          setPhase("done");
          onCreated?.(skill);
        } else {
          pollDraft(result.draft_id);
        }
        return;
      }
      const rawText = `Title: ${title.trim()}\nDescription: ${description.trim()}`;
      const result = await skillsApi.import(projectId, rawText);
      pollDraft(result.draft_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process skill.");
      setPhase("compose");
    }
  };

  const handleConfirm = async () => {
    if (!draftId) return;
    if (!form.skill_id?.trim() || !form.title?.trim() || !form.purpose?.trim() || !form.prompt?.trim()) {
      setError("Skill ID, Title, Purpose, and Prompt are all required.");
      return;
    }
    setError(null);
    setPhase("processing");
    try {
      // JSON.stringify drops undefined-valued keys entirely — any field the
      // user never touched (still undefined in `form`) would silently never
      // reach the PATCH body, leaving it stuck in missing_fields forever
      // (ADM_supply_missing_fields only clears a field once its KEY is
      // present in the request, not just non-empty). Every field the
      // Normalizer can mark missing needs an explicit value here.
      const merged: SkillDraftExtracted = {
        ...form,
        skill_id: form.skill_id.trim(),
        kind: form.kind || "task",
        title: form.title.trim(),
        purpose: form.purpose.trim(),
        prompt: form.prompt.trim(),
        expected_output: form.expected_output || "",
        stage: form.stage ?? 1,
        modeling_style: form.modeling_style || "canonical",
        hitl_mode: form.hitl_mode || "auto",
        tools: toolsText
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      };
      await skillDraftsApi.patch(draftId, merged);
      const skill = await skillDraftsApi.approve(draftId);
      setCreatedSkill(skill);
      setPhase("done");
      onCreated?.(skill);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create skill.");
      setPhase("preview");
    }
  };

  const updateField = <K extends keyof SkillDraftExtracted>(key: K, value: SkillDraftExtracted[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-2xs flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh]">
        <div className="bg-brand-orange-light border-b border-brand-orange/20 p-4 px-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-brand-orange" />
            <h3 className="font-extrabold text-sm text-slate-900">Create Skill</h3>
          </div>
          <button onClick={onClose} title="Close" className="text-slate-400 hover:text-slate-700 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs overflow-y-auto">
          {phase === "done" && createdSkill ? (
            <div className="text-center space-y-3 py-6">
              <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h4 className="font-extrabold text-slate-900 text-sm">Skill created: {createdSkill.title}</h4>
              <p className="text-slate-500">
                <span className="font-mono">{createdSkill.skill_id}</span> is ready to use with{" "}
                <span className="font-mono">/</span> in any chat in this project.
              </p>
            </div>
          ) : phase === "preview" ? (
            <>
              {missingFields.length > 0 && (
                <div className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                  Fill in: {missingFields.join(", ")}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
                    Skill ID {missingFields.includes("skill_id") && <span className="text-amber-600">*</span>}
                  </label>
                  <input
                    value={form.skill_id || ""}
                    onChange={(e) => updateField("skill_id", e.target.value)}
                    placeholder="e.g. flag_suspicious_emails"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 focus:border-brand-orange"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
                    Kind {missingFields.includes("kind") && <span className="text-amber-600">*</span>}
                  </label>
                  <select
                    value={form.kind || "task"}
                    onChange={(e) => updateField("kind", e.target.value as SkillDraftExtracted["kind"])}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-orange/30"
                  >
                    <option value="task">Task</option>
                    <option value="utility">Utility</option>
                    <option value="workflow">Workflow</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  Title {missingFields.includes("title") && <span className="text-amber-600">*</span>}
                </label>
                <input
                  value={form.title || ""}
                  onChange={(e) => updateField("title", e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 focus:border-brand-orange"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  Purpose {missingFields.includes("purpose") && <span className="text-amber-600">*</span>}
                </label>
                <textarea
                  value={form.purpose || ""}
                  onChange={(e) => updateField("purpose", e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 focus:border-brand-orange resize-none"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  Prompt {missingFields.includes("prompt") && <span className="text-amber-600">*</span>}
                </label>
                <textarea
                  value={form.prompt || ""}
                  onChange={(e) => updateField("prompt", e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 focus:border-brand-orange resize-none"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">Tools (comma-separated)</label>
                <input
                  value={toolsText}
                  onChange={(e) => setToolsText(e.target.value)}
                  placeholder="e.g. profiling_stats, diff"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 focus:border-brand-orange"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">Expected Output</label>
                <textarea
                  value={form.expected_output || ""}
                  onChange={(e) => updateField("expected_output", e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 focus:border-brand-orange resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
                    Stage (1-4) {missingFields.includes("stage") && <span className="text-amber-600">*</span>}
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={4}
                    value={form.stage ?? ""}
                    onChange={(e) => updateField("stage", e.target.value ? Number(e.target.value) : undefined)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 focus:border-brand-orange"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
                    Modeling Style {missingFields.includes("modeling_style") && <span className="text-amber-600">*</span>}
                  </label>
                  <input
                    value={form.modeling_style || ""}
                    onChange={(e) => updateField("modeling_style", e.target.value)}
                    placeholder="canonical"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 focus:border-brand-orange"
                  />
                </div>
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">HITL Mode</label>
                <select
                  value={form.hitl_mode || "auto"}
                  onChange={(e) => updateField("hitl_mode", e.target.value as HitlMode)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-orange/30"
                >
                  {HITL_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {error && (
                <div className="text-[11px] font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
                  {error}
                </div>
              )}
            </>
          ) : (
            <>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  const dropped = e.dataTransfer.files?.[0];
                  if (dropped) handleFile(dropped);
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`rounded-xl border-2 border-dashed p-5 text-center cursor-pointer transition-all ${
                  isDragging ? "border-brand-orange bg-brand-orange-light" : "border-slate-200 hover:border-slate-300 bg-slate-50"
                }`}
              >
                <Upload className="w-5 h-5 text-slate-400 mx-auto mb-1.5" />
                {file ? (
                  <p className="font-bold text-slate-700">{file.name}</p>
                ) : (
                  <>
                    <p className="font-semibold text-slate-600">Drop a skill file, or click to browse</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{ACCEPTED_EXTENSIONS.join(", ")}</p>
                  </>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_EXTENSIONS.join(",")}
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                  }}
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">Title</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Flag Phone Number Columns"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 focus:border-brand-orange"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-bold text-slate-700">Description</label>
                  <button
                    onClick={handleEnhance}
                    disabled={phase === "processing"}
                    title="Enhance with AI"
                    className="p-1 rounded-lg text-brand-orange hover:bg-brand-orange-light cursor-pointer disabled:opacity-50"
                  >
                    <Sparkles className="w-4 h-4" />
                  </button>
                </div>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  placeholder="Describe what this skill should do..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 focus:border-brand-orange resize-none"
                />
              </div>

              {error && (
                <div className="text-[11px] font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
                  {error}
                </div>
              )}

              {phase === "processing" && (
                <p className="text-center text-slate-400 font-semibold">Enhancing with AI...</p>
              )}
            </>
          )}
        </div>

        <div className="p-4 border-t border-slate-100 flex justify-end gap-2 shrink-0">
          {phase === "done" ? (
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-brand-orange hover:bg-brand-orange-hover text-white font-bold text-xs cursor-pointer"
            >
              Done
            </button>
          ) : phase === "preview" ? (
            <>
              <button
                onClick={onClose}
                className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-orange hover:bg-brand-orange-hover text-white font-bold text-xs cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                Confirm & Create
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onClose}
                className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleEnhance}
                disabled={phase === "processing"}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-orange hover:bg-brand-orange-hover text-white font-bold text-xs cursor-pointer disabled:opacity-60"
              >
                <Sparkles className="w-3.5 h-3.5" />
                {phase === "processing" ? "Working..." : "Enhance & Preview"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
