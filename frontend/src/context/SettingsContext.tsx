import React, { createContext, useContext, useEffect, useState } from 'react';
import { settingsApi } from '../api/client';
import { useAuthStore } from '../store/useAuthStore';

export interface LLMSettings {
  provider: string;
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
  openaiApiKey: string;
  openrouterApiKey: string;
  groqApiKey: string;
  nvidiaApiKey: string;
  theme: string;
}

interface SettingsContextProps {
  settings: LLMSettings;
  loading: boolean;
  updateSettings: (newSettings: Partial<LLMSettings>) => Promise<void>;
}

const SettingsContext = createContext<SettingsContextProps | undefined>(undefined);

const DEFAULT_SETTINGS: LLMSettings = {
  provider: 'platform',
  baseUrl: '',
  apiKey: '',
  defaultModel: 'gpt-4o',
  openaiApiKey: '',
  openrouterApiKey: '',
  groqApiKey: '',
  nvidiaApiKey: '',
  theme: 'light',
};

const fromApi = (raw: any): Partial<LLMSettings> => ({
  provider: raw.provider ?? DEFAULT_SETTINGS.provider,
  baseUrl: raw.base_url ?? raw.baseUrl ?? '',
  defaultModel: raw.default_model ?? raw.defaultModel ?? DEFAULT_SETTINGS.defaultModel,
  theme: raw.theme ?? DEFAULT_SETTINGS.theme,
});

const toApi = (settings: LLMSettings) => ({
  provider: settings.provider,
  base_url: settings.baseUrl,
  default_model: settings.defaultModel,
  theme: settings.theme,
  api_key: settings.apiKey,
  openai_api_key: settings.openaiApiKey,
  openrouter_api_key: settings.openrouterApiKey,
  groq_api_key: settings.groqApiKey,
  nvidia_api_key: settings.nvidiaApiKey,
});

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<LLMSettings>(() => {
    const saved = localStorage.getItem('silvercraft.llm.settings');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return DEFAULT_SETTINGS;
      }
    }
    return DEFAULT_SETTINGS;
  });

  useEffect(() => {
    if (!token) return;
    let mounted = true;
    setLoading(true);
    settingsApi.get()
      .then((res) => {
        if (!mounted) return;
        setSettings((prev) => {
          const next = { ...prev, ...fromApi(res.data.settings ?? {}) };
          localStorage.setItem('silvercraft.llm.settings', JSON.stringify(next));
          return next;
        });
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => { mounted = false; };
  }, [token]);

  const updateSettings = async (newSettings: Partial<LLMSettings>) => {
    const nextSettings = { ...settings, ...newSettings };
    localStorage.setItem('silvercraft.llm.settings', JSON.stringify(nextSettings));
    setSettings(nextSettings);
    if (token) {
      const res = await settingsApi.update(toApi(nextSettings));
      setSettings((prev) => {
        const synced = { ...prev, ...fromApi(res.data.settings ?? {}) };
        localStorage.setItem('silvercraft.llm.settings', JSON.stringify(synced));
        return synced;
      });
    }
  };

  return (
    <SettingsContext.Provider value={{ settings, loading, updateSettings }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};
