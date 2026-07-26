import React, { useState } from "react";
import {
  FileCode,
  Download,
  Copy,
  Check,
  TableProperties,
  Database,
  Edit2,
  Sparkles,
  Layers,
  CheckCircle2,
  GitBranch,
  Github,
  GitPullRequest,
  Key,
  X,
  ExternalLink
} from "lucide-react";
import { PhysicalTable, SttmMappingRow, SqlDialect } from "../../types";
import { exportStage4Excel } from "../../utils/excelExporter";
import { generateSqlDdl } from "../../utils/ddlGenerator";

interface Stage4CanvasProps {
  physicalTables: PhysicalTable[];
  sttmRows: SttmMappingRow[];
  targetDialect: SqlDialect;
  onUpdateDialect: (dialect: SqlDialect) => void;
  onUpdateSttmRows: (rows: SttmMappingRow[]) => void;
  onUpdatePhysicalTables: (tables: PhysicalTable[]) => void;
  viewStyle?: "standard" | "er";
  onViewStyleChange?: (style: "standard" | "er") => void;
}

export const Stage4PhysicalSTTMCanvas: React.FC<Stage4CanvasProps> = ({
  physicalTables,
  sttmRows,
  targetDialect,
  onUpdateDialect,
  onUpdateSttmRows,
  onUpdatePhysicalTables,
  viewStyle = "standard",
  onViewStyleChange
}) => {
  const [activeTab, setActiveTab] = useState<"sttm" | "ddl" | "tables">("sttm");
  const [copied, setCopied] = useState(false);
  const [editingSttmId, setEditingSttmId] = useState<string | null>(null);

  // Publish Repository Modal state
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [repoProvider, setRepoProvider] = useState<"GitHub" | "GitLab" | "Bitbucket">("GitHub");
  const [repoUrl, setRepoUrl] = useState("https://github.com/enterprise-org/lakehouse-data-models");
  const [targetBranch, setTargetBranch] = useState("feature/silver-3nf-model");
  const [repoUsername, setRepoUsername] = useState("lead_data_architect");
  const [repoToken, setRepoToken] = useState("ghp_92x83k02994119382218392109384");
  const [commitMessage, setCommitMessage] = useState("feat(lakehouse): Publish Stage 4 3NF Physical DDL & STTM Matrix");
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishStep, setPublishStep] = useState(0);
  const [publishResult, setPublishResult] = useState<{ commitHash: string; prUrl: string } | null>(null);

  const generatedDdl = generateSqlDdl(physicalTables, targetDialect);

  const handleCopyDdl = () => {
    navigator.clipboard.writeText(generatedDdl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadDdl = () => {
    const blob = new Blob([generatedDdl], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Silver_Lakehouse_${targetDialect.replace(/\s+/g, "_")}_DDL.sql`;
    a.click();
  };

  const handleExportExcel = () => {
    exportStage4Excel(sttmRows, physicalTables);
  };

  const handleUpdateTransformation = (id: string, newRule: string) => {
    const updated = sttmRows.map((r) => (r.id === id ? { ...r, transformationRule: newRule } : r));
    onUpdateSttmRows(updated);
  };

  const handlePublishRepo = () => {
    setIsPublishing(true);
    setPublishStep(1);
    setTimeout(() => {
      setPublishStep(2);
      setTimeout(() => {
        setPublishStep(3);
        setTimeout(() => {
          setIsPublishing(false);
          setPublishResult({
            commitHash: "8f92a0e" + Math.floor(Math.random() * 89999 + 10000),
            prUrl: `${repoUrl}/pull/${Math.floor(Math.random() * 80 + 10)}`
          });
        }, 800);
      }, 800);
    }, 800);
  };

  return (
    <div className="h-full flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
      {/* Top Header */}
      <div className="bg-slate-50/80 border-b border-slate-200 p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="font-bold text-slate-800 text-sm sm:text-base">Physical Model & STTM Matrix</h2>
        </div>

        {/* Dialect Selector & Actions */}
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-lg border border-slate-200 text-xs shadow-2xs">
            <span className="text-slate-500 font-semibold">Engine:</span>
            <select
              value={targetDialect}
              onChange={(e) => onUpdateDialect(e.target.value as SqlDialect)}
              className="bg-transparent text-indigo-700 font-bold text-xs p-1 focus:outline-none cursor-pointer"
            >
              <option value="Databricks Delta">Databricks Delta Lake</option>
              <option value="Snowflake">Snowflake</option>
              <option value="BigQuery">Google BigQuery</option>
              <option value="PostgreSQL">PostgreSQL</option>
              <option value="Redshift">Amazon Redshift</option>
            </select>
          </div>

          {/* Export Physical Artifacts */}
          <button
            onClick={() => {
              handleExportExcel();
              handleDownloadDdl();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-all cursor-pointer shadow-2xs"
            title="Export Physical Model STTM & DDL artifacts"
          >
            <Download className="w-3.5 h-3.5 text-emerald-600" />
            <span>Export Artifacts</span>
          </button>

          {/* Finish Modeling & Publish to Repositories */}
          <button
            onClick={() => {
              setPublishResult(null);
              setPublishStep(0);
              setShowPublishModal(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-orange-600 hover:bg-orange-700 text-white shadow-md transition-all cursor-pointer"
            title="Finish modeling stage & publish DDL/STTM to Git repository"
          >
            <GitBranch className="w-3.5 h-3.5" />
            <span>Finish Modeling & Publish</span>
          </button>
        </div>
      </div>

      {/* Navigation Sub-tabs */}
      <div className="bg-slate-50 border-b border-slate-200 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab("sttm")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === "sttm"
                ? "bg-white text-slate-800 border border-slate-200 shadow-2xs font-semibold"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            STTM Matrix (16 Physical Columns)
          </button>
          <button
            onClick={() => setActiveTab("ddl")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === "ddl"
                ? "bg-white text-slate-800 border border-slate-200 shadow-2xs font-semibold"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            DDL Script Code
          </button>
          <button
            onClick={() => setActiveTab("tables")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === "tables"
                ? "bg-white text-slate-800 border border-slate-200 shadow-2xs font-semibold"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            Physical Tables & Partitioning
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-auto p-4 space-y-4 bg-slate-50/30">
        
        {/* STTM Matrix View (Complete 16 Physical Columns) */}
        {activeTab === "sttm" && (
          <div className="space-y-4">
            <div className="border border-slate-200 rounded-xl overflow-x-auto bg-white shadow-2xs">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-orange-100/80 text-orange-950 uppercase text-[9px] font-mono font-bold tracking-wider border-b border-orange-200">
                  <tr>
                    <th className="p-2.5 whitespace-nowrap">SOURCE_DATABASE</th>
                    <th className="p-2.5 whitespace-nowrap">SOURCE_SCHEMA</th>
                    <th className="p-2.5 whitespace-nowrap">SOURCE_TABLE</th>
                    <th className="p-2.5 whitespace-nowrap">SOURCE_COLUMN</th>
                    <th className="p-2.5 whitespace-nowrap">SOURCE_COLUMN_DATATYPE</th>
                    <th className="p-2.5 whitespace-nowrap">JOIN_CONDITION</th>
                    <th className="p-2.5 whitespace-nowrap">FILTER_CONDITION</th>
                    <th className="p-2.5 whitespace-nowrap min-w-[200px]">TRANSFORM_LOGIC</th>
                    <th className="p-2.5 whitespace-nowrap">DEFAULT_VALUE</th>
                    <th className="p-2.5 whitespace-nowrap">TARGET_DATABASE</th>
                    <th className="p-2.5 whitespace-nowrap">TARGET_SCHEMA</th>
                    <th className="p-2.5 whitespace-nowrap">TARGET_TABLE</th>
                    <th className="p-2.5 whitespace-nowrap">TARGET_COLUMN</th>
                    <th className="p-2.5 whitespace-nowrap">TARGET_COLUMN_DATATYPE</th>
                    <th className="p-2.5 whitespace-nowrap">TARGET_COLUMN_KEYTYPE</th>
                    <th className="p-2.5 whitespace-nowrap">TARGET_COLUMN_NULLABLE</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                  {sttmRows.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-2.5 text-slate-500">{row.sourceDatabase || "OLTP_DB"}</td>
                      <td className="p-2.5 text-slate-500">{row.sourceSchema || "PUBLIC"}</td>
                      <td className="p-2.5 font-bold text-slate-900 whitespace-nowrap">{row.sourceTable}</td>
                      <td className="p-2.5 font-bold text-orange-600 whitespace-nowrap">{row.sourceColumn}</td>
                      <td className="p-2.5 text-slate-600 whitespace-nowrap">{row.sourceType}</td>
                      <td className="p-2.5 text-slate-500 max-w-[150px] truncate">{row.joinCondition || "N/A"}</td>
                      <td className="p-2.5 text-slate-500 max-w-[150px] truncate">{row.filterCondition || "N/A"}</td>

                      {/* Transform Logic Editable */}
                      <td className="p-2.5">
                        {editingSttmId === row.id ? (
                          <input
                            type="text"
                            defaultValue={row.transformationRule}
                            onBlur={(e) => {
                              handleUpdateTransformation(row.id, e.target.value);
                              setEditingSttmId(null);
                            }}
                            className="w-full bg-white text-emerald-700 p-1 rounded border border-emerald-500 font-mono text-xs focus:outline-none shadow-2xs"
                            autoFocus
                          />
                        ) : (
                          <div
                            onClick={() => setEditingSttmId(row.id)}
                            className="text-emerald-800 bg-emerald-50/60 p-1 rounded border border-emerald-200 hover:border-emerald-400 cursor-pointer flex items-center justify-between font-bold"
                          >
                            <span className="truncate max-w-[180px]">{row.transformationRule}</span>
                            <Edit2 className="w-3 h-3 text-emerald-600 shrink-0 ml-1" />
                          </div>
                        )}
                      </td>

                      <td className="p-2.5 text-slate-500">{row.defaultValue || "NULL"}</td>
                      <td className="p-2.5 text-indigo-900 font-semibold">{row.targetDatabase || "SILVER_LAKEHOUSE"}</td>
                      <td className="p-2.5 text-indigo-900 font-semibold">{row.targetSchema || "ANALYTICS"}</td>
                      <td className="p-2.5 font-bold text-indigo-900 whitespace-nowrap">{row.targetTable}</td>
                      <td className="p-2.5 font-bold text-indigo-700 whitespace-nowrap">{row.targetColumn}</td>
                      <td className="p-2.5 text-slate-700 font-semibold whitespace-nowrap">{row.targetType}</td>
                      <td className="p-2.5">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          row.isPrimaryKey || row.targetKeyType === "PK"
                            ? "bg-amber-100 text-amber-800 border border-amber-300"
                            : row.isForeignKey || row.targetKeyType === "FK"
                            ? "bg-indigo-100 text-indigo-800 border border-indigo-300"
                            : "bg-slate-100 text-slate-600"
                        }`}>
                          {row.targetKeyType || (row.isPrimaryKey ? "PK" : row.isForeignKey ? "FK" : "ATTR")}
                        </span>
                      </td>
                      <td className="p-2.5 text-center font-bold">
                        {row.isNullable ? <span className="text-slate-400">YES</span> : <span className="text-rose-600">NO</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* DDL Code View */}
        {activeTab === "ddl" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
              <span className="text-xs text-slate-600 font-mono">Dialect: <strong className="text-slate-800">{targetDialect}</strong></span>
              <button
                onClick={handleCopyDdl}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? "Copied DDL!" : "Copy DDL Code"}</span>
              </button>
            </div>

            <div className="bg-orange-50/70 text-slate-900 p-4 rounded-xl border border-orange-200 font-mono text-xs overflow-x-auto whitespace-pre leading-relaxed shadow-xs max-h-[500px]">
              {generatedDdl}
            </div>
          </div>
        )}

        {/* Physical Tables & Partitioning */}
        {activeTab === "tables" && (
          <div className="space-y-4">
            {physicalTables.map((tbl) => (
              <div key={tbl.id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-2xs">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <div>
                    <h3 className="font-mono font-bold text-sm text-indigo-700">{tbl.schema}.${tbl.tableName}</h3>
                    <p className="text-xs text-slate-500">{tbl.comment}</p>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-50 text-slate-600 border border-slate-200 font-semibold">
                    {tbl.tableType}
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-700">
                    <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold border-b border-slate-200">
                      <tr>
                        <th className="p-2">Column</th>
                        <th className="p-2">Data Type</th>
                        <th className="p-2">Keys / Indexing</th>
                        <th className="p-2">Comment</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono">
                      {tbl.columns.map((c) => (
                        <tr key={c.id}>
                          <td className="p-2 font-bold text-slate-900">{c.columnName}</td>
                          <td className="p-2 text-indigo-600 font-medium">{c.dataType}</td>
                          <td className="p-2">
                            {c.isPrimaryKey && <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-1 rounded mr-1 font-sans font-bold">PK</span>}
                            {c.isForeignKey && <span className="text-[10px] bg-indigo-50 text-indigo-700 border border-indigo-200 px-1 rounded mr-1 font-sans font-bold">FK</span>}
                            {c.isPartitionKey && <span className="text-[10px] bg-purple-50 text-purple-700 border border-purple-200 px-1 rounded mr-1 font-sans font-bold">PARTITION</span>}
                            {c.isClusteringKey && <span className="text-[10px] bg-cyan-50 text-cyan-700 border border-cyan-200 px-1 rounded font-sans font-bold">CLUSTER</span>}
                          </td>
                          <td className="p-2 text-slate-500 text-[11px] font-sans">{c.comment}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}

      </div>

      {/* Publish to Repository Modal */}
      {showPublishModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden">
            <div className="bg-orange-600 text-white p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-orange-200" />
                <h3 className="font-bold text-sm">Publish Modeling Artifacts to Repository</h3>
              </div>
              <button onClick={() => setShowPublishModal(false)} className="text-orange-200 hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3.5 text-xs">
              {publishResult ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center space-y-2">
                  <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
                  <h4 className="font-bold text-sm text-emerald-900">Successfully Published to {repoProvider}!</h4>
                  <p className="text-emerald-700 text-xs">
                    Committed DDL SQL scripts & STTM Matrix specification to branch <code className="font-mono font-bold">{targetBranch}</code>.
                  </p>
                  <div className="bg-white p-3 rounded-lg border border-emerald-200 font-mono text-slate-800 text-left space-y-1">
                    <div><span className="text-slate-400">Commit:</span> <strong className="text-indigo-600">{publishResult.commitHash}</strong></div>
                    <div><span className="text-slate-400">Pull Request:</span> <a href={publishResult.prUrl} target="_blank" rel="noreferrer" className="text-orange-600 font-bold underline inline-flex items-center gap-1">{publishResult.prUrl} <ExternalLink className="w-3 h-3"/></a></div>
                  </div>
                  <button
                    onClick={() => setShowPublishModal(false)}
                    className="mt-2 px-4 py-1.5 bg-emerald-600 text-white rounded-lg font-bold text-xs hover:bg-emerald-700 cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Select Code Repository Provider</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(["GitHub", "GitLab", "Bitbucket"] as const).map((prov) => (
                        <button
                          key={prov}
                          type="button"
                          onClick={() => setRepoProvider(prov)}
                          className={`p-2 rounded-lg border text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                            repoProvider === prov
                              ? "bg-slate-900 text-white border-slate-900 shadow-sm"
                              : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                          }`}
                        >
                          <Github className="w-3.5 h-3.5" />
                          <span>{prov}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Repository URL</label>
                    <input
                      type="text"
                      value={repoUrl}
                      onChange={(e) => setRepoUrl(e.target.value)}
                      placeholder="https://github.com/org/repo.git"
                      className="w-full p-2 border border-slate-300 rounded-lg font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-orange-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-700 font-semibold mb-1">Target Branch</label>
                      <input
                        type="text"
                        value={targetBranch}
                        onChange={(e) => setTargetBranch(e.target.value)}
                        placeholder="main / feature-branch"
                        className="w-full p-2 border border-slate-300 rounded-lg font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-orange-500"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-700 font-semibold mb-1">Username / Email</label>
                      <input
                        type="text"
                        value={repoUsername}
                        onChange={(e) => setRepoUsername(e.target.value)}
                        placeholder="lead_architect"
                        className="w-full p-2 border border-slate-300 rounded-lg font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-orange-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Personal Access Token (PAT Secret)</label>
                    <input
                      type="password"
                      value={repoToken}
                      onChange={(e) => setRepoToken(e.target.value)}
                      placeholder="ghp_••••••••••••••••••••••••••••"
                      className="w-full p-2 border border-slate-300 rounded-lg font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-orange-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">Commit Message</label>
                    <input
                      type="text"
                      value={commitMessage}
                      onChange={(e) => setCommitMessage(e.target.value)}
                      className="w-full p-2 border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-1 focus:ring-orange-500"
                    />
                  </div>

                  {isPublishing && (
                    <div className="bg-slate-900 text-slate-200 p-3 rounded-lg font-mono text-[11px] space-y-1 border border-slate-800">
                      <div className={`flex items-center gap-2 ${publishStep >= 1 ? "text-emerald-400" : "text-slate-500"}`}>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Authenticating with {repoProvider} credentials...</span>
                      </div>
                      <div className={`flex items-center gap-2 ${publishStep >= 2 ? "text-emerald-400" : "text-slate-500"}`}>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Generating {targetDialect} DDL & STTM Matrix specs...</span>
                      </div>
                      <div className={`flex items-center gap-2 ${publishStep >= 3 ? "text-emerald-400 text-bold" : "text-slate-500"}`}>
                        <CheckCircle2 className="w-3.5 h-3.5 animate-pulse" />
                        <span>Pushing commit to remote branch {targetBranch}...</span>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {!publishResult && (
              <div className="bg-slate-50 p-4 border-t border-slate-200 flex justify-end gap-2">
                <button
                  onClick={() => setShowPublishModal(false)}
                  className="px-3.5 py-1.5 border border-slate-200 text-slate-600 rounded-lg text-xs font-semibold hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handlePublishRepo}
                  disabled={isPublishing}
                  className="px-4 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <GitPullRequest className="w-3.5 h-3.5" />
                  <span>{isPublishing ? "Publishing..." : "Commit & Publish Model"}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
