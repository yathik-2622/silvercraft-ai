import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Folder, FolderOpen, Clock, Users, Layers,
  LogOut, Settings, ChevronRight, Sparkles, GitBranch,
  BarChart2, Search, Grid, List, Zap, Edit3, Trash2, UserPlus, SlidersHorizontal, X
} from 'lucide-react';
import { projectsApi } from '../api/client';
import { useAuthStore } from '../store/useAuthStore';

interface Project {
  id: string;
  name: string;
  description?: string;
  owner_id: string;
  shared_with: string[];
  created_at: string;
  updated_at: string;
}

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [teamProject, setTeamProject] = useState<Project | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [memberEmail, setMemberEmail] = useState('');
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const res = await projectsApi.list();
      setProjects(res.data);
    } catch {
      // backend not running — show empty state gracefully
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await projectsApi.create(newName, newDesc);
      navigate(`/project/${res.data.id}/config`);
    } catch (err: any) {
      setActionError(err.response?.data?.detail || 'Unable to create project. Start the backend and database, then try again.');
    } finally {
      setCreating(false);
    }
  };

  const openEditModal = (project: Project) => {
    setEditingProject(project);
    setEditName(project.name);
    setEditDesc(project.description ?? '');
    setActionError('');
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProject) return;
    try {
      await projectsApi.update(editingProject.id, { name: editName, description: editDesc });
      setEditingProject(null);
      await fetchProjects();
    } catch (err: any) {
      setActionError(err.response?.data?.detail || 'Unable to update project');
    }
  };

  const handleDelete = async (project: Project) => {
    const ok = window.confirm(`Delete "${project.name}"? This removes the project for everyone.`);
    if (!ok) return;
    try {
      await projectsApi.delete(project.id);
      await fetchProjects();
    } catch (err: any) {
      setActionError(err.response?.data?.detail || 'Unable to delete project');
    }
  };

  const openTeamModal = (project: Project) => {
    setTeamProject(project);
    setMemberEmail('');
    setActionError('');
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamProject || !memberEmail.trim()) return;
    try {
      const res = await projectsApi.addTeamMember(teamProject.id, memberEmail.trim());
      setTeamProject(res.data);
      setMemberEmail('');
      await fetchProjects();
    } catch (err: any) {
      setActionError(err.response?.data?.detail || 'Unable to add team member');
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!teamProject) return;
    try {
      const res = await projectsApi.removeTeamMember(teamProject.id, memberId);
      setTeamProject(res.data);
      await fetchProjects();
    } catch (err: any) {
      setActionError(err.response?.data?.detail || 'Unable to remove team member');
    }
  };

  const myProjects = projects.filter((p) => p.owner_id === user?.id);
  const sharedProjects = projects.filter((p) => p.owner_id !== user?.id);

  const filteredProjects = (list: Project[]) =>
    list.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));

  const timeAgo = (dateStr: string) => {
    const d = new Date(dateStr);
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  const ProjectCard: React.FC<{ project: Project; shared?: boolean }> = ({ project, shared }) => (
    <div
      onClick={() => navigate(`/project/${project.id}/config`)}
      className="group bg-white border border-slate-200 rounded-2xl p-5 cursor-pointer hover:border-[#e67225]/40 hover:shadow-lg hover:-translate-y-1 transition-all duration-200"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="w-10 h-10 bg-[#e67225]/10 rounded-xl flex items-center justify-center group-hover:bg-[#e67225]/20 transition-colors">
          {shared ? <FolderOpen className="w-5 h-5 text-[#e67225]" /> : <Folder className="w-5 h-5 text-[#e67225]" />}
        </div>
        {shared && (
          <span className="text-[10px] font-bold bg-blue-50 text-blue-600 border border-blue-200 px-2 py-0.5 rounded-full">
            Shared
          </span>
        )}
      </div>
      <h3 className="font-bold text-slate-900 text-sm mb-1 line-clamp-1">{project.name}</h3>
      {project.description && (
        <p className="text-xs text-slate-500 mb-3 line-clamp-2">{project.description}</p>
      )}
      <div className="flex items-center gap-3 text-[10px] text-slate-400 border-t border-slate-100 pt-3 mt-3">
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" /> {timeAgo(project.updated_at)}
        </span>
        {project.shared_with.length > 0 && (
          <span className="flex items-center gap-1">
            <Users className="w-3 h-3" /> {project.shared_with.length} members
          </span>
        )}
        <span className="ml-auto flex items-center gap-1 text-[#e67225] font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
          Builder <ChevronRight className="w-3 h-3" />
        </span>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <button
          onClick={(e) => { e.stopPropagation(); navigate(`/project/${project.id}/config`); }}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#e67225]/10 text-[#e67225] text-[11px] font-bold hover:bg-[#e67225]/20 transition-colors"
          title="Edit project configuration"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" /> Config
        </button>
        {!shared && (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); openEditModal(project); }}
              className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition-colors"
              title="Edit project details"
            >
              <Edit3 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); openTeamModal(project); }}
              className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-blue-700 hover:bg-blue-50 transition-colors"
              title="Manage team members"
            >
              <UserPlus className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); handleDelete(project); }}
              className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-rose-700 hover:bg-rose-50 transition-colors"
              title="Delete project"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  );

  const EmptyState = () => (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 bg-[#e67225]/10 rounded-2xl flex items-center justify-center mb-4">
        <Sparkles className="w-8 h-8 text-[#e67225]" />
      </div>
      <h3 className="text-lg font-bold text-slate-900 mb-2">Start your first project</h3>
      <p className="text-sm text-slate-500 max-w-sm mb-6">
        Create a new data modeling project and let SilverCraft AI guide you through the Medallion Architecture.
      </p>
      <button
        onClick={() => setShowNewModal(true)}
        className="flex items-center gap-2 bg-[#e67225] hover:bg-[#d0621a] text-white font-bold px-5 py-2.5 rounded-xl text-sm transition-all shadow-lg hover:shadow-[#e67225]/30"
      >
        <Plus className="w-4 h-4" /> Create Project
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Topbar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#e67225] rounded-lg flex items-center justify-center">
              <Layers className="w-4 h-4 text-white" />
            </div>
            <span className="font-black text-slate-900 text-sm">SilverCraft AI</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/settings')}
              className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <Settings className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg">
              <div className="w-6 h-6 bg-[#e67225] rounded-full flex items-center justify-center text-white text-xs font-bold">
                {user?.full_name?.charAt(0) ?? 'U'}
              </div>
              <span className="text-xs font-semibold text-slate-700 hidden md:block">{user?.full_name}</span>
            </div>
            <button
              onClick={() => { logout(); navigate('/login'); }}
              className="p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {actionError && (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
            {actionError}
          </div>
        )}
        {/* Hero */}
        <div className="mb-8">
          <h1 className="text-2xl font-black text-slate-900 mb-1">
            Welcome back, {user?.full_name?.split(' ')[0]} 👋
          </h1>
          <p className="text-slate-500 text-sm">Your data modeling projects and team workspaces</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { icon: Folder, label: 'My Projects', value: myProjects.length, color: 'text-[#e67225] bg-[#e67225]/10' },
            { icon: Users, label: 'Shared with Me', value: sharedProjects.length, color: 'text-blue-600 bg-blue-50' },
            { icon: GitBranch, label: 'Active Workflows', value: 0, color: 'text-emerald-600 bg-emerald-50' },
            { icon: BarChart2, label: 'Artifacts Generated', value: 0, color: 'text-violet-600 bg-violet-50' },
          ].map(({ icon: Icon, label, value, color }) => (
            <div key={label} className="bg-white border border-slate-200 rounded-xl p-4">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${color}`}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="text-xl font-black text-slate-900">{value}</div>
              <div className="text-xs text-slate-500">{label}</div>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between mb-5">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search projects..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:border-[#e67225]/50"
            />
          </div>
          <div className="flex items-center gap-2">
            <div className="flex border border-slate-200 rounded-lg overflow-hidden bg-white">
              <button onClick={() => setViewMode('grid')} className={`p-2 ${viewMode === 'grid' ? 'bg-[#e67225] text-white' : 'text-slate-500 hover:bg-slate-50'} transition-colors`}>
                <Grid className="w-4 h-4" />
              </button>
              <button onClick={() => setViewMode('list')} className={`p-2 ${viewMode === 'list' ? 'bg-[#e67225] text-white' : 'text-slate-500 hover:bg-slate-50'} transition-colors`}>
                <List className="w-4 h-4" />
              </button>
            </div>
            <button
              onClick={() => setShowNewModal(true)}
              className="flex items-center gap-2 bg-[#e67225] hover:bg-[#d0621a] text-white font-bold px-4 py-2 rounded-xl text-sm transition-all shadow-sm hover:shadow-md"
            >
              <Plus className="w-4 h-4" /> New Project
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-[#e67225]/30 border-t-[#e67225] rounded-full animate-spin" />
          </div>
        ) : projects.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-8">
            {myProjects.length > 0 && (
              <section>
                <h2 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                  <Folder className="w-4 h-4 text-[#e67225]" /> My Projects
                </h2>
                <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4' : 'space-y-2'}>
                  {filteredProjects(myProjects).map((p) => (
                    <ProjectCard key={p.id} project={p} />
                  ))}
                </div>
              </section>
            )}
            {sharedProjects.length > 0 && (
              <section>
                <h2 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-500" /> Shared with Me
                </h2>
                <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4' : 'space-y-2'}>
                  {filteredProjects(sharedProjects).map((p) => (
                    <ProjectCard key={p.id} project={p} shared />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </main>

      {/* New Project Modal */}
      {showNewModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden">
            <div className="bg-[#e67225] px-6 py-4 flex items-center gap-3">
              <Zap className="w-5 h-5 text-white" />
              <h3 className="text-white font-bold text-base">Create New Project</h3>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1.5">Project Name *</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  required
                  placeholder="e.g. E-Commerce Silver Layer"
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#e67225]/60"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1.5">Description</label>
                <textarea
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  rows={3}
                  placeholder="Brief description of the modeling project..."
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#e67225]/60 resize-none"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-1 py-2.5 bg-[#e67225] hover:bg-[#d0621a] text-white font-bold rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
                >
                  {creating ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><ChevronRight className="w-4 h-4" /> Configure Project</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingProject && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden">
            <div className="bg-[#e67225] px-6 py-4 flex items-center justify-between">
              <h3 className="text-white font-bold text-base">Edit Project</h3>
              <button onClick={() => setEditingProject(null)} className="text-white/80 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleEdit} className="p-6 space-y-4">
              {actionError && <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{actionError}</div>}
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1.5">Project Name</label>
                <input value={editName} onChange={(e) => setEditName(e.target.value)} required className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#e67225]/60" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1.5">Description</label>
                <textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} rows={3} className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#e67225]/60 resize-none" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setEditingProject(null)} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
                <button type="submit" className="flex-1 py-2.5 bg-[#e67225] hover:bg-[#d0621a] text-white font-bold rounded-xl text-sm">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {teamProject && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden">
            <div className="bg-[#e67225] px-6 py-4 flex items-center justify-between">
              <h3 className="text-white font-bold text-base">Team Members</h3>
              <button onClick={() => setTeamProject(null)} className="text-white/80 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 space-y-4">
              {actionError && <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{actionError}</div>}
              <form onSubmit={handleAddMember} className="flex gap-2">
                <input
                  type="email"
                  value={memberEmail}
                  onChange={(e) => setMemberEmail(e.target.value)}
                  placeholder="member@company.com"
                  className="flex-1 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#e67225]/60"
                />
                <button type="submit" className="px-4 py-2.5 bg-[#e67225] hover:bg-[#d0621a] text-white font-bold rounded-xl text-sm flex items-center gap-2">
                  <UserPlus className="w-4 h-4" /> Add
                </button>
              </form>
              <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
                {teamProject.shared_with.length === 0 ? (
                  <div className="p-4 text-sm text-slate-500 text-center">No team members added yet.</div>
                ) : (
                  teamProject.shared_with.map((memberId) => (
                    <div key={memberId} className="p-3 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-xs font-bold text-slate-800">Team member</div>
                        <div className="text-[11px] font-mono text-slate-500">{memberId}</div>
                      </div>
                      <button onClick={() => handleRemoveMember(memberId)} className="p-1.5 text-slate-400 hover:text-rose-700 hover:bg-rose-50 rounded-lg" title="Remove member">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
              <button onClick={() => setTeamProject(null)} className="w-full py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50">Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
