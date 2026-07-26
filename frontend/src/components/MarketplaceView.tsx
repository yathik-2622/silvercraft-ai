import React, { useState } from "react";
import {
  Grid,
  Plus,
  Play,
  Trash2,
  MoveDown,
  Bot,
  Search,
  ShieldCheck,
  BarChart3,
  BrainCircuit,
  GitBranch,
  TableProperties,
  FileCode,
  SlidersHorizontal,
  ChevronUp,
  ChevronDown,
  ArrowUpDown,
  Zap,
  FileText
} from "lucide-react";
import { AgentMarketplaceItem, CustomPipelineStep } from "../types";
import { PREDEFINED_AGENTS } from "../data/mockData";

interface MarketplaceViewProps {
  customAgents: AgentMarketplaceItem[];
  pipelineSteps: CustomPipelineStep[];
  onAddAgentToPipeline: (agentId: string) => void;
  onRemovePipelineStep: (stepId: string) => void;
  onSwapPipelineSteps?: (indexA: number, indexB: number) => void;
  onOpenCreateAgentModal: () => void;
  onRunCustomPipeline: () => void;
  onBackToDefaultFlow: () => void;
}

export const MarketplaceView: React.FC<MarketplaceViewProps> = ({
  customAgents,
  pipelineSteps,
  onAddAgentToPipeline,
  onRemovePipelineStep,
  onSwapPipelineSteps,
  onOpenCreateAgentModal,
  onRunCustomPipeline,
  onBackToDefaultFlow,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const allAgents = [...PREDEFINED_AGENTS, ...customAgents];

  const filteredAgents = allAgents.filter((agent) => {
    const matchesCategory = selectedCategory === "All" || agent.category === selectedCategory;
    const matchesSearch =
      agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      agent.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      agent.role.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const getAgentIcon = (iconName: string) => {
    switch (iconName) {
      case "BarChart3": return <BarChart3 className="w-4 h-4 text-orange-600" />;
      case "ShieldCheck": return <ShieldCheck className="w-4 h-4 text-emerald-600" />;
      case "BrainCircuit": return <BrainCircuit className="w-4 h-4 text-amber-600" />;
      case "GitBranch": return <GitBranch className="w-4 h-4 text-cyan-600" />;
      case "TableProperties": return <TableProperties className="w-4 h-4 text-blue-600" />;
      case "FileCode": return <FileCode className="w-4 h-4 text-amber-600" />;
      default: return <Bot className="w-4 h-4 text-orange-600" />;
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50 text-slate-800 p-6 md:p-8 space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 text-xs font-semibold mb-1 border border-amber-200">
            <Grid className="w-3.5 h-3.5" />
            <span>Agent Marketplace & Pipeline Builder</span>
          </div>
          <h1 className="text-xl md:text-2xl font-extrabold text-slate-900">Predefined & Custom AI Data Modeling Agents</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Select specialized agents or create custom agents to assemble a tailored data modeling sequence.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onOpenCreateAgentModal}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#e67225] hover:bg-[#d0621a] text-white text-xs font-bold shadow-2xs transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Create New Agent</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Agent Cards + Pipeline Assembler */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left 2 Cols: Agent Marketplace Grid */}
        <div className="lg:col-span-2 space-y-4">
          
          {/* Search & Category Filter */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search agents..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-50 text-slate-800 text-xs pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
            </div>

            <div className="flex items-center gap-1 overflow-x-auto w-full sm:w-auto no-scrollbar">
              {["All", "Profiling", "Conceptual", "Logical", "Physical", "Compliance & DQ", "Custom"].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                    selectedCategory === cat
                      ? "bg-orange-600 text-white shadow-2xs font-semibold"
                      : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Agents Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredAgents.map((agent) => {
              const isInPipeline = pipelineSteps.some((step) => step.agentId === agent.id);

              return (
                <div
                  key={agent.id}
                  className="bg-white border border-slate-200 p-4 rounded-xl flex flex-col justify-between space-y-3 shadow-2xs hover:shadow-sm transition-all"
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center border border-slate-200">
                          {getAgentIcon(agent.iconName)}
                        </div>
                        <div>
                          <h3 className="font-bold text-xs text-slate-900">{agent.name}</h3>
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                            {agent.category}
                          </span>
                        </div>
                      </div>
                    </div>

                    <p className="text-xs text-slate-600 leading-relaxed mb-2">
                      {agent.description}
                    </p>

                    <div className="space-y-1.5 text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                      <div><strong className="text-slate-700">Role:</strong> {agent.role}</div>
                      <div><strong className="text-slate-700">Output:</strong> {agent.outputArtifacts.join(", ")}</div>

                      {/* Display Agent Skills */}
                      {agent.skills && agent.skills.length > 0 && (
                        <div className="pt-1.5 border-t border-slate-200/60">
                          <div className="text-[10px] font-bold text-slate-600 flex items-center gap-1 mb-1">
                            <Zap className="w-3 h-3 text-[#e67225]" />
                            <span>Skills ({agent.skills.length}):</span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {agent.skills.map((sk) => (
                              <span
                                key={sk}
                                className="px-2 py-0.5 rounded-md bg-[#e67225]/10 text-slate-900 border border-[#e67225]/30 text-[10px] font-bold"
                              >
                                {sk}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Display Agent Knowledge Base Documents */}
                      {agent.documents && agent.documents.length > 0 && (
                        <div className="pt-1.5 border-t border-slate-200/60">
                          <div className="text-[10px] font-bold text-slate-600 flex items-center gap-1 mb-1">
                            <FileText className="w-3 h-3 text-blue-600" />
                            <span>Attached Documents ({agent.documents.length}):</span>
                          </div>
                          <div className="space-y-1">
                            {agent.documents.map((doc) => (
                              <div
                                key={doc.id}
                                className="px-2 py-1 rounded bg-white border border-slate-200 text-slate-700 text-[10px] flex items-center justify-between gap-1 truncate"
                              >
                                <span className="font-semibold truncate">{doc.name}</span>
                                <span className="text-[9px] text-slate-400 shrink-0">{doc.size}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => onAddAgentToPipeline(agent.id)}
                    className={`w-full py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      isInPipeline
                        ? "bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200"
                        : "bg-orange-600 hover:bg-orange-700 text-white shadow-2xs"
                    }`}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{isInPipeline ? "Add Additional Step" : "Add to Pipeline"}</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Col: Custom Pipeline Sequencer Canvas */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between space-y-5 shadow-2xs">
          <div>
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-3">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-orange-600" />
                <h2 className="font-bold text-slate-900 text-sm">Custom Pipeline Sequence</h2>
              </div>
              <span className="text-[11px] font-semibold text-orange-700 px-2 py-0.5 rounded-full bg-orange-50 border border-orange-200">
                {pipelineSteps.length} Agents
              </span>
            </div>

            {pipelineSteps.length === 0 ? (
              <div className="text-center py-10 px-4 border border-dashed border-slate-200 rounded-lg space-y-2">
                <Bot className="w-8 h-8 text-slate-400 mx-auto" />
                <p className="text-xs text-slate-500">
                  No agents added yet. Click <strong>"Add to Pipeline"</strong> to construct your custom sequence.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {pipelineSteps.map((step, idx) => {
                  const agent = allAgents.find((a) => a.id === step.agentId);
                  if (!agent) return null;

                  return (
                    <React.Fragment key={step.id}>
                      <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 flex items-center justify-between gap-2 hover:border-orange-300 transition-all">
                        <div className="flex items-center gap-2.5">
                          <span className="w-5 h-5 rounded-full bg-orange-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0 shadow-2xs">
                            {idx + 1}
                          </span>
                          <div>
                            <h4 className="font-bold text-xs text-slate-800">{agent.name}</h4>
                            <p className="text-[10px] text-slate-500">{agent.role}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1">
                          {/* Swap / Move Controls */}
                          <div className="flex flex-col border border-slate-200 bg-white rounded overflow-hidden">
                            <button
                              disabled={idx === 0}
                              onClick={() => onSwapPipelineSteps && onSwapPipelineSteps(idx, idx - 1)}
                              className="p-0.5 hover:bg-orange-50 text-slate-500 hover:text-orange-600 disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed transition-colors"
                              title="Move Step Up (Swap)"
                            >
                              <ChevronUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              disabled={idx === pipelineSteps.length - 1}
                              onClick={() => onSwapPipelineSteps && onSwapPipelineSteps(idx, idx + 1)}
                              className="p-0.5 hover:bg-orange-50 text-slate-500 hover:text-orange-600 disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed border-t border-slate-100 transition-colors"
                              title="Move Step Down (Swap)"
                            >
                              <ChevronDown className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <button
                            onClick={() => onRemovePipelineStep(step.id)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-slate-200 rounded transition-colors cursor-pointer"
                            title="Remove step"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {idx < pipelineSteps.length - 1 && (
                        <div className="flex items-center justify-center gap-1 my-0.5">
                          <MoveDown className="w-3.5 h-3.5 text-orange-400" />
                          <span className="text-[9px] text-slate-400 font-mono">Step Sequence</span>
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-2 pt-3 border-t border-slate-200">
            <button
              disabled={pipelineSteps.length === 0}
              onClick={onRunCustomPipeline}
              className="w-full py-2.5 px-4 rounded-lg bg-orange-600 hover:bg-orange-700 disabled:opacity-40 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-2xs cursor-pointer transition-all"
            >
              <Play className="w-3.5 h-3.5 fill-white" />
              <span>Execute Custom Pipeline in Studio</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
