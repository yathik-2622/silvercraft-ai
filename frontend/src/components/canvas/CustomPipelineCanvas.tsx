import React, { useMemo, useState } from "react";
import { ArrowRight, Bot, Clock, Layers, Play, RotateCcw, Terminal, Zap } from "lucide-react";
import { AgentMarketplaceItem, CustomPipelineStep } from "../../types";

interface CustomPipelineCanvasProps {
  pipelineSteps: CustomPipelineStep[];
  customAgents: AgentMarketplaceItem[];
  onSendMessage: (text: string) => void;
}

export const CustomPipelineCanvas: React.FC<CustomPipelineCanvasProps> = ({
  pipelineSteps,
  customAgents,
  onSendMessage
}) => {
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [requestedSteps, setRequestedSteps] = useState<string[]>([]);
  const [executionLogs, setExecutionLogs] = useState<string[]>([]);

  const agentsById = useMemo(
    () => new Map(customAgents.map((agent) => [agent.id, agent])),
    [customAgents]
  );

  const getAgent = (agentId: string) => (
    agentsById.get(agentId) || {
      id: agentId,
      name: agentId,
      description: "Configured workflow agent",
      category: "Custom",
      iconName: "Bot",
      role: "Workflow agent",
      outputArtifacts: [],
      inputTypes: [],
      systemPrompt: "",
      isPredefined: false,
      rating: 0,
      usageCount: 0,
    }
  );

  const log = (message: string) => {
    setExecutionLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  };

  const handleExecuteStep = (index: number) => {
    const step = pipelineSteps[index];
    if (!step) return;
    const agent = getAgent(step.agentId);
    setActiveStepIndex(index);
    setRequestedSteps((prev) => [...new Set([...prev, step.id])]);
    log(`Requested step ${index + 1}: ${agent.name}. Waiting for orchestrator response in chat.`);
    onSendMessage(`/run-agent ${agent.id} Execute configured pipeline step ${index + 1}: ${agent.name}. Use this agent's configured inputs, skills, prompt, HITL and A2A settings. Return editable modeling artifacts for the canvas.`);
  };

  const handleRunAll = () => {
    setRequestedSteps(pipelineSteps.map((step) => step.id));
    log(`Requested full pipeline execution with ${pipelineSteps.length} step(s).`);
    onSendMessage("/run-pipeline Execute the configured pipeline in order. Pause for HITL where enabled and return editable artifacts after each agent.");
  };

  const handleReset = () => {
    setActiveStepIndex(0);
    setRequestedSteps([]);
    setExecutionLogs([`[${new Date().toLocaleTimeString()}] Cleared execution requests.`]);
  };

  return (
    <div className="h-full flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
      <div className="bg-[#e67225] text-white p-3.5 px-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-sm shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center text-white font-bold">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-white">Agent Workflow Pipeline</h3>
            <span className="bg-white/20 text-white text-[11px] px-2.5 py-0.5 rounded-full font-mono font-bold border border-white/30">
              {pipelineSteps.length} Steps
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2.5 w-full md:w-auto">
          <button onClick={handleReset} className="px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white text-xs font-semibold flex items-center gap-1.5 border border-white/20">
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>
          <button onClick={handleRunAll} disabled={pipelineSteps.length === 0} className="flex-1 md:flex-none px-5 py-1.5 rounded-lg bg-white text-[#e67225] hover:bg-orange-50 font-bold text-xs flex items-center justify-center gap-2 shadow-sm disabled:opacity-50">
            <Play className="w-3.5 h-3.5 fill-current text-[#e67225]" />
            Execute Pipeline
          </button>
        </div>
      </div>

      <div className="bg-slate-50 border-b border-slate-200 p-3 px-5 overflow-x-auto shrink-0">
        <div className="flex items-center gap-3 min-w-max">
          {pipelineSteps.map((step, idx) => {
            const agent = getAgent(step.agentId);
            const isActive = idx === activeStepIndex;
            const requested = requestedSteps.includes(step.id);
            return (
              <React.Fragment key={step.id}>
                <button
                  onClick={() => setActiveStepIndex(idx)}
                  className={`flex items-center gap-2.5 p-2.5 px-3.5 rounded-xl border transition-all ${
                    isActive ? "bg-white border-orange-500 shadow-md ring-1 ring-orange-400/50" : "bg-white/60 border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <div className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center shrink-0 ${requested ? "bg-orange-500 text-white" : "bg-slate-200 text-slate-700"}`}>
                    {idx + 1}
                  </div>
                  <div className="text-left">
                    <div className="font-bold text-xs text-slate-800">{agent.name}</div>
                    <span className="text-[10px] text-slate-500 block font-mono">{requested ? "REQUESTED" : "READY"}</span>
                  </div>
                </button>
                {idx < pipelineSteps.length - 1 && <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-5 bg-white">
        {pipelineSteps.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-400">
            <Layers className="w-12 h-12 text-slate-300 mb-3" />
            <h4 className="font-bold text-slate-700 text-sm">No Pipeline Steps Configured</h4>
            <p className="text-xs max-w-sm mt-1">Build and run the pipeline from the project builder first.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden">
              {(() => {
                const step = pipelineSteps[activeStepIndex] || pipelineSteps[0];
                const agent = getAgent(step.agentId);
                const requested = requestedSteps.includes(step.id);
                return (
                  <>
                    <div className="bg-slate-50 p-4 border-b border-slate-200 flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-orange-100 text-orange-700 flex items-center justify-center font-bold">
                          <Bot className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="font-bold text-sm text-slate-900">Step {activeStepIndex + 1}: {agent.name}</h4>
                          <span className="text-xs text-slate-500">{agent.description}</span>
                        </div>
                      </div>
                      <button onClick={() => handleExecuteStep(activeStepIndex)} className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5">
                        <Play className="w-3.5 h-3.5 fill-current" />
                        Run This Step
                      </button>
                    </div>
                    <div className="p-5">
                      <div className="p-6 text-center text-slate-500 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                        <Clock className="w-6 h-6 text-slate-300 mx-auto mb-1" />
                        <p className="text-xs font-semibold text-slate-700">
                          {requested ? "Execution request sent to orchestrator" : "Ready for orchestrator execution"}
                        </p>
                        <p className="text-[10px] text-slate-400 mt-1">
                          Artifacts appear in chat/canvas only after the backend orchestrator returns them.
                        </p>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>

            <div className="border border-slate-200 rounded-xl bg-white text-slate-800 overflow-hidden flex flex-col h-[380px] shadow-sm">
              <div className="bg-slate-100 p-3 px-4 flex items-center justify-between border-b border-slate-200">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                  <Terminal className="w-4 h-4 text-orange-600" />
                  Execution Requests
                </div>
              </div>
              <div className="flex-1 p-3 bg-slate-50 font-mono text-[11px] overflow-auto space-y-1 text-slate-800">
                {executionLogs.length === 0 ? (
                  <div className="text-slate-400 italic p-2">No execution requests yet.</div>
                ) : executionLogs.map((item, index) => (
                  <div key={`${item}-${index}`} className="leading-relaxed text-slate-700">{item}</div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
