import React from "react";
import { Database, Boxes, Network, Cpu, ArrowRight, CheckCircle } from "lucide-react";
import { HitlStageId } from "../types";

interface StageSubHeaderProps {
  currentStage: HitlStageId;
  onStageChange: (stage: HitlStageId) => void;
}

export const StageSubHeader: React.FC<StageSubHeaderProps> = ({ currentStage, onStageChange }) => {
  const stages: { id: HitlStageId; number: number; name: string; shortName: string; icon: React.FC<{ className?: string }> }[] = [
    {
      id: "1-source-analysis",
      number: 1,
      name: "Source Analysis",
      shortName: "Source",
      icon: Database,
    },
    {
      id: "2-conceptual",
      number: 2,
      name: "Conceptual Model (CDM)",
      shortName: "Conceptual",
      icon: Boxes,
    },
    {
      id: "3-logical",
      number: 3,
      name: "Logical Model (LDM)",
      shortName: "Logical",
      icon: Network,
    },
    {
      id: "4-physical-sttm",
      number: 4,
      name: "Physical Model & STTM (PDM)",
      shortName: "Physical",
      icon: Cpu,
    },
  ];

  const getStageIndex = (stage: HitlStageId) => {
    switch (stage) {
      case "1-source-analysis": return 0;
      case "2-conceptual": return 1;
      case "3-logical": return 2;
      case "4-physical-sttm": return 3;
      default: return 0;
    }
  };

  const currentIndex = getStageIndex(currentStage);

  return (
    <div className="bg-white text-slate-800 border border-slate-200 px-3.5 py-2 rounded-xl shadow-2xs shrink-0">
      <div className="flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-1 sm:gap-2 min-w-max">
          {stages.map((stage, idx) => {
            const Icon = stage.icon;
            const isActive = currentStage === stage.id;
            const isCompleted = idx < currentIndex;

            return (
              <React.Fragment key={stage.id}>
                <button
                  onClick={() => onStageChange(stage.id)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    isActive
                      ? "bg-orange-600 text-white font-bold shadow-md ring-1 ring-orange-400"
                      : isCompleted
                      ? "bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200"
                      : "bg-slate-50 text-slate-500 border border-slate-200 hover:bg-slate-100 hover:text-slate-700"
                  }`}
                  title={`Navigate to Stage ${stage.number}: ${stage.name}`}
                >
                  <div
                    className={`w-5 h-5 rounded-md flex items-center justify-center text-[11px] font-extrabold ${
                      isActive
                        ? "bg-white text-orange-600"
                        : isCompleted
                        ? "bg-emerald-600 text-white"
                        : "bg-slate-200 text-slate-600"
                    }`}
                  >
                    {isCompleted ? <CheckCircle className="w-3.5 h-3.5 text-white" /> : stage.number}
                  </div>

                  <Icon className={`w-3.5 h-3.5 ${isActive ? "text-white" : isCompleted ? "text-emerald-600" : "text-slate-400"}`} />

                  <span className="hidden md:inline">{stage.name}</span>
                  <span className="md:hidden">{stage.shortName}</span>
                </button>

                {idx < stages.length - 1 && (
                  <ArrowRight className="w-3.5 h-3.5 text-slate-300 shrink-0 mx-0.5" />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
};
