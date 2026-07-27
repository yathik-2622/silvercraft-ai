import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, BookOpen, Eye, Search, X } from 'lucide-react';
import { skillsApi } from '../api/client';

export const SkillLibraryPage: React.FC = () => {
  const navigate = useNavigate();
  const [skills, setSkills] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [preview, setPreview] = useState<any | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    skillsApi.list()
      .then((res) => setSkills(res.data ?? []))
      .catch((err) => setError(err.response?.data?.detail || 'Unable to load skills.'));
  }, []);

  const visible = skills.filter((skill) => {
    const q = search.trim().toLowerCase();
    return !q || [skill.name, skill.description, skill.content].join(' ').toLowerCase().includes(q);
  });

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/dashboard')} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-orange-50 hover:text-[#e67225]"><ArrowLeft className="h-4 w-4" /></button>
            <div className="flex items-center gap-2 text-sm font-black"><BookOpen className="h-4 w-4 text-[#e67225]" /> Skill Library</div>
          </div>
          <div className="relative w-80">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search skills..." className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-[#e67225]/60" />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-6">
        {error && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</div>}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((skill) => (
            <div key={skill.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-2 text-sm font-black">{skill.name}</div>
              <p className="min-h-[42px] text-xs leading-5 text-slate-500">{skill.description}</p>
              <button onClick={() => setPreview(skill)} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-50">
                <Eye className="h-3.5 w-3.5" /> Preview Skill
              </button>
            </div>
          ))}
        </div>
      </main>
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="max-h-[86vh] w-full max-w-3xl overflow-auto rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div><div className="text-sm font-black">{preview.name}</div><div className="text-xs text-slate-500">{preview.description}</div></div>
              <button onClick={() => setPreview(null)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button>
            </div>
              <div className="p-5">
                <div className="whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">{preview.content}</div>
                {preview.source_urls?.length > 0 && (
                  <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
                    <div className="text-xs font-black uppercase text-slate-500">Grounding Sources</div>
                    <div className="mt-2 space-y-1">
                      {preview.source_urls.map((url: string) => (
                        <a key={url} href={url} target="_blank" rel="noreferrer" className="block break-all text-xs font-semibold text-[#e67225] hover:underline">{url}</a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
          </div>
        </div>
      )}
    </div>
  );
};
