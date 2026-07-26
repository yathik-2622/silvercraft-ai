import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, BrainCircuit, RefreshCw, Save, Settings } from 'lucide-react';
import { settingsApi } from '../api/client';
import { useSettings } from '../context/SettingsContext';

const PROVIDERS = [
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

export const SettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const { settings, loading, updateSettings } = useSettings();
  const [models, setModels] = useState<any[]>([]);
  const [modelStatus, setModelStatus] = useState('');

  const selectedProvider = PROVIDERS.find((provider) => provider.value === settings.provider) ?? PROVIDERS[0];

  const discoverModels = async () => {
    setModelStatus('Loading provider models...');
    try {
      const res = await settingsApi.discoverModels();
      setModels(res.data.models ?? []);
      setModelStatus(res.data.fallback ? `Provider discovery failed; showing fallback models. ${res.data.error ?? ''}` : `Loaded ${res.data.count ?? 0} models from ${res.data.provider_label}.`);
    } catch (err: any) {
      setModelStatus(err.response?.data?.detail || 'Unable to discover models.');
    }
  };

  useEffect(() => {
    if (!loading) discoverModels();
  }, [loading, settings.provider]);

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
          <div className="flex items-center gap-2 rounded-lg bg-[#e67225]/10 px-3 py-1.5 text-xs font-black text-[#e67225]">
            <Save className="h-3.5 w-3.5" /> Auto-saved
          </div>
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
                value={settings.provider}
                onChange={(event) => updateSettings({ provider: event.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-[#e67225]/70 focus:ring-2 focus:ring-[#e67225]/15"
              >
                {PROVIDERS.map((provider) => <option key={provider.value} value={provider.value}>{provider.label}</option>)}
              </select>
              <span className="mt-1 block text-[11px] text-slate-500">{selectedProvider.baseUrl}</span>
            </label>
            <Field label="Default Model" value={settings.defaultModel} onChange={(value) => updateSettings({ defaultModel: value })} placeholder="gpt-4o" />
            {(settings.provider === 'gateway' || settings.provider === 'custom') && (
              <>
                <Field label="Base URL" value={settings.baseUrl} onChange={(value) => updateSettings({ baseUrl: value })} placeholder="https://api.openai.com/v1" />
                <Field label="Gateway / Custom API Key" type="password" value={settings.apiKey} onChange={(value) => updateSettings({ apiKey: value })} placeholder="Paste local testing key or use backend env" />
              </>
            )}
            {settings.provider === 'openai' && <Field label="OpenAI API Key" type="password" value={settings.openaiApiKey} onChange={(value) => updateSettings({ openaiApiKey: value })} placeholder="sk-..." />}
            {settings.provider === 'openrouter' && <Field label="OpenRouter API Key" type="password" value={settings.openrouterApiKey} onChange={(value) => updateSettings({ openrouterApiKey: value })} placeholder="sk-or-..." />}
            {settings.provider === 'groq' && <Field label="Groq API Key" type="password" value={settings.groqApiKey} onChange={(value) => updateSettings({ groqApiKey: value })} placeholder="gsk_..." />}
            {settings.provider === 'nvidia' && <Field label="NVIDIA API Key" type="password" value={settings.nvidiaApiKey} onChange={(value) => updateSettings({ nvidiaApiKey: value })} placeholder="nvapi-..." />}
          </div>

          <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs font-black text-slate-700">Available Models</div>
            <p className="mt-1 text-[11px] text-slate-500">{modelStatus || 'Provider model discovery is available after login.'}</p>
            <div className="mt-3 flex max-h-44 flex-wrap gap-2 overflow-auto">
              {models.slice(0, 80).map((model) => (
                <button
                  key={model.id}
                  onClick={() => updateSettings({ defaultModel: model.id })}
                  className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-bold ${settings.defaultModel === model.id ? 'border-[#e67225] bg-orange-50 text-[#e67225]' : 'border-slate-200 bg-white text-slate-600 hover:border-[#e67225]/40'}`}
                >
                  {model.name || model.id}
                </button>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};
