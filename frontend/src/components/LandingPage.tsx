import React, { useState, useEffect } from "react";
import {
  Shield,
  Mail,
  KeyRound,
  ArrowRight,
  FolderKanban,
  Plus,
  Users,
  Clock,
  Trash2,
  Building2,
  Lock,
  Database,
  Layers,
  Sliders,
  Zap,
  Grid,
  ChevronRight,
  FolderPlus,
  CheckCircle2,
  Sparkles,
  PanelLeftClose,
  PanelLeft,
  User,
  LayoutGrid,
  ArrowLeft,
  Settings,
  Rocket
} from "lucide-react";
import { FoundationLayer, WorkflowType } from "../types";

interface LandingPageProps {
  onStartModeling: (layer: FoundationLayer, workflow: WorkflowType, presetId?: string) => void;
  initialStep?: number;
  isSignedIn?: boolean;
  onSignIn?: (email: string, role: string) => void;
}

interface ProjectItem {
  id: string;
  name: string;
  domain: string;
  description: string;
  memberCount: number;
  lastUpdated: string;
  isShared?: boolean;
  layer?: "foundation" | "product";
  workflow?: WorkflowType;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onStartModeling,
  initialStep = 1,
  isSignedIn: externalIsSignedIn,
  onSignIn
}) => {
  // Auth state
  const [isSignedIn, setIsSignedIn] = useState<boolean>(externalIsSignedIn ?? false);
  const [email, setEmail] = useState("user1@enterprise.com");
  const [password, setPassword] = useState("••••••••••••");
  const [userRole, setUserRole] = useState("Lead Data Architect");
  const [organization, setOrganization] = useState("Tiger Analytics / Enterprise Data");

  useEffect(() => {
    if (externalIsSignedIn !== undefined) {
      setIsSignedIn(externalIsSignedIn);
    }
  }, [externalIsSignedIn]);

  // Left Collapsible Pane State
  const [isLeftPaneOpen, setIsLeftPaneOpen] = useState<boolean>(true);

  // Canvas View Mode: "dashboard" (overview of My Projects & Other Projects) vs "project_config" (selected project details)
  const [canvasMode, setCanvasMode] = useState<"dashboard" | "project_config">("dashboard");

  // Dashboard Tab: "my_projects" vs "other_projects"
  const [dashboardTab, setDashboardTab] = useState<"my_projects" | "other_projects">("my_projects");

  // Projects State with configured layer & workflow
  const [myProjects, setMyProjects] = useState<ProjectItem[]>([
    {
      id: "p-1",
      name: "Lakehouse Foundation Model",
      domain: "Financial & Core Banking",
      description: "Enterprise foundation data layer modeling for standardized domain entities and canonical schemas.",
      memberCount: 3,
      lastUpdated: "Today",
      layer: "foundation",
      workflow: "default"
    },
    {
      id: "p-2",
      name: "Customer 360 Mart",
      domain: "Retail & E-Commerce",
      description: "Omnichannel customer profile data modeling and behavioral event aggregation.",
      memberCount: 4,
      lastUpdated: "2 days ago",
      layer: "product",
      workflow: "customized"
    }
  ]);

  const [otherProjects] = useState<ProjectItem[]>([
    {
      id: "op-1",
      name: "Enterprise Risk Data Vault",
      domain: "Risk & Compliance",
      description: "Core banking risk calculation model with historical auditability and compliance tracking.",
      memberCount: 6,
      lastUpdated: "3 days ago",
      isShared: true,
      layer: "foundation",
      workflow: "default"
    },
    {
      id: "op-2",
      name: "Supply Chain Realtime Mart",
      domain: "Logistics & Operations",
      description: "Global inventory tracking dimensional data mart for real-time order fulfillment analytics.",
      memberCount: 5,
      lastUpdated: "1 week ago",
      isShared: true,
      layer: "product",
      workflow: "customized"
    },
    {
      id: "op-3",
      name: "Global Finance Clearing",
      domain: "Finance & Accounting",
      description: "Cross-border ledger reconciliation canonical schema for automated transaction settlement.",
      memberCount: 8,
      lastUpdated: "2 weeks ago",
      isShared: true,
      layer: "foundation",
      workflow: "default"
    }
  ]);

  // Selected Active Project
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>("p-1");
  const [isSharedSelected, setIsSharedSelected] = useState<boolean>(false);

  // Active Project Details
  const [projectDetails, setProjectDetails] = useState({
    name: "Lakehouse Foundation Model",
    domain: "Financial & Core Banking",
    description: "Enterprise foundation data layer modeling for standardized domain entities and canonical schemas."
  });

  // Layer Strategy: "foundation" vs "product"
  const [selectedLayer, setSelectedLayer] = useState<"foundation" | "product">("foundation");

  // Workflow Strategy: "default" vs "customized"
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowType>("default");

  // Team Members State for Active Project
  const [teamMembers, setTeamMembers] = useState([
    { id: "1", name: "Greeshma P", email: "user1@enterprise.com", role: "Owner & Lead Modeler" },
    { id: "2", name: "Alex Chen", email: "alex.chen@enterprise.com", role: "Data Engineer" },
    { id: "3", name: "Sarah Jenkins", email: "sarah.j@enterprise.com", role: "Domain Reviewer" }
  ]);
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [newMemberRole, setNewMemberRole] = useState("Data Engineer");

  // Handle Sign In Submit
  const handleSignInSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSignedIn(true);
    if (onSignIn) {
      onSignIn(email, userRole);
    }
  };

  // Open Dashboard View
  const handleGoToDashboard = () => {
    setCanvasMode("dashboard");
  };

  // Select My Project
  const handleSelectMyProject = (project: ProjectItem) => {
    setSelectedProjectId(project.id);
    setIsSharedSelected(false);
    setProjectDetails({
      name: project.name,
      domain: project.domain,
      description: project.description
    });
    setSelectedLayer(project.layer || "foundation");
    setSelectedWorkflow(project.workflow || "default");
    setCanvasMode("project_config");
  };

  // Direct Launch My Project
  const handleDirectLaunchMyProject = (project: ProjectItem) => {
    setSelectedProjectId(project.id);
    setIsSharedSelected(false);
    const chosenLayer = project.layer || "foundation";
    const chosenWorkflow = project.workflow || "default";
    onStartModeling(chosenLayer === "foundation" ? "silver" : "gold", chosenWorkflow);
  };

  // Select Shared Project
  const handleSelectSharedProject = (project: ProjectItem) => {
    setSelectedProjectId(project.id);
    setIsSharedSelected(true);
    setProjectDetails({
      name: project.name,
      domain: project.domain,
      description: project.description
    });
    setSelectedLayer(project.layer || "foundation");
    setSelectedWorkflow(project.workflow || "default");
    setCanvasMode("project_config");
  };

  // Direct Launch Shared Project
  const handleDirectLaunchSharedProject = (project: ProjectItem) => {
    setSelectedProjectId(project.id);
    setIsSharedSelected(true);
    const chosenLayer = project.layer || "foundation";
    const chosenWorkflow = project.workflow || "default";
    onStartModeling(chosenLayer === "foundation" ? "silver" : "gold", chosenWorkflow);
  };

  // Create New Project Action
  const handleStartCreateNewProject = () => {
    const newId = `p-${Date.now()}`;
    const newProj: ProjectItem = {
      id: newId,
      name: `New Data Layer Model ${myProjects.length + 1}`,
      domain: "Cross-Domain Analytics",
      description: "Standardized canonical data model for enterprise data lakehouse.",
      memberCount: 1,
      lastUpdated: "Just now",
      layer: "foundation",
      workflow: "default"
    };
    setMyProjects((prev) => [newProj, ...prev]);
    setSelectedProjectId(newId);
    setIsSharedSelected(false);
    setProjectDetails({
      name: newProj.name,
      domain: newProj.domain,
      description: newProj.description
    });
    setSelectedLayer("foundation");
    setSelectedWorkflow("default");
    setCanvasMode("project_config");
  };

  // Helper for updating active project details & persisting to myProjects state
  const updateProjectDetails = (updated: { name?: string; domain?: string; description?: string }) => {
    const newDetails = { ...projectDetails, ...updated };
    setProjectDetails(newDetails);
    if (selectedProjectId && !isSharedSelected) {
      setMyProjects((prev) =>
        prev.map((p) => (p.id === selectedProjectId ? { ...p, ...updated } : p))
      );
    }
  };

  // Handler for changing layer strategy
  const handleLayerChange = (layer: "foundation" | "product") => {
    setSelectedLayer(layer);
    if (selectedProjectId && !isSharedSelected) {
      setMyProjects((prev) =>
        prev.map((p) => (p.id === selectedProjectId ? { ...p, layer } : p))
      );
    }
  };

  // Handler for changing workflow strategy
  const handleWorkflowChange = (workflow: WorkflowType) => {
    setSelectedWorkflow(workflow);
    if (selectedProjectId && !isSharedSelected) {
      setMyProjects((prev) =>
        prev.map((p) => (p.id === selectedProjectId ? { ...p, workflow } : p))
      );
    }
  };

  // Team Member Actions
  const handleAddMember = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberEmail.trim()) return;
    const nameFromEmail = newMemberEmail.split("@")[0].replace(".", " ");
    const formattedName = nameFromEmail.charAt(0).toUpperCase() + nameFromEmail.slice(1);
    setTeamMembers((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        name: formattedName,
        email: newMemberEmail,
        role: newMemberRole
      }
    ]);
    setNewMemberEmail("");
  };

  const handleRemoveMember = (id: string) => {
    setTeamMembers((prev) => prev.filter((m) => m.id !== id));
  };

  /* -------------------------------------------------------------------------
     VIEW 1: STANDALONE SIGN-IN PAGE (When NOT signed in)
     ------------------------------------------------------------------------- */
  if (!isSignedIn) {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] bg-gradient-to-br from-slate-100 via-slate-50 to-orange-50/20 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-3xl p-8 shadow-xl space-y-6">
          <div className="text-center space-y-3">
            <div className="w-14 h-14 bg-[#e67225]/10 text-[#e67225] rounded-2xl flex items-center justify-center mx-auto shadow-2xs border border-[#e67225]/20">
              <Shield className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Assisted Data Modeling</h2>
              <p className="text-xs text-slate-500 mt-1">
                Enter your credentials to access Project Dashboard & Layer Workflows
              </p>
            </div>
          </div>

            <form onSubmit={handleSignInSubmit} className="space-y-4 text-xs">
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">Email Address</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-[#e67225]/30 focus:border-[#e67225] text-xs transition-all"
                    placeholder="name@company.com"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">Password</label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-[#e67225]/30 focus:border-[#e67225] text-xs transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">Role</label>
                <select
                  value={userRole}
                  onChange={(e) => setUserRole(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#e67225]/30 text-xs"
                >
                  <option value="Lead Data Architect">Lead Data Architect</option>
                  <option value="Principal Modeler">Principal Modeler</option>
                  <option value="Data Engineer">Data Engineer</option>
                  <option value="Domain Reviewer">Domain Reviewer</option>
                </select>
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-[#e67225] hover:bg-[#d0621a] text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer mt-2"
              >
                <span>Sign in</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
        </div>
      </div>
    );
  }

  /* Get Active Project Name for Side Nav display */
  const activeProjectObj = myProjects.find((p) => p.id === selectedProjectId) ||
    otherProjects.find((p) => p.id === selectedProjectId);

  /* -------------------------------------------------------------------------
     VIEW 2: PROJECT DASHBOARD WITH LEFT COLLAPSIBLE PANE & MAIN CANVAS
     ------------------------------------------------------------------------- */
  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col md:flex-row bg-slate-100 text-slate-800 overflow-hidden">
      
      {/* =========================================================================
          LEFT COLLAPSIBLE NAVIGATION PANE ("NAVIGATOR BAR - DASHBOARD")
          ========================================================================= */}
      <aside
        className={`bg-white border-r border-slate-200 flex flex-col transition-all duration-300 ease-in-out shrink-0 z-20 ${
          isLeftPaneOpen ? "w-full md:w-80" : "w-full md:w-16"
        }`}
      >
        {/* Left Navigator Header */}
        <div className="p-3 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          {isLeftPaneOpen ? (
            <div
              onClick={handleGoToDashboard}
              className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
            >
              <div className="w-7 h-7 rounded-lg bg-[#e67225] text-white flex items-center justify-center font-bold text-xs shadow-2xs">
                <LayoutGrid className="w-4 h-4" />
              </div>
              <div>
                <span className="font-extrabold text-sm text-slate-900 tracking-tight block leading-none">
                  Dashboard
                </span>
                <span className="text-[10px] text-slate-500 font-medium mt-0.5 block">Project Navigator</span>
              </div>
            </div>
          ) : (
            <div
              onClick={handleGoToDashboard}
              className="w-7 h-7 rounded-lg bg-[#e67225] text-white flex items-center justify-center font-bold text-xs mx-auto cursor-pointer"
              title="Go to Dashboard"
            >
              <LayoutGrid className="w-4 h-4" />
            </div>
          )}

          <button
            onClick={() => setIsLeftPaneOpen(!isLeftPaneOpen)}
            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
            title={isLeftPaneOpen ? "Collapse Left Pane" : "Expand Left Pane"}
          >
            {isLeftPaneOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeft className="w-4 h-4 mx-auto" />}
          </button>
        </div>

        {/* Navigator Pane Body */}
        {isLeftPaneOpen ? (
          <div className="flex-1 overflow-y-auto p-3 space-y-5 no-scrollbar">
            
            {/* DASHBOARD OVERVIEW BUTTON */}
            <button
              onClick={handleGoToDashboard}
              className={`w-full p-2.5 rounded-xl border text-xs font-bold flex items-center justify-between transition-all cursor-pointer ${
                canvasMode === "dashboard"
                  ? "bg-[#e67225] text-white border-[#e67225] shadow-xs"
                  : "bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200"
              }`}
            >
              <div className="flex items-center gap-2">
                <LayoutGrid className="w-4 h-4" />
                <span>Dashboard Overview</span>
              </div>
              <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded font-mono font-bold">
                {myProjects.length + otherProjects.length}
              </span>
            </button>
          </div>
        ) : (
          /* COLLAPSED ICON STRIP */
          <div className="flex-1 py-4 flex flex-col items-center gap-4">
            <button
              onClick={handleGoToDashboard}
              className={`p-2 rounded-xl transition-all cursor-pointer ${
                canvasMode === "dashboard" ? "bg-[#e67225] text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
              title="Dashboard Overview"
            >
              <LayoutGrid className="w-5 h-5" />
            </button>
          </div>
        )}
      </aside>

      {/* =========================================================================
          RIGHT MAIN DISPLAY CANVAS (DASHBOARD MODE VS PROJECT CONFIG MODE)
          ========================================================================= */}
      <main className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
        
        {/* -----------------------------------------------------------------------
            CANVAS MODE A: DASHBOARD OVERVIEW (TABBED DISPLAY FOR MY PROJECTS & OTHER PROJECTS)
            ----------------------------------------------------------------------- */}
        {canvasMode === "dashboard" && (
          <div className="space-y-6 animate-fadeIn">
            
            {/* Dashboard Welcome Header (Light theme) */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-2xs space-y-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#e67225]/10 text-[#e67225] border border-[#e67225]/20 rounded-full text-[11px] font-bold">
                <Sparkles className="w-3.5 h-3.5 text-[#e67225]" />
                <span>Enterprise Assisted Data Modeling Studio</span>
              </div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                Welcome to Assisted Data Modeling Studio
              </h1>
              <p className="text-xs text-slate-600 max-w-2xl leading-relaxed">
                Select an existing data modeling project below to configure layer strategy and launch the interactive modeling workspace, or create a brand new enterprise model.
              </p>
            </div>

            {/* TAB NAVIGATION FOR MY PROJECTS VS OTHER PROJECTS */}
            <div className="bg-white border border-slate-200 p-2 rounded-2xl shadow-2xs flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-1">
                <button
                  onClick={() => setDashboardTab("my_projects")}
                  className={`flex-1 md:flex-none px-5 py-2.5 rounded-xl font-extrabold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    dashboardTab === "my_projects"
                      ? "bg-[#e67225] text-white shadow-xs"
                      : "bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200"
                  }`}
                >
                  <FolderKanban className="w-4 h-4" />
                  <span>My Projects</span>
                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                    dashboardTab === "my_projects" ? "bg-white/20 text-white" : "bg-slate-200 text-slate-700"
                  }`}>
                    {myProjects.length === 0 ? "None" : myProjects.length}
                  </span>
                </button>

                <button
                  onClick={() => setDashboardTab("other_projects")}
                  className={`flex-1 md:flex-none px-5 py-2.5 rounded-xl font-extrabold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    dashboardTab === "other_projects"
                      ? "bg-amber-600 text-white shadow-xs"
                      : "bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200"
                  }`}
                >
                  <Building2 className="w-4 h-4" />
                  <span>Other Projects (Shared with Me)</span>
                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                    dashboardTab === "other_projects" ? "bg-white/20 text-white" : "bg-amber-100 text-amber-800"
                  }`}>
                    {otherProjects.length}
                  </span>
                </button>
              </div>

              {/* Embossed Button in Header */}
              <button
                onClick={handleStartCreateNewProject}
                className="hidden md:flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-[#e67225] to-[#d0621a] hover:from-[#d0621a] text-white text-xs font-extrabold rounded-xl shadow-xs border-b-2 border-[#803105] cursor-pointer"
              >
                <Plus className="w-4 h-4 stroke-[3]" />
                <span>New Project</span>
              </button>
            </div>

            {/* TAB CONTENT 1: MY PROJECTS */}
            {dashboardTab === "my_projects" && (
              <div className="space-y-4">
                {myProjects.length === 0 ? (
                  /* FIRST RUN EMPTY STATE WHEN MY PROJECTS = NONE */
                  <div className="bg-white border-2 border-dashed border-slate-300 rounded-2xl p-8 text-center space-y-6 shadow-2xs">
                    <div className="w-16 h-16 bg-[#e67225]/10 text-[#e67225] rounded-2xl flex items-center justify-center mx-auto border border-[#e67225]/30">
                      <FolderPlus className="w-8 h-8" />
                    </div>

                    <div className="max-w-md mx-auto space-y-2">
                      <div className="inline-block bg-slate-100 text-slate-700 px-3 py-1 rounded-full text-xs font-bold border border-slate-200">
                        My Projects: None
                      </div>
                      <h3 className="text-lg font-bold text-slate-900">No Projects Found on First Run</h3>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        You do not have any personal projects initialized yet. Click the embossed button below to create your first data layer model project and start modeling.
                      </p>
                    </div>

                    {/* EMBOSSED CREATE NEW PROJECT CARD / BUTTON */}
                    <div className="max-w-md mx-auto pt-2">
                      <button
                        onClick={handleStartCreateNewProject}
                        className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-[#e67225] via-[#ea7a2d] to-[#d0621a] hover:from-[#d0621a] hover:to-[#b85212] text-white font-extrabold text-sm shadow-xl border-b-4 border-[#8c3708] active:translate-y-0.5 active:border-b-2 transition-all flex items-center justify-center gap-3 cursor-pointer group"
                      >
                        <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                          <Plus className="w-5 h-5 text-white stroke-[3]" />
                        </div>
                        <span>+ Create New Project</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  /* MY PROJECTS GRID (WITH EMBOSSED CARD AS FIRST ITEM) */
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    
                    {/* EMBOSSED CREATE NEW PROJECT CARD */}
                    <div
                      onClick={handleStartCreateNewProject}
                      className="p-5 rounded-2xl bg-gradient-to-br from-orange-50 via-white to-amber-50 border-2 border-dashed border-[#e67225] hover:border-[#d0621a] shadow-md hover:shadow-lg transition-all cursor-pointer flex flex-col items-center justify-center text-center space-y-3 group min-h-[220px]"
                    >
                      <div className="w-12 h-12 rounded-2xl bg-[#e67225] text-white flex items-center justify-center shadow-md group-hover:scale-110 transition-transform">
                        <Plus className="w-6 h-6 stroke-[3]" />
                      </div>
                      <div>
                        <h3 className="font-extrabold text-sm text-[#e67225] group-hover:text-[#d0621a]">
                          + Create New Project
                        </h3>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Initialize a new enterprise data layer schema
                        </p>
                      </div>
                    </div>

                    {/* MY PROJECTS LIST CARDS */}
                    {myProjects.map((proj) => (
                      <div
                        key={proj.id}
                        className="bg-white border border-slate-200 hover:border-[#e67225] rounded-2xl p-5 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between space-y-4 group"
                      >
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] bg-[#e67225]/10 text-[#e67225] font-bold px-2 py-0.5 rounded border border-[#e67225]/20">
                              {proj.domain}
                            </span>
                            <span className="text-[10px] text-slate-400 font-medium">{proj.lastUpdated}</span>
                          </div>

                          <h3
                            onClick={() => handleSelectMyProject(proj)}
                            className="font-bold text-sm text-slate-900 group-hover:text-[#e67225] transition-colors cursor-pointer"
                          >
                            {proj.name}
                          </h3>

                          <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                            {proj.description}
                          </p>

                          {/* Configured Style Badges */}
                          <div className="flex items-center gap-1.5 pt-1">
                            <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 uppercase">
                              {proj.layer || "foundation"} Layer
                            </span>
                            <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-orange-50 text-[#e67225] border border-orange-200 uppercase">
                              {proj.workflow === "customized" ? "Custom Flow" : "Default Flow"}
                            </span>
                          </div>
                        </div>

                        <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs gap-2">
                          <button
                            onClick={() => handleSelectMyProject(proj)}
                            className="flex items-center gap-1 text-slate-600 hover:text-slate-900 font-bold text-[11px] cursor-pointer"
                          >
                            <Settings className="w-3.5 h-3.5 text-slate-400" />
                            <span>Config</span>
                          </button>

                          <button
                            onClick={() => handleDirectLaunchMyProject(proj)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#e67225] hover:bg-[#d0621a] text-white font-extrabold text-[11px] shadow-2xs transition-all cursor-pointer"
                          >
                            <Rocket className="w-3.5 h-3.5" />
                            <span>Launch</span>
                          </button>
                        </div>
                      </div>
                    ))}

                  </div>
                )}
              </div>
            )}

            {/* TAB CONTENT 2: OTHER PROJECTS (SHARED WITH ME) */}
            {dashboardTab === "other_projects" && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {otherProjects.map((proj) => (
                    <div
                      key={proj.id}
                      className="bg-white border border-slate-200 hover:border-amber-400 rounded-2xl p-5 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between space-y-4 group"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] bg-slate-100 text-slate-700 font-bold px-2 py-0.5 rounded border border-slate-200">
                            {proj.domain}
                          </span>
                          <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded border border-amber-300 flex items-center gap-1">
                            <Lock className="w-3 h-3" /> Shared Read-Only
                          </span>
                        </div>

                        <h3
                          onClick={() => handleSelectSharedProject(proj)}
                          className="font-bold text-sm text-slate-900 group-hover:text-amber-700 transition-colors cursor-pointer"
                        >
                          {proj.name}
                        </h3>

                        <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                          {proj.description}
                        </p>

                        {/* Configured Style Badges */}
                        <div className="flex items-center gap-1.5 pt-1">
                          <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 uppercase">
                            {proj.layer || "foundation"} Layer
                          </span>
                          <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 uppercase">
                            {proj.workflow === "customized" ? "Custom Flow" : "Default Flow"}
                          </span>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs gap-2">
                        <button
                          onClick={() => handleSelectSharedProject(proj)}
                          className="flex items-center gap-1 text-slate-600 hover:text-slate-900 font-bold text-[11px] cursor-pointer"
                        >
                          <Settings className="w-3.5 h-3.5 text-slate-400" />
                          <span>View Config</span>
                        </button>

                        <button
                          onClick={() => handleDirectLaunchSharedProject(proj)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-[11px] shadow-2xs transition-all cursor-pointer"
                        >
                          <Rocket className="w-3.5 h-3.5" />
                          <span>Launch</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        )}

        {/* -----------------------------------------------------------------------
            CANVAS MODE B: CHOSEN PROJECT CONFIGURATION & LAUNCH WORKSPACE
            ----------------------------------------------------------------------- */}
        {canvasMode === "project_config" && (
          <div className="space-y-6 animate-fadeIn">
            
            {/* Top Bar with Back to Dashboard Button & Breadcrumb */}
            <div className="flex items-center justify-between bg-white p-3 px-4 rounded-xl border border-slate-200 shadow-2xs">
              <button
                onClick={handleGoToDashboard}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors cursor-pointer border border-slate-300"
              >
                <ArrowLeft className="w-4 h-4 text-[#e67225]" />
                <span>← Back to Dashboard Overview</span>
              </button>

              <div className="flex items-center gap-2 text-xs text-slate-500 font-semibold">
                <span>Dashboard</span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
                <span className="text-[#e67225] font-bold">{projectDetails.name}</span>
              </div>
            </div>

            {/* SPLIT TO TWO HALVES: LEFT HALF (CONFIG & TEAM) | RIGHT HALF (ARCHITECTURE LAYER & WORKFLOW STRATEGY & LAUNCH) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              
              {/* LEFT HALF: PROJECT CONFIGURATION & TEAM */}
              <div className="space-y-6">
                
                {/* PROJECT CONFIGURATION SECTION */}
                <div className={`bg-white border rounded-2xl p-6 shadow-2xs space-y-5 ${
                  isSharedSelected ? "border-amber-300 bg-amber-50/20" : "border-slate-200"
                }`}>
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold ${
                        isSharedSelected ? "bg-amber-100 text-amber-700" : "bg-[#e67225]/10 text-[#e67225]"
                      }`}>
                        <FolderPlus className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="font-bold text-sm text-slate-900">
                          {isSharedSelected ? "Shared Project Parameters" : "Project Parameters"}
                        </h3>
                        <p className="text-[11px] text-slate-500">
                          {isSharedSelected ? "Read-only organization view" : "Editable data layer details"}
                        </p>
                      </div>
                    </div>

                    {isSharedSelected ? (
                      <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-2.5 py-1 rounded-lg border border-amber-300">
                        Read-Only Access
                      </span>
                    ) : (
                      <span className="text-[10px] bg-emerald-50 text-emerald-700 font-bold px-2.5 py-1 rounded-lg border border-emerald-200">
                        Editable Owner Access
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Project Name</label>
                      {isSharedSelected ? (
                        <div className="w-full bg-slate-50 text-slate-900 p-2.5 rounded-xl border border-slate-200 font-bold">
                          {projectDetails.name}
                        </div>
                      ) : (
                        <input
                          type="text"
                          value={projectDetails.name}
                          onChange={(e) => updateProjectDetails({ name: e.target.value })}
                          className="w-full bg-slate-50 text-slate-900 p-2.5 rounded-xl border border-slate-200 font-bold focus:outline-none focus:ring-2 focus:ring-[#e67225]/30 focus:border-[#e67225]"
                        />
                      )}
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Domain Context</label>
                      {isSharedSelected ? (
                        <div className="w-full bg-slate-50 text-slate-900 p-2.5 rounded-xl border border-slate-200 font-semibold">
                          {projectDetails.domain}
                        </div>
                      ) : (
                        <input
                          type="text"
                          value={projectDetails.domain}
                          onChange={(e) => updateProjectDetails({ domain: e.target.value })}
                          className="w-full bg-slate-50 text-slate-900 p-2.5 rounded-xl border border-slate-200 font-semibold focus:outline-none focus:ring-2 focus:ring-[#e67225]/30 focus:border-[#e67225]"
                        />
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Description / Goal Notes</label>
                    {isSharedSelected ? (
                      <div className="w-full bg-slate-50 text-slate-900 p-2.5 rounded-xl border border-slate-200 text-xs">
                        {projectDetails.description}
                      </div>
                    ) : (
                      <input
                        type="text"
                        value={projectDetails.description}
                        onChange={(e) => updateProjectDetails({ description: e.target.value })}
                        className="w-full bg-slate-50 text-slate-900 p-2.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-[#e67225]/30 focus:border-[#e67225]"
                      />
                    )}
                  </div>
                </div>

                {/* TEAM COLLABORATORS SECTION */}
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-2xs space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-[#e67225]/10 text-[#e67225] flex items-center justify-center font-bold">
                        <Users className="w-4 h-4" />
                      </div>
                      <h3 className="font-bold text-sm text-slate-900">Project Collaborators & Team</h3>
                    </div>
                    <span className="text-[10px] bg-slate-100 text-slate-700 font-mono font-bold px-2.5 py-1 rounded-lg border border-slate-200">
                      {teamMembers.length} Members
                    </span>
                  </div>

                  {!isSharedSelected && (
                    <form onSubmit={handleAddMember} className="flex items-center gap-2 text-xs">
                      <div className="relative flex-1">
                        <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
                        <input
                          type="email"
                          placeholder="Invite team member email..."
                          value={newMemberEmail}
                          onChange={(e) => setNewMemberEmail(e.target.value)}
                          className="w-full pl-8 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-[#e67225]/30 focus:border-[#e67225]"
                        />
                      </div>
                      <select
                        value={newMemberRole}
                        onChange={(e) => setNewMemberRole(e.target.value)}
                        className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-900 text-xs font-medium cursor-pointer"
                      >
                        <option value="Lead Modeler">Lead Modeler</option>
                        <option value="Data Engineer">Data Engineer</option>
                        <option value="Domain Reviewer">Domain Reviewer</option>
                        <option value="Architect">Architect</option>
                      </select>
                      <button
                        type="submit"
                        className="px-4 py-2.5 bg-[#e67225] hover:bg-[#d0621a] text-white font-bold text-xs rounded-xl shadow-2xs transition-colors cursor-pointer shrink-0"
                      >
                        Add
                      </button>
                    </form>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                    {teamMembers.map((member) => (
                      <div key={member.id} className="bg-slate-50 border border-slate-200 p-3 rounded-xl flex items-center justify-between text-xs">
                        <div>
                          <div className="font-bold text-slate-900">{member.name}</div>
                          <div className="text-[10px] text-slate-500 font-mono">{member.email}</div>
                          <span className="text-[9px] font-bold text-[#e67225] bg-[#e67225]/10 px-1.5 py-0.2 rounded border border-[#e67225]/30 inline-block mt-1">
                            {member.role}
                          </span>
                        </div>
                        {!isSharedSelected && teamMembers.length > 1 && (
                          <button
                            onClick={() => handleRemoveMember(member.id)}
                            className="p-1 text-slate-400 hover:text-red-600 transition-colors cursor-pointer"
                            title="Remove member"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

              </div>

              {/* RIGHT HALF: ARCHITECTURE LAYER & WORKFLOW STRATEGY SELECTION & LAUNCH WORKSPACE */}
              <div className="space-y-6">
                
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-2xs space-y-5">
                  <div>
                    <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                      <Sliders className="w-4 h-4 text-[#e67225]" />
                      <span>Architecture Layer & Workflow Strategy</span>
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Configured choices for <strong className="text-slate-800">{projectDetails.name}</strong>.
                    </p>
                  </div>

                  {/* Architecture Layer Selection */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block">
                      1. Architecture Layer Strategy
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Foundation Layer Card */}
                      <div
                        onClick={() => handleLayerChange("foundation")}
                        className={`p-4 rounded-xl border cursor-pointer transition-all ${
                          selectedLayer === "foundation"
                            ? "bg-white border-[#e67225] ring-2 ring-[#e67225]/20 shadow-2xs"
                            : "bg-slate-50 border-slate-200 hover:border-[#e67225]/50"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <Database className="w-4 h-4 text-[#e67225]" />
                            <h4 className="font-bold text-xs text-slate-900">Foundation Layer</h4>
                          </div>
                          {selectedLayer === "foundation" && <CheckCircle2 className="w-4 h-4 text-[#e67225]" />}
                        </div>
                        <p className="text-[11px] text-slate-600 leading-relaxed">
                          Design canonical 3NF schemas, normalized entities, and STTM mapping matrix specs.
                        </p>
                      </div>

                      {/* Product Layer Card */}
                      <div
                        onClick={() => handleLayerChange("product")}
                        className={`p-4 rounded-xl border cursor-pointer transition-all ${
                          selectedLayer === "product"
                            ? "bg-white border-amber-500 ring-2 ring-amber-500/20 shadow-2xs"
                            : "bg-slate-50 border-slate-200 hover:border-amber-300"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <Layers className="w-4 h-4 text-amber-600" />
                            <h4 className="font-bold text-xs text-slate-900">Product Layer</h4>
                          </div>
                          {selectedLayer === "product" && <CheckCircle2 className="w-4 h-4 text-amber-600" />}
                        </div>
                        <p className="text-[11px] text-slate-600 leading-relaxed">
                          Construct business-ready dimensional fact/dimension tables and star schemas.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Workflow Strategy Selection */}
                  <div className="space-y-2 pt-3 border-t border-slate-100">
                    <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block">
                      2. Execution Workflow Strategy
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Default Workflow */}
                      <div
                        onClick={() => handleWorkflowChange("default")}
                        className={`p-4 rounded-xl border cursor-pointer transition-all ${
                          selectedWorkflow === "default"
                            ? "bg-white border-[#e67225] ring-2 ring-[#e67225]/20 shadow-2xs"
                            : "bg-slate-50 border-slate-200 hover:border-[#e67225]/50"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <Sliders className="w-4 h-4 text-[#e67225]" />
                            <h4 className="font-bold text-xs text-slate-900">Default Workflow</h4>
                          </div>
                          {selectedWorkflow === "default" && <CheckCircle2 className="w-4 h-4 text-[#e67225]" />}
                        </div>
                        <p className="text-[11px] text-slate-600 leading-relaxed">
                          Interactive 4-stage pipeline with modeling bot assistant and real-time ER canvas.
                        </p>
                      </div>

                      {/* Customized Workflow */}
                      <div
                        onClick={() => handleWorkflowChange("customized")}
                        className={`p-4 rounded-xl border cursor-pointer transition-all ${
                          selectedWorkflow === "customized"
                            ? "bg-white border-amber-500 ring-2 ring-amber-500/20 shadow-2xs"
                            : "bg-slate-50 border-slate-200 hover:border-amber-300"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <Grid className="w-4 h-4 text-amber-600" />
                            <h4 className="font-bold text-xs text-slate-900">Custom Workflow</h4>
                          </div>
                          {selectedWorkflow === "customized" && <CheckCircle2 className="w-4 h-4 text-amber-600" />}
                        </div>
                        <p className="text-[11px] text-slate-600 leading-relaxed">
                          Agent marketplace, custom pipeline sequence builder, and multi-agent execution.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* LAUNCH STUDIO BAR */}
                  <div className="bg-white border border-slate-200 p-5 rounded-2xl space-y-3 shadow-2xs mt-4">
                    <div>
                      <h3 className="font-bold text-sm text-slate-900">Ready to Launch Workspace?</h3>
                      <p className="text-xs text-slate-600 mt-0.5">
                        Target Layer: <strong className="text-[#e67225] capitalize">{selectedLayer} Layer</strong> | Flow: <strong className="text-amber-700 font-bold">{selectedWorkflow === "default" ? "Default Dual-Pane" : "Custom Sequence"}</strong>
                      </p>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center gap-2.5 pt-1">
                      <button
                        onClick={() => onStartModeling("silver", "default", "preset-ecommerce-silver")}
                        className="w-full sm:w-auto px-3.5 py-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold border border-slate-200 transition-colors cursor-pointer"
                      >
                        Sample Preset
                      </button>

                      <button
                        onClick={() => onStartModeling(selectedLayer === "foundation" ? "silver" : "gold", selectedWorkflow)}
                        className="w-full sm:flex-1 flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#e67225] hover:bg-[#d0621a] text-white text-xs font-bold shadow-2xs transition-all cursor-pointer"
                      >
                        <Rocket className="w-4 h-4" />
                        <span>Launch Modeling Workspace</span>
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                </div>

              </div>

            </div>

          </div>
        )}

      </main>
    </div>
  );
};
