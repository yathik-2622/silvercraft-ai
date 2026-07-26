import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layers, ChevronRight, Play, Save, Plus } from 'lucide-react';
import WorkflowCanvas from '../components/flow/WorkflowCanvas';
import { Node, Edge } from 'reactflow';

export default function WorkflowBuilderPage() {
  const navigate = useNavigate();
  const [nodes, setNodes] = useState<Node[]>([
    {
      id: 'agent-1',
      type: 'agent',
      position: { x: 100, y: 100 },
      data: { name: 'Data Profiler', framework: 'LangChain', status: 'idle' }
    },
    {
      id: 'agent-2',
      type: 'agent',
      position: { x: 400, y: 100 },
      data: { name: 'SQL Generator', framework: 'LlamaIndex', status: 'idle' }
    }
  ]);
  const [edges, setEdges] = useState<Edge[]>([
    { id: 'e1-2', source: 'agent-1', target: 'agent-2', animated: true }
  ]);

  const handleAddAgent = () => {
    const newNode: Node = {
      id: `agent-${Date.now()}`,
      type: 'agent',
      position: { x: Math.random() * 400 + 100, y: Math.random() * 300 + 100 },
      data: { name: 'New Agent', framework: 'Custom', status: 'idle' }
    };
    setNodes((nds) => [...nds, newNode]);
  };

  return (
    <div className="h-screen flex flex-col bg-[#0d1117] overflow-hidden">
      {/* Studio Topbar */}
      <header className="bg-[#161b22] border-b border-[#30363d] shrink-0 z-40">
        <div className="px-4 h-14 flex items-center justify-between gap-3">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-xs font-semibold overflow-x-auto no-scrollbar shrink-0">
            <button onClick={() => navigate('/dashboard')} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-500/10 text-blue-400 font-bold hover:bg-blue-500/20 transition-colors">
              <Layers className="w-3.5 h-3.5" /> Home
            </button>
            <ChevronRight className="w-3 h-3 text-gray-500" />
            <span className="text-gray-300 text-xs font-semibold truncate max-w-32">Pipeline Builder</span>
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={handleAddAgent}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-[#30363d] text-gray-300 hover:text-white hover:bg-[#21262d] rounded-lg text-xs font-semibold transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add Agent
            </button>
            <button
              className="flex items-center gap-1.5 px-3 py-1.5 border border-[#30363d] text-gray-300 hover:text-white hover:bg-[#21262d] rounded-lg text-xs font-semibold transition-colors"
            >
              <Save className="w-3.5 h-3.5" /> Save Pipeline
            </button>
            <button
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition-colors"
            >
              <Play className="w-3.5 h-3.5" /> Run Pipeline
            </button>
          </div>
        </div>
      </header>

      {/* Main Canvas */}
      <main className="flex-1 w-full h-full relative">
        <WorkflowCanvas
          initialNodes={nodes}
          initialEdges={edges}
          onChange={(newNodes, newEdges) => {
            setNodes(newNodes);
            setEdges(newEdges);
          }}
        />
      </main>
    </div>
  );
}
