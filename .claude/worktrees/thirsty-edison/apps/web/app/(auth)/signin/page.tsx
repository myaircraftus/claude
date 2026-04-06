'use client'
import { useState } from 'react'
import Link from 'next/link'
import { createBrowserSupabase } from '@/lib/supabase/client'

export default function SignInPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const supabase = createBrowserSupabase()
    const { error: err } = await supabase.auth.signInWithPassword({ email, password })
    if (err) {
      setError(err.message)
      setLoading(false)
    } else {
      window.location.href = '/dashboard'
    }
  }

  return (
    <div>
      <div className="mb-8">
        <div className="flex items-center gap-2 lg:hidden mb-6">
          <div className="w-7 h-7 rounded-[7px] bg-[#2563EB] flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3L20 8v2l-4 2v6l2 1v2l-6-2-6 2v-2l2-1v-6L4 10V8l8-5z"/>
            </svg>
          </div>
          <span className="font-semibold text-[14px]">myaircraft.us</span>
        </div>
        <h1 className="text-[28px] font-extrabold text-[#0D1117] tracking-tight">Welcome back</h1>
        <p className="text-[14px] text-[#6B7280] mt-1">Sign in to your account</p>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-[10px] bg-[#FEF2F2] border border-[#FECACA] text-[#991B1B] text-[13px]">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-[13px] font-medium text-[#374151] mb-1.5">Email</label>
          <input
            type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com" required autoComplete="email"
            className="w-full h-11 px-3.5 rounded-[10px] border border-[#E2E8F0] text-[14px] text-[#0D1117] placeholder:text-[#9CA3AF] outline-none focus:border-[#2563EB] focus:shadow-[0_0_0_3px_rgba(37,99,235,0.15)] transition-all"
          />
        </div>
        <div>
          <label className="block text-[13px] font-medium text-[#374151] mb-1.5">Password</label>
          <div className="relative">
            <input
              type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••" required autoComplete="current-password"
              className="w-full h-11 px-3.5 pr-10 rounded-[10px] border border-[#E2E8F0] text-[14px] text-[#0D1117] placeholder:text-[#9CA3AF] outline-none focus:border-[#2563EB] focus:shadow-[0_0_0_3px_rgba(37,99,235,0.15)] transition-all"
            />
            <button type="button" onClick={() => setShowPass(!showPass)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9CA3AF] hover:text-[#6B7280]">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                {showPass ? <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></> : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>}
              </svg>
            </button>
          </div>
          <div className="flex justify-end mt-1.5">
            <Link href="/forgot-password" className="text-[12px] text-[#2563EB] hover:underline">Forgot password?</Link>
          </div>
        </div>

        <button type="submit" disabled={loading}
          className="w-full h-11 flex items-center justify-center gap-2 text-[14px] font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-[10px] transition-all shadow-[0_2px_8px_rgba(37,99,235,0.25)] disabled:opacity-60 disabled:cursor-not-allowed">
          {loading ? (
            <span className="inline-flex items-center gap-1">
              {[0,1,2].map(i => <span key={i} style={{ width:5,height:5,borderRadius:'50%',background:'#fff',display:'inline-block',animation:`ma-pulse 1.2s ease-in-out ${i*0.2}s infinite` }}/>)}
              <style>{`@keyframes ma-pulse{0%,60%,100%{transform:scale(0.7);opacity:0.5}30%{transform:scale(1);opacity:1}}`}</style>
            </span>
          ) : 'Sign In'}
        </button>
      </form>

      <div className="flex items-center gap-3 my-5">
        <div className="flex-1 h-px bg-[#E2E8F0]"/>
        <span className="text-[12px] text-[#9CA3AF]">or</span>
        <div className="flex-1 h-px bg-[#E2E8F0]"/>
      </div>

      <button className="w-full h-11 flex items-center justify-center gap-2.5 text-[14px] font-medium text-[#374151] border border-[#E2E8F0] hover:bg-[#F8F9FB] hover:border-[#CBD5E1] rounded-[10px] transition-all">
        <svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
        Continue with Google
      </button>

      <p className="text-center text-[13px] text-[#6B7280] mt-6">
        Don&apos;t have an account?{' '}
        <Link href="/signup" className="text-[#2563EB] font-medium hover:underline">Create one →</Link>
      </p>
    </div>
  )
}
