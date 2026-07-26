import React from 'react';
import { X, Save, ShieldAlert, Zap, BookOpen, Database, Trash2 } from 'lucide-react';
import { useSettings } from '../../context/SettingsContext';

interface AgentConfigPanelProps {
  nodeId: string;
  nodeData: any;
  onClose: () => void;
  onUpdate: (nodeId: string, newData: any) => void;
  onRemove?: (nodeId: string) => void;
  theme?: 'dark' | 'light';
}

export default function AgentConfigPanel({ nodeId, nodeData, onClose, onUpdate, onRemove, theme = 'dark' }: AgentConfigPanelProps) {
  const { settings } = useSettings();
  const [data, setData] = React.useState(nodeData || {});
  const isDark = theme !== 'light';
  const shell = isDark ? 'bg-[#161b22] border-[#30363d]' : 'bg-white border-slate-200';
  const header = isDark ? 'bg-[#21262d] border-[#30363d]' : 'bg-orange-50 border-orange-100';
  const input = isDark
    ? 'bg-[#0d1117] border-[#30363d] text-white focus:ring-[#e67225]'
    : 'bg-white border-slate-200 text-slate-900 focus:ring-[#e67225]';
  const label = isDark ? 'text-gray-300' : 'text-slate-700';
  const muted = isDark ? 'text-gray-500' : 'text-slate-500';

  React.useEffect(() => {
    setData(nodeData || {});
  }, [nodeData, nodeId]);

  const handleChange = (key: string, value: any) => {
    setData((prev: any) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    onUpdate(nodeId, data);
    onClose();
  };

  return (
    <div className={`absolute top-4 right-4 w-80 border rounded-xl shadow-2xl flex flex-col max-h-[calc(100%-2rem)] z-50 ${shell}`}>
      <div className={`p-4 border-b flex items-center justify-between rounded-t-xl ${header}`}>
        <h3 className={`font-semibold flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
          <Zap size={18} className="text-[#e67225]" />
          Agent Configuration
        </h3>
        <button onClick={onClose} className={`${isDark ? 'text-gray-400 hover:text-white' : 'text-slate-400 hover:text-slate-900'} transition-colors`}>
          <X size={18} />
        </button>
      </div>

      <div className="p-4 overflow-y-auto space-y-5 flex-1">
        <div>
          <label className={`block text-xs font-semibold mb-1 ${label}`}>Agent Name</label>
          <input
            type="text"
            value={data.name || ''}
            onChange={(e) => handleChange('name', e.target.value)}
            className={`w-full border rounded-md px-3 py-2 text-sm focus:ring-1 outline-none ${input}`}
          />
        </div>

        <div>
          <label className={`block text-xs font-semibold mb-1 ${label}`}>Input Bindings (Consumed)</label>
          <div className="grid grid-cols-2 gap-1.5 mb-2">
            {[
              ['includeTextInput', 'Text input'],
              ['includeUploadedFiles', 'Uploaded files'],
              ['includeSourceInputs', 'Source inputs'],
              ['includeKnowledgeBase', 'Knowledge base'],
              ['includeUpstreamOutputs', 'Upstream outputs'],
              ['includeExistingModel', 'Existing model'],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => handleChange(key, !(data as any)[key])}
                className={`rounded border px-2 py-1.5 text-[11px] font-semibold transition-colors ${
                  (data as any)[key] ?? true
                    ? isDark ? 'border-[#e67225]/50 bg-[#e67225]/15 text-orange-100' : 'border-[#e67225]/50 bg-[#e67225]/10 text-orange-700'
                    : isDark ? 'border-[#30363d] bg-[#0d1117] text-gray-500' : 'border-slate-200 bg-white text-slate-500'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <textarea
            value={data.inputs || ''}
            onChange={(e) => handleChange('inputs', e.target.value)}
            placeholder="e.g. all project sources, customer.csv only, existing model DDL, prior agent output"
            className={`w-full border rounded-md px-3 py-2 text-sm focus:ring-1 outline-none h-20 resize-none ${input}`}
          />
          <p className={`text-[10px] mt-1 ${muted}`}>Choose all/common inputs or narrow this agent to specific files/tables/context.</p>
        </div>

        <div>
          <label className={`block text-xs font-semibold mb-1 ${label}`}>Model Selection</label>
          <select
            value={data.model || settings.defaultModel}
            onChange={(e) => handleChange('model', e.target.value)}
            className={`w-full border rounded-md px-3 py-2 text-sm focus:ring-1 outline-none ${input}`}
          >
            <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
            <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
            <option value="gpt-4o">GPT-4o</option>
            <option value="claude-3-5-sonnet">Claude 3.5 Sonnet</option>
          </select>
          <p className={`text-[10px] mt-1 ${muted}`}>Global provider: {settings.provider}</p>
        </div>

        <div>
          <label className={`block text-xs font-semibold mb-1 ${label}`}>Custom Prompt</label>
          <textarea
            value={data.customPrompt || ''}
            onChange={(e) => handleChange('customPrompt', e.target.value)}
            placeholder="Override default system prompt..."
            className={`w-full border rounded-md px-3 py-2 text-sm focus:ring-1 outline-none h-24 resize-none ${input}`}
          />
        </div>

        <div>
          <label className={`block text-xs font-semibold mb-1 flex items-center gap-1 ${label}`}>
            <BookOpen size={12} /> Skills Attached
          </label>
          <input
            type="text"
            value={data.skills || ''}
            onChange={(e) => handleChange('skills', e.target.value)}
            placeholder="/skill list, /skill create, dimensional-modeling, data-vault"
            className={`w-full border rounded-md px-3 py-2 text-sm focus:ring-1 outline-none ${input}`}
          />
          <p className={`text-[10px] mt-1 ${muted}`}>Use slash-style names here; /skill create opens the full creator from chat during execution.</p>
        </div>

        <div>
          <label className={`block text-xs font-semibold mb-1 flex items-center gap-1 ${label}`}>
            <Database size={12} /> KB / Context Files
          </label>
          <textarea
            value={data.knowledgeFiles || ''}
            onChange={(e) => handleChange('knowledgeFiles', e.target.value)}
            placeholder="Attach filenames or KB refs for only this agent, e.g. retail_glossary.md, customer_dict.csv"
            className={`w-full border rounded-md px-3 py-2 text-sm focus:ring-1 outline-none h-20 resize-none ${input}`}
          />
        </div>

        <div className={`pt-2 border-t space-y-3 ${isDark ? 'border-[#30363d]' : 'border-slate-200'}`}>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={data.hitlEnabled || false}
              onChange={(e) => handleChange('hitlEnabled', e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-[#e67225] focus:ring-[#e67225] focus:ring-offset-0"
            />
            <span className={`text-sm font-medium flex items-center gap-1 ${label}`}>
              <ShieldAlert size={14} className="text-orange-400" /> HITL Approval Required
            </span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={data.a2aEnabled || false}
              onChange={(e) => handleChange('a2aEnabled', e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-[#e67225] focus:ring-[#e67225] focus:ring-offset-0"
            />
            <span className={`text-sm font-medium ${label}`}>
              Agent-to-Agent (A2A) Enabled
            </span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={data.kgOptIn || false}
              onChange={(e) => handleChange('kgOptIn', e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-[#e67225] focus:ring-[#e67225] focus:ring-offset-0"
            />
            <span className={`text-sm font-medium ${label}`}>
              Allow this agent's artifacts as Knowledge Graph context
            </span>
          </label>

          {data.a2aEnabled && (
            <div>
              <label className={`block text-xs font-semibold mb-1 ${label}`}>Remote Agent URI</label>
              <input
                type="url"
                value={data.remoteUri || ''}
                onChange={(e) => handleChange('remoteUri', e.target.value)}
                placeholder="https://remote-agent.example.com/run"
                className={`w-full border rounded-md px-3 py-2 text-sm focus:ring-1 outline-none ${input}`}
              />
              <p className={`text-[10px] mt-1 ${muted}`}>Handshake: discover agent card, validate capability schema, then send task payload to this endpoint.</p>
            </div>
          )}
        </div>
      </div>

      <div className={`p-4 border-t rounded-b-xl flex justify-between gap-2 ${header}`}>
        {onRemove && (
          <button
            onClick={() => onRemove(nodeId)}
            className="px-3 py-1.5 flex items-center gap-1.5 text-rose-600 hover:text-rose-700 text-sm font-medium transition-colors"
          >
            <Trash2 size={14} /> Remove
          </button>
        )}
        <div className="flex justify-end gap-2">
        <button
          onClick={onClose}
          className={`px-3 py-1.5 text-sm font-medium transition-colors ${isDark ? 'text-gray-300 hover:text-white' : 'text-slate-600 hover:text-slate-900'}`}
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          className="px-4 py-1.5 flex items-center gap-1.5 bg-[#e67225] hover:bg-[#d0621a] text-white rounded-md text-sm font-medium transition-colors"
        >
          <Save size={14} /> Save
        </button>
        </div>
      </div>
    </div>
  );
}
