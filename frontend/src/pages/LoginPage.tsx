import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff, Layers, Lock, Mail, Sparkles } from 'lucide-react';
import { authApi } from '../api/client';
import { useAuthStore } from '../store/useAuthStore';

/** Single-entry sign-in: first use is provisioned by the backend for this workspace. */
export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const signIn = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const tokenResponse = await authApi.login(email, password);
      const token = tokenResponse.data.access_token;
      useAuthStore.setState({ token });
      const userResponse = await authApi.me();
      login(userResponse.data, token);
      navigate('/dashboard');
    } catch (requestError: any) {
      setError(requestError.response?.data?.detail || 'Unable to sign in.');
    } finally { setLoading(false); }
  };

  return <div className="flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 p-4">
    <div className="pointer-events-none absolute inset-0"><div className="absolute left-[12%] top-[15%] h-80 w-80 rounded-full bg-orange-500/15 blur-3xl" /><div className="absolute bottom-[8%] right-[10%] h-96 w-96 rounded-full bg-sky-500/10 blur-3xl" /></div>
    <main className="relative w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.06] p-8 shadow-2xl backdrop-blur-xl transition-transform duration-300 hover:-translate-y-1">
      <div className="mb-8 text-center"><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#e67225] shadow-lg shadow-orange-500/25"><Layers className="h-7 w-7 text-white" /></div><h1 className="mt-4 text-2xl font-black tracking-tight text-white">SilverCraft AI</h1><p className="mt-1 text-sm text-slate-400">Sign in to your modeling workspace</p></div>
      {error && <div className="mb-4 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</div>}
      <form onSubmit={signIn} className="space-y-4">
        <label className="block text-xs font-bold text-slate-300">Email<div className="relative mt-1.5"><Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" className="w-full rounded-xl border border-white/10 bg-white/5 py-3 pl-10 pr-3 text-sm text-white outline-none transition focus:border-orange-400/70 focus:bg-white/10" /></div></label>
        <label className="block text-xs font-bold text-slate-300">Password<div className="relative mt-1.5"><Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><input required type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" className="w-full rounded-xl border border-white/10 bg-white/5 py-3 pl-10 pr-10 text-sm text-white outline-none transition focus:border-orange-400/70 focus:bg-white/10" /><button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></label>
        <button disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#e67225] py-3 text-sm font-black text-white shadow-lg shadow-orange-500/20 transition hover:-translate-y-0.5 hover:bg-[#cf5e19] disabled:opacity-60">{loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : <><Sparkles className="h-4 w-4" /> Sign in <ArrowRight className="h-4 w-4" /></>}</button>
      </form>
      <p className="mt-5 text-center text-[11px] leading-5 text-slate-500">Use your email and password. A first sign-in creates your local workspace profile.</p>
    </main>
  </div>;
};
