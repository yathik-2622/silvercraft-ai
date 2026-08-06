import React, { useEffect, useRef, useState } from "react";
import { Cpu, KeyRound, Save, Sparkles } from "lucide-react";
import { settingsApi } from "../api/client";
import type { LlmProvider, ModelCatalog, UserSettings, UserSettingsUpdate } from "../types";

const PROVIDERS: { value: LlmProvider; label: string; hint: string }[] = [
  { value: "gateway", label: "Platform Gateway", hint: "Default — uses the platform's own key" },
  { value: "custom", label: "Custom OpenAI Gateway", hint: "Your own base URL + key" },
  { value: "openrouter", label: "OpenRouter", hint: "openrouter.ai catalog" },
  { value: "groq", label: "Groq", hint: "api.groq.com catalog" },
  { value: "nvidia", label: "NVIDIA", hint: "integrate.api.nvidia.com catalog" },
];

const KEY_FIELDS: { key: keyof UserSettingsUpdate; label: string; provider: LlmProvider | null }[] = [
  { key: "api_key", label: "Primary API key (Gateway / Custom)", provider: null },
  { key: "openrouter_api_key", label: "OpenRouter key", provider: "openrouter" },
  { key: "groq_api_key", label: "Groq key", provider: "groq" },
  { key: "nvidia_api_key", label: "NVIDIA key", provider: "nvidia" },
];

const emptyForm: UserSettingsUpdate = {
  provider: "gateway",
  base_url: "",
  default_model: "",
  embedding_model: "",
  api_key: "",
  openrouter_api_key: "",
  groq_api_key: "",
  nvidia_api_key: "",
};

export const LlmRuntimeSettingsCard: React.FC = () => {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [form, setForm] = useState<UserSettingsUpdate>(emptyForm);
  const [catalog, setCatalog] = useState<ModelCatalog | null>(null);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  // Guards the mount-time GET below from clobbering a save that completes
  // first — without this, a GET that happens to resolve after a fast Save
  // (StrictMode's dev double-fire made this trivial to reproduce, but the
  // same race is reachable in production any time the initial fetch is
  // slower than the user) silently reverts the form to pre-save values
  // right after "Settings saved." — confirmed live via a poll of the
  // provider <select>'s value across the save.
  const hasSavedRef = useRef(false);

  const loadCatalog = () => {
    setIsLoadingCatalog(true);
    return settingsApi
      .discoverModels()
      .then(setCatalog)
      .catch(() => {})
      .finally(() => setIsLoadingCatalog(false));
  };

  useEffect(() => {
    settingsApi
      .get()
      .then((s) => {
        if (hasSavedRef.current) return;
        setSettings(s);
        setForm((prev) => ({
          ...prev,
          provider: s.provider || "gateway",
          base_url: s.base_url || "",
          default_model: s.default_model || "",
          embedding_model: s.embedding_model || "",
        }));
      })
      .catch(() => {});
    loadCatalog();
  }, []);

  const field = <K extends keyof UserSettingsUpdate>(key: K, value: UserSettingsUpdate[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    hasSavedRef.current = true;
    setError(null);
    setSavedMessage(null);
    setIsSaving(true);
    try {
      const saved = await settingsApi.update(form);
      setSettings(saved);
      // Clear the raw key inputs — masked previews come back from `saved`
      // instead; we never want to keep a plaintext key sitting in form state.
      setForm((prev) => ({
        ...prev,
        api_key: "",
        openrouter_api_key: "",
        groq_api_key: "",
        nvidia_api_key: "",
      }));
      await loadCatalog();
      setSavedMessage("Settings saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings.");
    } finally {
      setIsSaving(false);
    }
  };

  const models = catalog?.models || [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
            <Sparkles className="w-4 h-4 text-brand-orange" />
            LLM Runtime (BYOK)
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Applies to the Orchestrator's own answers and intent classification only. Modeling execution (Stage
            1-4 TaskWorker runs) always uses the platform's key, regardless of what you configure here.
          </p>

          <div>
            <label className="text-[11px] font-bold text-slate-700 block mb-1">Provider</label>
            <select
              value={form.provider}
              onChange={(e) => field("provider", e.target.value as LlmProvider)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 cursor-pointer"
            >
              {PROVIDERS.map((p) => (
                <option key={p.value} value={p.value} title={p.hint}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-700 block mb-1">Base URL (Custom provider only)</label>
            <input
              value={form.base_url}
              onChange={(e) => field("base_url", e.target.value)}
              placeholder="https://your-openai-compatible-endpoint/v1"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-orange/30"
            />
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-700 block mb-1">Default model</label>
            <select
              value={form.default_model}
              onChange={(e) => field("default_model", e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-orange/30 cursor-pointer"
            >
              <option value="">(provider default)</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <div className="mt-1 text-[10px] text-slate-400">
              {isLoadingCatalog
                ? "Refreshing model catalog..."
                : `${catalog?.count ?? 0} model(s) available for ${catalog?.provider_label || "this provider"}.`}
              {catalog?.fallback && " Live catalog unavailable — showing a fallback list."}
            </div>
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-700 block mb-1">Embedding model</label>
            <input
              value={form.embedding_model}
              onChange={(e) => field("embedding_model", e.target.value)}
              placeholder="text-embedding-3-small"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-orange/30"
            />
            <div className="mt-1 text-[10px] text-slate-400">
              Stored for reference only — search/embedding always uses the platform's model, so results stay
              consistent with what was already indexed.
            </div>
          </div>
        </section>

        <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
            <KeyRound className="w-4 h-4 text-brand-orange" />
            Provider Keys
          </div>
          <div className="space-y-3">
            {KEY_FIELDS.map(({ key, label }) => (
              <div key={key}>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">{label}</label>
                <input
                  type="password"
                  value={form[key] as string}
                  onChange={(e) => field(key, e.target.value)}
                  placeholder={`Enter ${label.toLowerCase()}`}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-orange/30"
                />
                {settings?.[`${key}_masked` as keyof UserSettings] && !form[key] && (
                  <div className="mt-1 text-[10px] text-slate-400">
                    Configured: {settings[`${key}_masked` as keyof UserSettings] as string}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs">
        <div className="flex items-center gap-2 text-sm font-extrabold text-slate-900 mb-3">
          <Cpu className="w-4 h-4 text-brand-orange" />
          Model Catalog Preview
        </div>
        {models.length === 0 ? (
          <p className="text-[11px] text-slate-400">No models to preview yet.</p>
        ) : (
          <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
            {models.slice(0, 18).map((m) => (
              <div key={m.id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-bold text-slate-800 truncate">{m.name}</div>
                  {m.free && (
                    <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 border border-emerald-200">
                      Free
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-slate-400 uppercase tracking-wider mt-0.5">{m.provider}</div>
                {m.context_length && <div className="text-[10px] text-slate-500 mt-1">Context: {m.context_length}</div>}
                {m.description && <div className="text-[10px] text-slate-500 mt-1 line-clamp-2">{m.description}</div>}
              </div>
            ))}
          </div>
        )}
      </section>

      {error && (
        <div className="text-[11px] font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
          {error}
        </div>
      )}
      {savedMessage && (
        <div className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
          {savedMessage}
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-brand-orange hover:bg-brand-orange-hover text-white font-extrabold text-xs shadow-2xs transition-all cursor-pointer disabled:opacity-60"
        >
          <Save className="w-3.5 h-3.5" />
          {isSaving ? "Saving..." : "Save Settings"}
        </button>
      </div>
    </div>
  );
};
