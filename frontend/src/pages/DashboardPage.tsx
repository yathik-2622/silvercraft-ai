import React, { useEffect, useState } from 'react';
import { FolderKanban, Layers, LogOut, Pencil, Plus, Settings, Share2, Trash2, Users, X, Sparkles, Database } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { projectsApi, settingsApi } from '../api/client';
import { useAuthStore } from '../store/useAuthStore';

type Layer = 'foundation' | 'product';
type Project = { id: string; name: string; description?: string; domain?: string; sub_domain?: string; layer?: Layer; collaborators?: string[] };
const initialForm = { name: '', domain: '', sub_domain: '', description: '', layer: 'foundation' as Layer, member: '', members: [] as string[] };

export const DashboardPage: React.FC = () => {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [owned, setOwned] = useState<Project[]>([]); const [shared, setShared] = useState<Project[]>([]);
  const [section, setSection] = useState<'owned' | 'shared'>('owned'); const [showProject, setShowProject] = useState(false); const [showSettings, setShowSettings] = useState(false);
  const [form, setForm] = useState(initialForm); const [editing, setEditing] = useState<Project | null>(null); const [provider, setProvider] = useState({ provider: 'platform', base_url: '', default_model: 'gpt-4o', api_key: '' });
  const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const load = async () => { try { const response = await projectsApi.grouped(); setOwned(response.data.owned_projects ?? []); setShared(response.data.collaborator_projects ?? []); } catch (e: any) { setError(e.response?.data?.detail || 'Unable to load projects.'); } };
  useEffect(() => { void load(); }, []);
  const openCreate = () => { setEditing(null); setForm(initialForm); setShowProject(true); };
  const editProject = (project: Project) => { setEditing(project); setForm({ name: project.name, domain: project.domain ?? '', sub_domain: project.sub_domain ?? '', description: project.description ?? '', layer: project.layer ?? 'foundation', member: '', members: project.collaborators ?? [] }); setShowProject(true); };
  const saveProject = async (event: React.FormEvent) => { event.preventDefault(); setSaving(true); try { const payload = { name: form.name, domain: form.domain, sub_domain: form.sub_domain, description: form.description, layer: form.layer, collaborators: form.members }; if (editing) await projectsApi.update(editing.id, payload); else await projectsApi.create({ ...payload, execution_flow: 'custom', workflow_mode: 'orchestrator' }); setShowProject(false); await load(); } catch (e: any) { setError(e.response?.data?.detail || 'Unable to save project.'); } finally { setSaving(false); } };
  const deleteProject = (project: Project) => setProjectToDelete(project);
  const executeDeleteProject = async () => { if (!projectToDelete) return; try { await projectsApi.delete(projectToDelete.id); await load(); setProjectToDelete(null); } catch (e: any) { setError(e.response?.data?.detail || 'Unable to delete project.'); setProjectToDelete(null); } };
  const openSettings = async () => { try { const response = await settingsApi.get(); setProvider({ provider: response.data.settings.provider ?? 'platform', base_url: response.data.settings.base_url ?? '', default_model: response.data.settings.default_model ?? 'gpt-4o', api_key: '' }); setShowSettings(true); } catch { setError('Unable to load LLM settings.'); } };
  const saveSettings = async (event: React.FormEvent) => { event.preventDefault(); try { await settingsApi.update(provider); setShowSettings(false); } catch (e: any) { setError(e.response?.data?.detail || 'Unable to save LLM settings.'); } };
  const current = section === 'owned' ? owned : shared;
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans selection:bg-[#e67225]/30">
      {/* Background ambient glow */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-[#e67225]/10 blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-blue-500/10 blur-[120px]" />
      </div>

      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-[#e67225] to-[#c95411] shadow-[0_0_20px_rgba(230,114,37,0.3)]">
              <Layers className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="text-sm font-bold tracking-tight text-slate-900">SilverCraft AI</div>
              <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Modeling Workspace</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => void openSettings()} className="rounded-full p-2.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900" title="LLM settings">
              <Settings className="h-4 w-4" />
            </button>
            <div className="h-4 w-px bg-slate-200" />
            <span className="hidden text-xs font-medium text-slate-600 sm:block">{user?.full_name || user?.email}</span>
            <button onClick={logout} className="rounded-full p-2.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900" title="Sign out">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-7xl px-6 py-12">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#e67225]/30 bg-[#e67225]/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-[#e67225]">
              <Sparkles className="h-3 w-3" /> Projects
            </div>
            <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">Your Workspaces</h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-600">
              Create a project, define your domain, and build data models entirely from a chat-first AI studio.
            </p>
          </div>
          <button onClick={openCreate} className="group relative inline-flex items-center gap-2 overflow-hidden rounded-full bg-slate-900 px-6 py-3 text-sm font-bold text-white shadow-[0_0_40px_rgba(0,0,0,0.1)] transition hover:scale-105 hover:shadow-[0_0_40px_rgba(0,0,0,0.2)]">
            <Plus className="h-4 w-4 transition group-hover:rotate-90" /> New Project
          </button>
        </div>

        <div className="mt-12 flex w-fit rounded-full border border-slate-200 bg-white p-1 shadow-sm backdrop-blur-md">
          <button onClick={() => setSection('owned')} className={`rounded-full px-5 py-2 text-xs font-bold transition ${section === 'owned' ? 'bg-slate-100 text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}>
            <FolderKanban className="mr-2 inline h-3.5 w-3.5" /> My projects ({owned.length})
          </button>
          <button onClick={() => setSection('shared')} className={`rounded-full px-5 py-2 text-xs font-bold transition ${section === 'shared' ? 'bg-slate-100 text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}>
            <Share2 className="mr-2 inline h-3.5 w-3.5" /> Shared ({shared.length})
          </button>
        </div>

        {loading ? (
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-44 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex h-10 w-10 animate-pulse items-center justify-center rounded-2xl bg-slate-100" />
                <div className="mt-6 h-5 w-1/2 animate-pulse rounded-full bg-slate-100" />
                <div className="mt-3 h-3 w-full animate-pulse rounded-full bg-slate-50" />
                <div className="mt-2 h-3 w-4/5 animate-pulse rounded-full bg-slate-50" />
              </div>
            ))}
          </div>
        ) : (
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {current.map((project) => (
            <article key={project.id} onClick={() => navigate(`/project/${project.id}/studio`)} className="group cursor-pointer rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition duration-300 hover:-translate-y-1.5 hover:border-slate-300 hover:shadow-xl">
              <div className="flex items-start justify-between gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-2xl bg-orange-100 text-orange-600 transition group-hover:bg-[#e67225] group-hover:text-white group-hover:shadow-[0_0_15px_rgba(230,114,37,0.4)]">
                  <Database className="h-4 w-4" />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-bold capitalize text-slate-600">
                    {project.layer || 'foundation'}
                  </span>
                  {section === 'owned' && (
                    <>
                      <button onClick={(event) => { event.stopPropagation(); editProject(project); }} className="rounded-full p-1.5 text-slate-400 opacity-0 transition hover:bg-slate-100 hover:text-slate-900 group-hover:opacity-100" title="Edit project">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={(event) => { event.stopPropagation(); void deleteProject(project); }} className="rounded-full p-1.5 text-slate-400 opacity-0 transition hover:bg-rose-100 hover:text-rose-600 group-hover:opacity-100" title="Delete project">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
              <h2 className="mt-5 text-lg font-bold text-slate-900">{project.name}</h2>
              <p className="mt-2 min-h-[2.5rem] text-xs leading-relaxed text-slate-500 line-clamp-2">
                {project.description || 'No description provided.'}
              </p>
              <div className="mt-5 flex items-center gap-2 border-t border-slate-100 pt-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                <span>{project.domain || 'Domain'}</span>
                {project.sub_domain && (
                  <>
                    <span className="h-1 w-1 rounded-full bg-slate-600" />
                    <span>{project.sub_domain}</span>
                  </>
                )}
              </div>
            </article>
          ))}
          {current.length === 0 && (
            <div className="col-span-full rounded-3xl border border-dashed border-slate-300 bg-white p-16 text-center shadow-sm">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-slate-50">
                <FolderKanban className="h-5 w-5 text-slate-400" />
              </div>
              <p className="mt-4 text-sm font-medium text-slate-500">
                {section === 'owned' ? 'No workspaces found. Create your first project to get started.' : 'No projects have been shared with you yet.'}
              </p>
            </div>
          )}
        </div>
        )}
      </main>

      {/* Modals with updated dark UI */}
      {showProject && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <form onSubmit={saveProject} className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
              <div>
                <h2 className="text-base font-bold text-slate-900">{editing ? 'Edit Workspace' : 'New Workspace'}</h2>
                <p className="mt-1 text-xs text-slate-500">Define the boundary for your data model.</p>
              </div>
              <button type="button" onClick={() => setShowProject(false)} className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-900"><X className="h-4 w-4" /></button>
            </div>
            <div className="grid gap-4 p-6">
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Project name" className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-[#e67225]/50 focus:bg-white focus:ring-4 focus:ring-[#e67225]/10" />
              <div className="grid grid-cols-2 gap-4">
                <input required value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} placeholder="Domain (e.g., Sales)" className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-[#e67225]/50 focus:bg-white focus:ring-4 focus:ring-[#e67225]/10" />
                <input required value={form.sub_domain} onChange={(e) => setForm({ ...form, sub_domain: e.target.value })} placeholder="Subdomain (e.g., Retail)" className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-[#e67225]/50 focus:bg-white focus:ring-4 focus:ring-[#e67225]/10" />
              </div>
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description (optional)" className="min-h-[100px] resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-[#e67225]/50 focus:bg-white focus:ring-4 focus:ring-[#e67225]/10" />
              <select value={form.layer} onChange={(e) => setForm({ ...form, layer: e.target.value as Layer })} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none focus:border-[#e67225]/50 focus:bg-white focus:ring-4 focus:ring-[#e67225]/10">
                <option value="foundation">Foundation Layer</option>
                <option value="product">Product Layer</option>
              </select>
              <div className="flex gap-2">
                <input value={form.member} onChange={(e) => setForm({ ...form, member: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const value = form.member.trim().toLowerCase(); if (value && !form.members.includes(value)) setForm({ ...form, member: '', members: [...form.members, value] }); } }} placeholder="Invite collaborator email..." className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-[#e67225]/50 focus:bg-white focus:ring-4 focus:ring-[#e67225]/10" />
                <button type="button" onClick={() => { const value = form.member.trim().toLowerCase(); if (value && !form.members.includes(value)) setForm({ ...form, member: '', members: [...form.members, value] }); }} className="rounded-xl bg-slate-100 border border-slate-200 px-4 text-xs font-bold text-slate-700 hover:bg-slate-200 transition"><Users className="mr-1.5 inline h-4 w-4" /> Add</button>
              </div>
              {form.members.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {form.members.map((email) => (
                    <span key={email} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600">
                      {email} <button type="button" onClick={() => setForm({ ...form, members: form.members.filter((value) => value !== email) })} className="text-slate-400 hover:text-slate-900"><X className="h-3 w-3" /></button>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4 rounded-b-3xl">
              <button type="button" onClick={() => setShowProject(false)} className="rounded-full px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-900 transition">Cancel</button>
              <button disabled={saving} className="rounded-full bg-slate-900 px-6 py-2 text-xs font-bold text-white transition hover:scale-105 disabled:opacity-50">
                {saving ? 'Saving...' : editing ? 'Save Changes' : 'Create Workspace'}
              </button>
            </div>
          </form>
        </div>
      )}

      {showSettings && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <form onSubmit={saveSettings} className="w-full max-w-md rounded-3xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
              <div>
                <h2 className="text-base font-bold text-slate-900">LLM Provider Settings</h2>
                <p className="mt-1 text-xs text-slate-500">Configure your model environment.</p>
              </div>
              <button type="button" onClick={() => setShowSettings(false)} className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-900"><X className="h-4 w-4" /></button>
            </div>
            <div className="grid gap-4 p-6">
              <select value={provider.provider} onChange={(e) => setProvider({ ...provider, provider: e.target.value, api_key: '' })} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none focus:border-[#e67225]/50 focus:bg-white focus:ring-4 focus:ring-[#e67225]/10">
                <option value="platform">Platform Provider (Default)</option>
                <option value="openai">OpenAI Override</option>
                <option value="openrouter">OpenRouter Override</option>
                <option value="groq">Groq Override</option>
                <option value="nvidia">NVIDIA Override</option>
                <option value="custom">Custom Override</option>
              </select>
              <input required value={provider.default_model} onChange={(e) => setProvider({ ...provider, default_model: e.target.value })} placeholder="Default Model (e.g. gpt-4o)" className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-[#e67225]/50 focus:bg-white focus:ring-4 focus:ring-[#e67225]/10" />
              {provider.provider !== 'platform' && (
                <>
                  <input value={provider.base_url} onChange={(e) => setProvider({ ...provider, base_url: e.target.value })} placeholder="Base URL (custom only)" className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-[#e67225]/50 focus:bg-white focus:ring-4 focus:ring-[#e67225]/10" />
                  <input type="password" required value={provider.api_key} onChange={(e) => setProvider({ ...provider, api_key: e.target.value })} placeholder="API Key" className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-[#e67225]/50 focus:bg-white focus:ring-4 focus:ring-[#e67225]/10" />
                </>
              )}
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4 rounded-b-3xl">
              <button type="button" onClick={() => setShowSettings(false)} className="rounded-full px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-900 transition">Cancel</button>
              <button className="rounded-full bg-slate-900 px-6 py-2 text-xs font-bold text-white transition hover:scale-105">Save Provider</button>
            </div>
          </form>
        </div>
      )}

      {error && (
        <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full border border-rose-500/30 bg-rose-950/90 px-5 py-2.5 text-xs font-bold text-rose-200 shadow-[0_10px_40px_rgba(225,29,72,0.3)] backdrop-blur-md">
          {error}
          <button onClick={() => setError('')} className="rounded-full p-1 hover:bg-rose-900"><X className="h-3 w-3" /></button>
        </div>
      )}

      {/* Delete Project Modal */}
      <AnimatePresence>
        {projectToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
              <h3 className="text-lg font-black text-slate-900">Delete Project</h3>
              <p className="mt-2 text-sm text-slate-500">Are you sure you want to delete “{projectToDelete.name}”? This removes its MongoDB project record and cannot be undone.</p>
              <div className="mt-6 flex justify-end gap-2">
                <button onClick={() => setProjectToDelete(null)} className="rounded-xl px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-50">Cancel</button>
                <button onClick={() => void executeDeleteProject()} className="rounded-xl bg-red-500 px-4 py-2 text-xs font-bold text-white hover:bg-red-600">Delete</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
