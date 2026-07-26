import React from 'react';
import { BrainCircuit, X } from 'lucide-react';
import { useSettings } from '../context/SettingsContext';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PROVIDERS = [
  ['gateway', 'Gateway'],
  ['custom', 'Custom OpenAI-Compatible'],
  ['openai', 'OpenAI'],
  ['openrouter', 'OpenRouter'],
  ['groq', 'Groq'],
  ['nvidia', 'NVIDIA'],
];

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { settings, updateSettings } = useSettings();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto bg-[#161b22] border border-[#30363d] rounded-xl shadow-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-white">LLM Provider</h2>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4">
          <div className="text-xs font-bold text-[#e67225] flex items-center gap-2">
            <BrainCircuit className="w-3.5 h-3.5" /> Runtime Settings
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Provider</label>
            <select
              value={settings.provider}
              onChange={(e) => updateSettings({ provider: e.target.value })}
              className="w-full bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 text-sm text-white focus:ring-2 focus:ring-[#e67225] focus:border-transparent outline-none"
            >
              {PROVIDERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>

          {(settings.provider === 'gateway' || settings.provider === 'custom') && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Base URL</label>
                <input
                  type="text"
                  value={settings.baseUrl}
                  onChange={(e) => updateSettings({ baseUrl: e.target.value })}
                  placeholder="https://api.openai.com/v1"
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 text-sm text-white focus:ring-2 focus:ring-[#e67225] focus:border-transparent outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">API Key</label>
                <input
                  type="password"
                  value={settings.apiKey}
                  onChange={(e) => updateSettings({ apiKey: e.target.value })}
                  placeholder="Use backend env or local testing key"
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 text-sm text-white focus:ring-2 focus:ring-[#e67225] focus:border-transparent outline-none"
                />
              </div>
            </>
          )}

          {settings.provider === 'openai' && (
            <input type="password" value={settings.openaiApiKey} onChange={(e) => updateSettings({ openaiApiKey: e.target.value })} placeholder="OpenAI API key" className="w-full bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 text-sm text-white outline-none" />
          )}
          {settings.provider === 'openrouter' && (
            <input type="password" value={settings.openrouterApiKey} onChange={(e) => updateSettings({ openrouterApiKey: e.target.value })} placeholder="OpenRouter API key" className="w-full bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 text-sm text-white outline-none" />
          )}
          {settings.provider === 'groq' && (
            <input type="password" value={settings.groqApiKey} onChange={(e) => updateSettings({ groqApiKey: e.target.value })} placeholder="Groq API key" className="w-full bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 text-sm text-white outline-none" />
          )}
          {settings.provider === 'nvidia' && (
            <input type="password" value={settings.nvidiaApiKey} onChange={(e) => updateSettings({ nvidiaApiKey: e.target.value })} placeholder="NVIDIA API key" className="w-full bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 text-sm text-white outline-none" />
          )}

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Default Model</label>
            <input
              type="text"
              value={settings.defaultModel}
              onChange={(e) => updateSettings({ defaultModel: e.target.value })}
              placeholder="gpt-4o"
              className="w-full bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-2 text-sm text-white focus:ring-2 focus:ring-[#e67225] focus:border-transparent outline-none"
            />
          </div>
        </div>

        <div className="mt-8 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 bg-[#e67225] hover:bg-[#d0621a] text-white rounded-md text-sm font-medium transition-colors">
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
