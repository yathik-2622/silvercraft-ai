import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Download, Eye, Search, Store, Wrench, X } from 'lucide-react';
import { marketplaceApi, skillsApi } from '../api/client';

export const MarketplacePage: React.FC = () => {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<any[]>([]);
  const [skills, setSkills] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [preview, setPreview] = useState<any | null>(null);
  const [installing, setInstalling] = useState('');
  const [error, setError] = useState('');

  const load = async (q = search) => {
    try {
      const res = await marketplaceApi.listTemplates(q);
      setTemplates(res.data.templates ?? []);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Unable to load marketplace templates.');
    }
  };

  useEffect(() => {
    load('');
    skillsApi.list().then((res) => setSkills(res.data ?? [])).catch(() => setSkills([]));
  }, []);

  const skillsForTemplate = (template: any) =>
    skills.filter((skill) => (template.suggested_tools ?? []).includes(skill.key) || (template.suggested_tools ?? []).includes(skill.name));

  const install = async (template: any) => {
    setInstalling(template.template_id);
    try {
      await marketplaceApi.installTemplate(template.template_id);
      await load();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Unable to install template.');
    } finally {
      setInstalling('');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/dashboard')} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-orange-50 hover:text-[#e67225]"><ArrowLeft className="h-4 w-4" /></button>
            <div className="flex items-center gap-2 text-sm font-black"><Store className="h-4 w-4 text-[#e67225]" /> Agent Marketplace</div>
          </div>
          <div className="relative w-80">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => { setSearch(e.target.value); load(e.target.value); }} placeholder="Search agents, tools, skills..." className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-[#e67225]/60" />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-6">
        {error && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {templates.map((tpl) => (
            <div key={tpl.template_id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-black text-slate-900">{tpl.name}</div>
                  <div className="mt-1 text-[11px] font-bold uppercase tracking-wide text-[#e67225]">{tpl.category} · {tpl.framework}</div>
                </div>
                {tpl.installed && <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-black text-emerald-700">Installed</span>}
              </div>
              <p className="min-h-[44px] text-xs leading-5 text-slate-500">{tpl.description}</p>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {(tpl.suggested_tools ?? []).map((tool: string) => <span key={tool} className="inline-flex items-center gap-1 rounded-full border border-blue-100 bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-700"><Wrench className="h-3 w-3" /> {tool}</span>)}
                {(tpl.tags ?? []).slice(0, 3).map((tag: string) => <span key={tag} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-bold text-slate-500">{tag}</span>)}
              </div>
              <div className="mt-5 flex gap-2">
                <button onClick={() => setPreview(tpl)} className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 py-2 text-xs font-black text-slate-600 hover:bg-slate-50"><Eye className="h-3.5 w-3.5" /> Preview</button>
                <button disabled={tpl.installed || installing === tpl.template_id} onClick={() => install(tpl)} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#e67225] py-2 text-xs font-black text-white disabled:opacity-50">
                  {tpl.installed ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />} {tpl.installed ? 'Installed' : installing === tpl.template_id ? 'Installing' : 'Install'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </main>
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="max-h-[86vh] w-full max-w-3xl overflow-auto rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div><div className="text-sm font-black">{preview.name}</div><div className="text-xs text-slate-500">Agent skills and system prompt preview</div></div>
              <button onClick={() => setPreview(null)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-4 p-5">
              <p className="text-sm leading-6 text-slate-600">{preview.description}</p>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-black uppercase text-slate-500">Skills</div>
                <div className="mt-3 space-y-2">
                  {skillsForTemplate(preview).map((skill) => (
                    <div key={skill.id} className="rounded-xl border border-slate-200 bg-white p-3">
                      <div className="text-xs font-black text-slate-800">{skill.name}</div>
                      <div className="mt-1 text-xs leading-5 text-slate-500">{skill.description}</div>
                      <div className="mt-2 line-clamp-3 whitespace-pre-wrap text-[11px] leading-5 text-slate-400">{skill.content}</div>
                    </div>
                  ))}
                  {skillsForTemplate(preview).length === 0 && (preview.suggested_tools ?? []).map((skill: string) => <span key={skill} className="inline-flex rounded-full bg-white px-2 py-1 text-xs font-bold text-slate-700">{skill}</span>)}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-950 p-4 font-mono text-xs leading-5 text-slate-100 whitespace-pre-wrap">{preview.default_system_prompt}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
