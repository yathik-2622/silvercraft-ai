import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layers, ChevronRight, Play, Save, Plus } from 'lucide-react';
import WorkflowCanvas from '../components/flow/WorkflowCanvas';
import { Node, Edge } from 'reactflow';
import { agentsApi } from '../api/client';

export default function WorkflowBuilderPage() {
  const navigate = useNavigate();
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);

  useEffect(() => {
    const fetchAgents = async () => {
      try {
        const [predefinedRes, customRes] = await Promise.all([
          agentsApi.listPredefined(),
          agentsApi.listCustom()
        ]);
        const allAgents = [...(predefinedRes.data || []), ...(customRes.data || [])];
        
        const initialNodes: Node[] = allAgents.map((agent, index) => ({
          id: agent.id || `agent-${index}`,
          type: 'agent',
          position: { x: 100 + (index * 300), y: 100 },
          data: { name: agent.name, framework: 'LangGraph', status: 'idle' }
        }));
        
        setNodes(initialNodes);
      } catch (err) {
        console.error('Failed to fetch agents:', err);
      }
    };
    fetchAgents();
  }, []);

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
    <div className="h-screen flex flex-col bg-slate-50 overflow-hidden">
      {/* Studio Topbar */}
      <header className="bg-white border-b border-slate-200 shrink-0 z-40">
        <div className="px-4 h-14 flex items-center justify-between gap-3">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-xs font-semibold overflow-x-auto no-scrollbar shrink-0">
            <button onClick={() => navigate('/dashboard')} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-orange-100 text-orange-600 font-bold hover:bg-orange-200 transition-colors">
              <Layers className="w-3.5 h-3.5" /> Home
            </button>
            <ChevronRight className="w-3 h-3 text-slate-400" />
            <span className="text-slate-900 text-xs font-semibold truncate max-w-32">Pipeline Builder</span>
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={handleAddAgent}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-lg text-xs font-semibold transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add Agent
            </button>
            <button
              className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-lg text-xs font-semibold transition-colors"
            >
              <Save className="w-3.5 h-3.5" /> Save Pipeline
            </button>
            <button
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#e67225] hover:bg-[#c95411] text-white rounded-lg text-xs font-bold transition-colors"
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
