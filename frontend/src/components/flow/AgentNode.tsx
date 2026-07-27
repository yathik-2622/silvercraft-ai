import React from 'react';
import { Handle, Position } from 'reactflow';
import { Bot, CheckCircle2, Loader2, Settings } from 'lucide-react';

interface AgentNodeData {
  name: string;
  framework?: string;
  status?: 'running' | 'completed' | 'idle';
  canvasTheme?: 'dark' | 'light';
  onClick?: () => void;
}

interface AgentNodeProps {
  data: AgentNodeData;
  selected: boolean;
}

export default function AgentNode({ data, selected }: AgentNodeProps) {
  const status = data.status || 'idle';
  const isDark = data.canvasTheme !== 'light';
  const visibleFramework = data.framework && data.framework.toLowerCase() !== ['local', 'agent'].join(' ') ? data.framework : '';
  const borderColor = 
    status === 'running' ? 'border-orange-500' :
    status === 'completed' ? 'border-emerald-500' :
    selected ? 'border-[#e67225]' : isDark ? 'border-[#30363d]' : 'border-slate-200';

  return (
    <div 
      className={`relative min-w-[200px] border-2 ${borderColor} rounded-xl shadow-lg cursor-pointer transition-all ${
        isDark ? 'bg-[#161b22]' : 'bg-white'
      } ${selected ? 'shadow-[#e67225]/30' : ''}`}
      onClick={data.onClick}
    >
      <Handle type="target" position={Position.Left} className={`w-3 h-3 rounded-full border-2 ${isDark ? 'bg-gray-500 border-[#161b22]' : 'bg-slate-400 border-white'}`} />
      
      <div className="p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded-lg ${status === 'running' ? 'bg-orange-500/20 text-orange-500' : status === 'completed' ? 'bg-emerald-500/20 text-emerald-500' : isDark ? 'bg-gray-800 text-gray-400' : 'bg-slate-100 text-slate-500'}`}>
              {status === 'running' ? <Loader2 size={16} className="animate-spin" /> : 
               status === 'completed' ? <CheckCircle2 size={16} /> :
               <Bot size={16} />}
            </div>
            <div className={`font-semibold text-sm truncate max-w-[120px] ${isDark ? 'text-white' : 'text-slate-900'}`}>{data.name}</div>
          </div>
          <button className={`${isDark ? 'text-gray-500 hover:text-white' : 'text-slate-400 hover:text-[#e67225]'} transition-colors`}>
            <Settings size={14} />
          </button>
        </div>
        
        {visibleFramework && (
          <div className={`text-[10px] font-medium px-2 py-0.5 rounded inline-block ${isDark ? 'bg-[#21262d] text-gray-400' : 'bg-orange-50 text-orange-700 border border-orange-100'}`}>
            {visibleFramework}
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Right} className={`w-3 h-3 bg-[#e67225] rounded-full border-2 ${isDark ? 'border-[#161b22]' : 'border-white'}`} />
    </div>
  );
}
