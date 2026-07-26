import React, { useState } from "react";
import {
  HitlStageId,
  SourceTableProfile,
  ConceptualConcept,
  ConceptualRelationship,
  LogicalEntity,
  LogicalRelationship,
  PhysicalTable,
  SttmMappingRow,
  ChatMessage,
  ModelingSessionConfig,
  SqlDialect,
  ClassificationType,
  CustomPipelineStep,
  AgentMarketplaceItem
} from "../types";
import { ConversationalAssistant } from "./ConversationalAssistant";
import { StageSubHeader } from "./StageSubHeader";
import { Stage1SourceAnalysisCanvas } from "./canvas/Stage1SourceAnalysisCanvas";
import { Stage2ConceptualCanvas } from "./canvas/Stage2ConceptualCanvas";
import { Stage3LogicalCanvas } from "./canvas/Stage3LogicalCanvas";
import { Stage4PhysicalSTTMCanvas } from "./canvas/Stage4PhysicalSTTMCanvas";
import { CustomPipelineCanvas } from "./canvas/CustomPipelineCanvas";
import { PanelLeftOpen, Bot } from "lucide-react";

interface DualPaneViewProps {
  currentStage: HitlStageId;
  sessionConfig: ModelingSessionConfig;
  messages: ChatMessage[];
  sourceTables: SourceTableProfile[];
  concepts: ConceptualConcept[];
  conceptRelationships: ConceptualRelationship[];
  logicalEntities: LogicalEntity[];
  logicalRelationships: LogicalRelationship[];
  physicalTables: PhysicalTable[];
  sttmRows: SttmMappingRow[];
  isLoadingAi: boolean;

  workflowType?: "default" | "custom";
  pipelineSteps?: CustomPipelineStep[];
  customAgents?: AgentMarketplaceItem[];

  onSendMessage: (text: string) => void;
  onUpdateSessionConfig: (config: ModelingSessionConfig) => void;
  onAdvanceStage: () => void;
  onStageChange: (stage: HitlStageId) => void;
  onUpdateSourceTables: (tables: SourceTableProfile[]) => void;
  onUpdateConcepts: (concepts: ConceptualConcept[]) => void;
  onUpdateConceptRels: (rels: ConceptualRelationship[]) => void;
  onUpdateLogicalEntities: (entities: LogicalEntity[]) => void;
  onUpdateLogicalRels: (rels: LogicalRelationship[]) => void;
  onUpdatePhysicalTables: (tables: PhysicalTable[]) => void;
  onUpdateSttmRows: (rows: SttmMappingRow[]) => void;
  onUpdateDialect: (dialect: SqlDialect) => void;
}

