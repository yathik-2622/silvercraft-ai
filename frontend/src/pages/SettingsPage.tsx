import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, BadgeDollarSign, BrainCircuit, CheckCircle2, RefreshCw, Save, Search, Settings, Wrench } from 'lucide-react';
import { settingsApi } from '../api/client';
import { useSettings } from '../context/SettingsContext';

const PROVIDERS = [
  { value: 'platform', label: 'Platform Provider', baseUrl: 'Routes to our own configured platform gateway' },
  { value: 'gateway', label: 'Gateway', baseUrl: 'Use backend LLM_BASE_URL' },
  { value: 'custom', label: 'Custom OpenAI-Compatible', baseUrl: 'Your /v1 compatible endpoint' },
  { value: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1' },
  { value: 'openrouter', label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1' },
  { value: 'groq', label: 'Groq', baseUrl: 'https://api.groq.com/openai/v1' },
  { value: 'nvidia', label: 'NVIDIA', baseUrl: 'https://integrate.api.nvidia.com/v1' },
];

const Field: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}> = ({ label, value, onChange, placeholder, type = 'text' }) => (
  <label className="block">
    <span className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</span>
    <input
      type={type}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-[#e67225]/70 focus:ring-2 focus:ring-[#e67225]/15"
    />
  </label>
);

const formatContext = (value: any) => {
  const numeric = Number(value || 0);
  if (!numeric) return '';
  if (numeric >= 1000000) return `${(numeric / 1000000).toFixed(1)}M ctx`;
  if (numeric >= 1000) return `${Math.round(numeric / 1000)}K ctx`;
  return `${numeric} ctx`;
};

export const SettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const { settings, loading, updateSettings } = useSettings();
  const [draft, setDraft] = useState(settings);
  const [models, setModels] = useState<any[]>([]);
  const [modelSearch, setModelSearch] = useState('');
  const [modelFilter, setModelFilter] = useState<'all' | 'free' | 'tools'>('all');
  const [modelStatus, setModelStatus] = useState('Save provider settings to load models.');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  const selectedProvider = PROVIDERS.find((provider) => provider.value === draft.provider) ?? PROVIDERS[0];
  const visibleModels = models.filter((model) => {
    const q = modelSearch.trim().toLowerCase();
    const matchesText = !q || [model.id, model.name, model.description, ...(model.tags ?? [])].join(' ').toLowerCase().includes(q);
    const matchesFilter = modelFilter === 'all' || (modelFilter === 'free' && model.free) || (modelFilter === 'tools' && model.supports_tools);
    return matchesText && matchesFilter;
  });

  const hasProviderRuntime = () => {
    if (draft.provider === 'platform') return true;
    if (draft.provider === 'gateway') return Boolean(draft.baseUrl || draft.apiKey);
    if (draft.provider === 'custom') return Boolean(draft.baseUrl && draft.apiKey);
    if (draft.provider === 'openai') return Boolean(draft.openaiApiKey);
    if (draft.provider === 'openrouter') return Boolean(draft.openrouterApiKey);
    if (draft.provider === 'groq') return Boolean(draft.groqApiKey);
    if (draft.provider === 'nvidia') return Boolean(draft.nvidiaApiKey);
    return false;
  };

  const discoverModels = async () => {
    if (!hasProviderRuntime()) {
      setModels([]);
      setModelStatus('Provide the API key or base URL required for this provider, then save.');
      return;
    }
    setModelStatus('Loading provider models...');
    try {
      const res = await settingsApi.discoverModels();
      setModels(res.data.models ?? []);
      setModelStatus(res.data.error ? res.data.error : `Loaded ${res.data.count ?? 0} models from ${res.data.provider_label}.`);
    } catch (err: any) {
      setModelStatus(err.response?.data?.detail || 'Unable to discover models.');
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    setModels([]);
    setModelStatus('Saving provider settings...');
    try {
      await updateSettings(draft);
      setModelStatus('Loading models for the saved key...');
      const res = await settingsApi.discoverModels();
      setModels(res.data.models ?? []);
      setModelStatus(res.data.error ? res.data.error : `Loaded ${res.data.count ?? 0} models from ${res.data.provider_label}.`);
      const currentDefault = draft.defaultModel;
      if (!currentDefault && res.data.default) {
        setDraft((prev) => ({ ...prev, defaultModel: res.data.default }));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-5">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/dashboard')}
              className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-orange-50 hover:text-[#e67225]"
              title="Back to dashboard"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <div className="flex items-center gap-2 text-sm font-black">
                <Settings className="h-4 w-4 text-[#e67225]" /> LLM Provider Settings
              </div>
              <p className="text-xs text-slate-500">Provider, credentials, base URL, and default model only.</p>
            </div>
          </div>
          <button onClick={saveSettings} disabled={saving || loading} className="flex items-center gap-2 rounded-lg bg-[#e67225] px-3 py-1.5 text-xs font-black text-white disabled:opacity-50">
            <Save className="h-3.5 w-3.5" /> {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <BrainCircuit className="h-5 w-5 text-[#e67225]" />
              <div>
                <h2 className="text-base font-black">LLM Runtime</h2>
                <p className="text-xs text-slate-500">AIGERS-compatible OpenAI provider routing, themed for SilverCraft.</p>
              </div>
            </div>
            <button
              onClick={discoverModels}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-orange-50 hover:text-[#e67225]"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Refresh Models
            </button>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <label className="block">
              <span className="text-xs font-black uppercase tracking-wide text-slate-500">LLM Provider</span>
              <select
                value={draft.provider}
                onChange={(event) => {
                  setDraft((prev) => ({ ...prev, provider: event.target.value }));
                  setModels([]);
                  setModelStatus('Save provider settings to load models.');
                }}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-[#e67225]/70 focus:ring-2 focus:ring-[#e67225]/15"
              >
                {PROVIDERS.map((provider) => <option key={provider.value} value={provider.value}>{provider.label}</option>)}
              </select>
              <span className="mt-1 block text-[11px] text-slate-500">{selectedProvider.baseUrl}</span>
            </label>
            <Field label="Default Model" value={draft.defaultModel} onChange={(value) => setDraft((prev) => ({ ...prev, defaultModel: value }))} placeholder="gpt-4o" />
            {(draft.provider === 'gateway' || draft.provider === 'custom') && (
              <>
                <Field label="Base URL" value={draft.baseUrl} onChange={(value) => setDraft((prev) => ({ ...prev, baseUrl: value }))} placeholder="https://api.openai.com/v1" />
                <Field label="Gateway / Custom API Key" type="password" value={draft.apiKey} onChange={(value) => setDraft((prev) => ({ ...prev, apiKey: value }))} placeholder="Paste local testing key or use backend env" />
              </>
            )}
            {draft.provider === 'openai' && <Field label="OpenAI API Key" type="password" value={draft.openaiApiKey} onChange={(value) => setDraft((prev) => ({ ...prev, openaiApiKey: value }))} placeholder="sk-..." />}
            {draft.provider === 'openrouter' && <Field label="OpenRouter API Key" type="password" value={draft.openrouterApiKey} onChange={(value) => setDraft((prev) => ({ ...prev, openrouterApiKey: value }))} placeholder="sk-or-..." />}
            {draft.provider === 'groq' && <Field label="Groq API Key" type="password" value={draft.groqApiKey} onChange={(value) => setDraft((prev) => ({ ...prev, groqApiKey: value }))} placeholder="gsk_..." />}
            {draft.provider === 'nvidia' && <Field label="NVIDIA API Key" type="password" value={draft.nvidiaApiKey} onChange={(value) => setDraft((prev) => ({ ...prev, nvidiaApiKey: value }))} placeholder="nvapi-..." />}
          </div>

          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs font-black text-slate-700">Available Models</div>
            <p className="mt-1 text-[11px] text-slate-500">{modelStatus || 'Provider model discovery is available after login.'}</p>
            <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  value={modelSearch}
                  onChange={(event) => setModelSearch(event.target.value)}
                  placeholder="Search model name, id, tags..."
                  className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs outline-none focus:border-[#e67225]/60"
                />
              </div>
              <div className="flex rounded-xl border border-slate-200 bg-white p-1">
                {(['all', 'free', 'tools'] as const).map((item) => (
                  <button key={item} type="button" onClick={() => setModelFilter(item)} className={`rounded-lg px-3 py-1.5 text-[11px] font-black capitalize ${modelFilter === item ? 'bg-[#e67225] text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
                    {item}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-3 grid max-h-[520px] gap-2 overflow-auto md:grid-cols-2">
              {visibleModels.map((model) => (
                <button
                  key={model.id}
                  onClick={() => setDraft((prev) => ({ ...prev, defaultModel: model.id }))}
                  className={`rounded-xl border p-3 text-left transition ${draft.defaultModel === model.id ? 'border-[#e67225] bg-orange-50 text-[#e67225]' : 'border-slate-200 bg-white text-slate-700 hover:border-[#e67225]/40'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-xs font-black">{model.name || model.id}</div>
                      <div className="mt-0.5 truncate font-mono text-[10px] text-slate-500">{model.id}</div>
                    </div>
                    {draft.defaultModel === model.id && <CheckCircle2 className="h-4 w-4 shrink-0 text-[#e67225]" />}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {model.free && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-black text-emerald-700">
                        <BadgeDollarSign className="h-3 w-3" /> Free
                      </span>
                    )}
                    {!model.free && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                        Paid
                      </span>
                    )}
                    {model.supports_tools && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                        <Wrench className="h-3 w-3" /> Tools
                      </span>
                    )}
                    {formatContext(model.context_length) && <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold text-slate-500">{formatContext(model.context_length)}</span>}
                    {(model.tags || []).filter((tag: string) => !['Free', 'Tools'].includes(tag)).slice(0, 3).map((tag: string) => (
                      <span key={tag} className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold text-slate-500">{tag}</span>
                    ))}
                  </div>
                  {model.pricing_summary && <div className="mt-2 line-clamp-1 text-[10px] text-slate-500">{model.pricing_summary}</div>}
                  {model.description && <div className="mt-1 line-clamp-2 text-[10px] leading-4 text-slate-400">{model.description}</div>}
                </button>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};
