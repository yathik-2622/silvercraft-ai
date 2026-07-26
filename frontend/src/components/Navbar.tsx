import React, { useState } from "react";
import {
  ChevronRight,
  Home,
  RotateCcw,
  User,
  LogOut,
  HelpCircle,
  X,
  BookOpen,
  Sparkles,
  ShieldCheck,
  Layers,
  Workflow
} from "lucide-react";
import { FoundationLayer, WorkflowType, HitlStageId } from "../types";

interface NavbarProps {
  currentLayer: FoundationLayer;
  workflowType: WorkflowType;
  currentStage: HitlStageId;
  projectName?: string;
  viewMode?: "landing" | "studio" | "marketplace";
  userEmail?: string;
  userName?: string;
  userRole?: string;
  isSignedIn?: boolean;
  onLayerChange: (layer: FoundationLayer) => void;
  onWorkflowChange: (workflow: WorkflowType) => void;
  onStageChange: (stage: HitlStageId) => void;
  onLoadPreset: (presetId: string) => void;
  onReset: () => void;
  onExportAll: () => void;
  onOpenMarketplace: () => void;
  onGoHome: () => void;
  onLogout?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  workflowType,
  currentStage,
  projectName = "Lakehouse Foundation Model Project",
  viewMode = "landing",
  userEmail = "user1@enterprise.com",
  userName = "Greeshma P",
  userRole = "Lead Data Architect",
  isSignedIn = true,
  onStageChange,
  onReset,
  onGoHome,
  onLogout
}) => {
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);

  const getStageName = (stage: HitlStageId) => {
    switch (stage) {
      case "1-source-analysis": return "Stage 1: Source Analysis";
      case "2-conceptual": return "Stage 2: Conceptual Model";
      case "3-logical": return "Stage 3: Logical Model";
      case "4-physical-sttm": return "Stage 4: Physical Model & STTM";
      default: return "Stage 1: Source Analysis";
    }
  };

  const isStudioActive = viewMode === "studio" || viewMode === "marketplace";

  return (
    <header className="bg-white border-b border-slate-200 text-slate-800 sticky top-0 z-50 shadow-2xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
        {/* Left Side: Brand Logo or Breadcrumb Path */}
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 overflow-x-auto no-scrollbar">
          {isStudioActive ? (
            <>
              {/* Home Icon Button */}
              <button
                onClick={onGoHome}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#e67225]/10 hover:bg-[#e67225]/20 text-[#e67225] font-bold transition-all shrink-0 cursor-pointer border border-[#e67225]/30"
                title="Navigate to My Projects"
              >
                <Home className="w-4 h-4 text-[#e67225]" />
                <span>Home</span>
              </button>

              <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />

              {/* Active Project Info */}
              <div className="flex items-center gap-1.5 bg-slate-50 text-slate-800 px-2.5 py-1.5 rounded-lg border border-slate-200 font-bold text-xs shrink-0">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span className="text-slate-500 font-normal">Project:</span>
                <span className="text-slate-900">{projectName}</span>
              </div>

              <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />

              {/* Workflow Strategy Breadcrumb */}
              <div className="flex items-center gap-1.5 bg-[#e67225]/10 text-slate-900 px-2.5 py-1.5 rounded-lg border border-[#e67225]/30 font-bold text-xs shrink-0">
                <span className={`w-2 h-2 rounded-full ${workflowType === "default" ? "bg-[#e67225]" : "bg-amber-600"}`}></span>
                <span>{workflowType === "default" ? "Default Workflow" : "Custom Workflow"}</span>
              </div>

              <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />

              {/* Active Stage Breadcrumb */}
              <button
                onClick={() => onStageChange(currentStage)}
                className="flex items-center gap-1.5 bg-[#e67225] hover:bg-[#d0621a] text-white px-3 py-1.5 rounded-lg font-bold text-xs shrink-0 cursor-pointer shadow-2xs transition-colors"
                title="Active Stage"
              >
                <span>{getStageName(currentStage)}</span>
              </button>
            </>
          ) : (
            <div className="flex items-center gap-2.5 cursor-pointer" onClick={onGoHome}>
              <div className="w-8 h-8 rounded-lg bg-[#e67225] text-white flex items-center justify-center font-black shadow-2xs">
                <Layers className="w-4.5 h-4.5" />
              </div>
              <div>
                <h1 className="text-sm font-extrabold text-slate-900 leading-none tracking-tight">
                  Assisted Data Modeling
                </h1>
                <p className="text-[10px] text-slate-500 font-medium mt-0.5">Enterprise Architecture Studio</p>
              </div>
            </div>
          )}
        </div>

        {/* Extreme Right Actions: Reset Session & User Profile Dropdown (Help & Logout inside) */}
        <div className="flex items-center gap-3 shrink-0 relative">
          
          {/* Reset Session Icon */}
          <button
            onClick={onReset}
            title="Reset Studio Session"
            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer border border-slate-200"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {/* User Profile Avatar / Badge (Displayed ONLY when signed in) */}
          {isSignedIn && (
            <div className="relative border-l border-slate-200 pl-3">
              <button
                onClick={() => setShowUserDropdown(!showUserDropdown)}
                className="flex items-center gap-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg px-2.5 py-1 transition-all cursor-pointer shadow-2xs"
                title="User Profile & Settings"
              >
                <div className="w-6 h-6 rounded-full bg-[#e67225] text-white font-bold text-xs flex items-center justify-center shadow-2xs">
                  {userName ? userName.charAt(0) : "G"}
                </div>
                <div className="hidden md:block text-left">
                  <div className="text-xs font-bold text-slate-900 leading-none">{userName}</div>
                  <div className="text-[10px] text-slate-500 font-mono mt-0.5">{userRole}</div>
                </div>
              </button>

              {/* User Dropdown Menu (Contains Profile Details, Help, Logout) */}
              {showUserDropdown && (
                <>
                  {/* Backdrop to close dropdown on click outside */}
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowUserDropdown(false)}
                  />

                  <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden divide-y divide-slate-100 text-xs">
                    {/* User Details Header */}
                    <div className="p-3 bg-slate-50">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-[#e67225] text-white font-bold text-sm flex items-center justify-center shadow-xs shrink-0">
                          {userName ? userName.charAt(0) : "G"}
                        </div>
                        <div className="overflow-hidden">
                          <div className="font-bold text-slate-900 truncate">{userName}</div>
                          <div className="text-[11px] text-slate-500 truncate font-mono">{userEmail}</div>
                          <span className="inline-block text-[9px] font-bold text-[#e67225] bg-[#e67225]/10 px-1.5 py-0.2 rounded border border-[#e67225]/30 mt-1">
                            {userRole}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Menu Actions */}
                    <div className="p-1">
                      {/* Help Option */}
                      <button
                        onClick={() => {
                          setShowUserDropdown(false);
                          setShowHelpModal(true);
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-slate-700 hover:text-[#e67225] hover:bg-[#e67225]/10 rounded-lg transition-colors cursor-pointer font-medium"
                      >
                        <HelpCircle className="w-4 h-4 text-[#e67225]" />
                        <span>Studio Help & Guidance</span>
                      </button>

                      {/* Logout Option */}
                      {onLogout && (
                        <button
                          onClick={() => {
                            setShowUserDropdown(false);
                            onLogout();
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer font-bold mt-0.5"
                        >
                          <LogOut className="w-4 h-4 text-rose-600" />
                          <span>Sign Out & Logout</span>
                        </button>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Help Modal */}
      {showHelpModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden">
            <div className="bg-[#e67225] text-white p-4 px-6 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5" />
                <h3 className="font-bold text-base">Studio Help & Guidance</h3>
              </div>
              <button
                onClick={() => setShowHelpModal(false)}
                className="text-white/80 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs text-slate-700 leading-relaxed max-h-[75vh] overflow-y-auto">
              <div className="bg-[#e67225]/10 border border-[#e67225]/30 p-3 rounded-xl flex items-start gap-3 text-slate-900">
                <Sparkles className="w-5 h-5 text-[#e67225] shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-xs text-[#e67225]">Data Layer Modeling Studio Guide</h4>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    Accelerate lakehouse data model architecture with automated AI profiling, 3NF normalization, dimensional modeling, and STTM SQL DDL generation.
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="border border-slate-200 rounded-xl p-3 bg-slate-50">
                  <div className="font-bold text-slate-900 flex items-center gap-2 mb-1">
                    <Layers className="w-4 h-4 text-[#e67225]" />
                    <span>1. Layer Strategy</span>
                  </div>
                  <p className="text-slate-600">
                    Choose between <strong>Foundation Data Layer (Cleansed 3NF)</strong> for raw ingestion normalization or <strong>Product Data Mart (Dimensional)</strong> for analytics delivery.
                  </p>
                </div>

                <div className="border border-slate-200 rounded-xl p-3 bg-slate-50">
                  <div className="font-bold text-slate-900 flex items-center gap-2 mb-1">
                    <Workflow className="w-4 h-4 text-[#e67225]" />
                    <span>2. Workflow Execution</span>
                  </div>
                  <p className="text-slate-600">
                    Select <strong>Default 4-Stage Human-in-the-Loop</strong> workflow (Source Analysis → Conceptual → Logical → Physical & STTM) or <strong>Customized Agent Flow</strong>.
                  </p>
                </div>

                <div className="border border-slate-200 rounded-xl p-3 bg-slate-50">
                  <div className="font-bold text-slate-900 flex items-center gap-2 mb-1">
                    <ShieldCheck className="w-4 h-4 text-[#e67225]" />
                    <span>3. Enterprise Security & PII</span>
                  </div>
                  <p className="text-slate-600">
                    Flagged PII fields are automatically encrypted or masked according to corporate governance standards.
                  </p>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 flex justify-end">
                <button
                  onClick={() => setShowHelpModal(false)}
                  className="px-4 py-2 bg-[#e67225] hover:bg-[#d0621a] text-white font-bold text-xs rounded-lg transition-colors cursor-pointer shadow-xs"
                >
                  Got It, Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};