export const DualPaneView: React.FC<DualPaneViewProps> = ({
  currentStage,
  sessionConfig,
  messages,
  sourceTables,
  concepts,
  conceptRelationships,
  logicalEntities,
  logicalRelationships,
  physicalTables,
  sttmRows,
  isLoadingAi,

  workflowType = "default",
  pipelineSteps = [],
  customAgents = [],

  onSendMessage,
  onUpdateSessionConfig,
  onAdvanceStage,
  onStageChange,
  onUpdateSourceTables,
  onUpdateConcepts,
  onUpdateConceptRels,
  onUpdateLogicalEntities,
  onUpdateLogicalRels,
  onUpdatePhysicalTables,
  onUpdateSttmRows,
  onUpdateDialect
}) => {
  const [viewStyle, setViewStyle] = useState<"standard" | "er">("standard");
  const [isChatCollapsed, setIsChatCollapsed] = useState(false);

  return (
    <div className="h-[calc(100vh-3.5rem)] p-3 md:p-4 bg-slate-100/80 flex gap-3 md:gap-4 overflow-hidden">
      {/* Left Column: Conversational Assistant (Collapsible) */}
      {isChatCollapsed ? (
        <div className="w-12 h-full bg-white border border-slate-200 rounded-xl flex flex-col items-center py-3 gap-4 shadow-2xs shrink-0 transition-all">
          <button
            onClick={() => setIsChatCollapsed(false)}
            className="p-2 bg-orange-50 text-orange-600 hover:bg-orange-100 rounded-lg transition-colors cursor-pointer border border-orange-200"
            title="Expand Modeling Assistant"
          >
            <PanelLeftOpen className="w-4 h-4" />
          </button>
          <div className="w-7 h-7 rounded-lg bg-orange-600 flex items-center justify-center text-white shadow-2xs">
            <Bot className="w-4 h-4" />
          </div>
          <div className="flex-1 flex items-center justify-center">
            <span className="text-xs font-bold text-slate-500 tracking-wider uppercase rotate-270 whitespace-nowrap">
              Modeling Assistant
            </span>
          </div>
        </div>
      ) : (
        <div className="w-full lg:w-[380px] xl:w-[420px] h-full shrink-0 transition-all">
          <ConversationalAssistant
            messages={messages}
            currentStage={currentStage}
            sessionConfig={sessionConfig}
            onSendMessage={onSendMessage}
            onUpdateSessionConfig={onUpdateSessionConfig}
            onAdvanceStage={onAdvanceStage}
            isLoading={isLoadingAi}
            hideParameters
            onToggleCollapse={() => setIsChatCollapsed(true)}
          />
        </div>
      )}

      {/* Right Column: Interactive Canvas Play Area */}
      <div className="flex-1 h-full flex flex-col gap-3 overflow-hidden">
        {workflowType === "custom" ? (
          <CustomPipelineCanvas
            pipelineSteps={pipelineSteps}
            customAgents={customAgents}
            onSendMessage={onSendMessage}
          />
        ) : (
          <>
            {/* Black Ribbon Stage Header for Standard Flow */}
            <StageSubHeader
              currentStage={currentStage}
              onStageChange={onStageChange}
            />

            {/* Play Area Canvas Body */}
            <div className="flex-1 overflow-hidden">
              {currentStage === "1-source-analysis" && (
                <Stage1SourceAnalysisCanvas
                  sourceTables={sourceTables}
                  onUpdateSourceTables={onUpdateSourceTables}
                  onAdvanceStage={onAdvanceStage}
                  viewStyle={viewStyle}
                  onViewStyleChange={setViewStyle}
                />
              )}

              {currentStage === "2-conceptual" && (
                <Stage2ConceptualCanvas
                  concepts={concepts}
                  relationships={conceptRelationships}
                  onUpdateConcepts={onUpdateConcepts}
                  onUpdateRelationships={onUpdateConceptRels}
                  onAdvanceStage={onAdvanceStage}
                  viewStyle={viewStyle}
                  onViewStyleChange={setViewStyle}
                />
              )}

              {currentStage === "3-logical" && (
                <Stage3LogicalCanvas
                  entities={logicalEntities}
                  relationships={logicalRelationships}
                  onUpdateEntities={onUpdateLogicalEntities}
                  onUpdateRelationships={onUpdateLogicalRels}
                  onAdvanceStage={onAdvanceStage}
                  viewStyle={viewStyle}
                  onViewStyleChange={setViewStyle}
                />
              )}

              {currentStage === "4-physical-sttm" && (
                <Stage4PhysicalSTTMCanvas
                  physicalTables={physicalTables}
                  sttmRows={sttmRows}
                  targetDialect={sessionConfig.targetDialect}
                  logicalRelationships={logicalRelationships}
                  onUpdateDialect={onUpdateDialect}
                  onUpdateSttmRows={onUpdateSttmRows}
                  onUpdatePhysicalTables={onUpdatePhysicalTables}
                  onUpdateRelationships={onUpdateLogicalRels}
                  viewStyle={viewStyle}
                  onViewStyleChange={setViewStyle}
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
