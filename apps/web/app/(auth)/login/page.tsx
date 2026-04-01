'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })

    const data = await res.json()

    if (!res.ok) {
      setError(data.error || 'Sign in failed')
      setLoading(false)
    } else {
      // Server set the auth cookie — hard navigate so middleware reads it
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
        <p className="text-[14px] text-[#6B7280] mt-1">Enter your credentials to access your aircraft records</p>
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
            placeholder="pilot@example.com" required autoComplete="email"
            className="w-full h-11 px-3.5 rounded-[10px] border border-[#E2E8F0] text-[14px] text-[#0D1117] placeholder:text-[#9CA3AF] outline-none focus:border-[#2563EB] focus:shadow-[0_0_0_3px_rgba(37,99,235,0.15)] transition-all bg-white"
          />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-[13px] font-medium text-[#374151]">Password</label>
            <Link href="/forgot-password" className="text-[12px] text-[#2563EB] hover:underline">Forgot password?</Link>
          </div>
          <div className="relative">
            <input
              type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••" required autoComplete="current-password"
              className="w-full h-11 px-3.5 pr-10 rounded-[10px] border border-[#E2E8F0] text-[14px] text-[#0D1117] placeholder:text-[#9CA3AF] outline-none focus:border-[#2563EB] focus:shadow-[0_0_0_3px_rgba(37,99,235,0.15)] transition-all bg-white"
            />
            <button type="button" onClick={() => setShowPass(!showPass)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9CA3AF] hover:text-[#6B7280]">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                {showPass
                  ? <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></>
                  : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>}
              </svg>
            </button>
          </div>
        </div>

        <button type="submit" disabled={loading}
          className="w-full h-11 flex items-center justify-center gap-2 text-[14px] font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-[10px] transition-all shadow-[0_2px_8px_rgba(37,99,235,0.25)] disabled:opacity-60 disabled:cursor-not-allowed">
          {loading ? (
            <span className="inline-flex items-center gap-1">
              {[0,1,2].map(i => <span key={i} style={{ width:5,height:5,borderRadius:'50%',background:'#fff',display:'inline-block',animation:`ma-pulse 1.2s ease-in-out ${i*0.2}s infinite` }}/>)}
              <style>{`@keyframes ma-pulse{0%,60%,100%{transform:scale(0.7);opacity:0.5}30%{transform:scale(1);opacity:1}}`}</style>
            </span>
          ) : 'Sign in'}
        </button>
      </form>

      <p className="text-center text-[13px] text-[#6B7280] mt-6">
        Don&apos;t have an account?{' '}
        <Link href="/signup" className="text-[#2563EB] font-medium hover:underline">Create one →</Link>
      </p>

      <p className="text-center text-[13px] text-[#9CA3AF] mt-3">
        Want to see it first?{' '}
        <Link href="/demo" className="text-[#6B7280] hover:text-[#2563EB] hover:underline transition-colors">Try the live demo →</Link>
      </p>
    </div>
  )
}
