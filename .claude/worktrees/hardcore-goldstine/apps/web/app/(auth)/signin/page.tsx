'use client'
import { useState } from 'react'
import Link from 'next/link'
import { Plane } from 'lucide-react'
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
    <div className="h-screen flex overflow-hidden">
      {/* Left panel — navy with cockpit image */}
      <div className="hidden lg:flex lg:w-1/2 relative flex-col items-start justify-between p-12" style={{ background: '#0c2d6b' }}>
        {/* Background photo */}
        <img
          src="https://images.unsplash.com/photo-1772354838120-a78234bf7316?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwcml2YXRlJTIwYWlyY3JhZnQlMjBjb2NrcGl0JTIwbHV4dXJ5fGVufDF8fHx8MTc3NTEzMTQ5Nnww&ixlib=rb-4.1.0&q=80&w=1080"
          alt="Aircraft cockpit"
          className="absolute inset-0 w-full h-full object-cover"
          style={{ opacity: 0.25 }}
        />
        <div className="relative z-10 flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.15)' }}>
              <Plane className="w-5 h-5 text-white" />
            </div>
            <span className="text-white text-[17px] font-semibold tracking-tight">myaircraft</span>
          </div>

          {/* Tagline */}
          <div className="mt-auto">
            <h2 className="text-white text-[36px] font-bold leading-tight tracking-tight mb-4">
              Your aircraft records,<br />finally organized.
            </h2>
            <p className="text-[15px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.65)' }}>
              Upload logbooks, POH, and maintenance records. Ask questions in plain English. Get exact answers with page-level citations.
            </p>

            <div className="mt-8 flex flex-col gap-3">
              {[
                'Citation-backed answers from your documents',
                'AI-powered document classification',
                'Maintenance reminders & AD tracking',
              ].map(item => (
                <div key={item} className="flex items-center gap-2.5">
                  <div className="w-4 h-4 rounded-full flex items-center justify-center shrink-0" style={{ background: 'rgba(255,255,255,0.2)' }}>
                    <svg width="8" height="8" viewBox="0 0 12 12" fill="none">
                      <polyline points="2 6 5 9 10 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <span className="text-[13px]" style={{ color: 'rgba(255,255,255,0.75)' }}>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Right panel — sign in form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-white">
        <div className="w-full max-w-[400px]">
          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#0c2d6b' }}>
              <Plane className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-[14px] text-[#0f172a]">myaircraft</span>
          </div>

          <div className="mb-8">
            <h1 className="text-[28px] font-bold text-[#0f172a] tracking-tight">Welcome back</h1>
            <p className="text-[14px] text-[#64748b] mt-1">Sign in to your account to continue.</p>
          </div>

          {error && (
            <div className="mb-5 px-4 py-3 rounded-xl text-[13px]" style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b' }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[13px] font-medium text-[#374151] mb-1.5">Email</label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com" required autoComplete="email"
                className="w-full h-11 px-3.5 rounded-xl text-[14px] text-[#0f172a] placeholder:text-[#94a3b8] outline-none transition-all"
                style={{ background: '#f1f3f8', border: '1px solid transparent' }}
                onFocus={e => { e.target.style.borderColor = '#0c2d6b'; e.target.style.background = '#fff'; e.target.style.boxShadow = '0 0 0 3px rgba(12,45,107,0.1)' }}
                onBlur={e => { e.target.style.borderColor = 'transparent'; e.target.style.background = '#f1f3f8'; e.target.style.boxShadow = 'none' }}
              />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-[#374151] mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••" required autoComplete="current-password"
                  className="w-full h-11 px-3.5 pr-10 rounded-xl text-[14px] text-[#0f172a] placeholder:text-[#94a3b8] outline-none transition-all"
                  style={{ background: '#f1f3f8', border: '1px solid transparent' }}
                  onFocus={e => { e.target.style.borderColor = '#0c2d6b'; e.target.style.background = '#fff'; e.target.style.boxShadow = '0 0 0 3px rgba(12,45,107,0.1)' }}
                  onBlur={e => { e.target.style.borderColor = 'transparent'; e.target.style.background = '#f1f3f8'; e.target.style.boxShadow = 'none' }}
                />
                <button type="button" onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94a3b8] hover:text-[#64748b] transition-colors">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    {showPass
                      ? <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></>
                      : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>
                    }
                  </svg>
                </button>
              </div>
              <div className="flex justify-end mt-1.5">
                <Link href="/forgot-password" className="text-[12px] text-[#0c2d6b] hover:underline font-medium">Forgot password?</Link>
              </div>
            </div>

            <button type="submit" disabled={loading}
              className="w-full h-11 flex items-center justify-center gap-2 text-[14px] font-semibold text-white rounded-xl transition-all disabled:opacity-60 disabled:cursor-not-allowed mt-2"
              style={{ background: '#0c2d6b', boxShadow: '0 2px 8px rgba(12,45,107,0.25)' }}
            >
              {loading ? (
                <span className="inline-flex items-center gap-1.5">
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Signing in...
                </span>
              ) : 'Sign In'}
            </button>
          </form>

          <p className="text-center text-[13px] text-[#64748b] mt-6">
            Don&apos;t have an account?{' '}
            <Link href="/signup" className="text-[#0c2d6b] font-medium hover:underline">Create one →</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
