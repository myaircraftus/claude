'use client'
import { useState } from 'react'
import Link from 'next/link'
import { Plane } from 'lucide-react'
import { createBrowserSupabase } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

function PasswordStrength({ password }: { password: string }) {
  const score = [/.{8,}/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter(r => r.test(password)).length
  const colors = ['#e2e8f0', '#ef4444', '#f59e0b', '#3b82f6', '#10b981']
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong']
  if (!password) return null
  return (
    <div className="mt-2 flex items-center gap-2">
      <div className="flex gap-1 flex-1">
        {[1, 2, 3, 4].map(i => (
          <div key={i} style={{ height: 3, flex: 1, borderRadius: 2, background: i <= score ? colors[score] : '#e2e8f0', transition: 'background 200ms' }} />
        ))}
      </div>
      <span className="text-[11px] font-medium" style={{ color: colors[score] }}>{labels[score]}</span>
    </div>
  )
}

export default function SignUpPage() {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const supabase = createBrowserSupabase()
    const fullName = [firstName, lastName].filter(Boolean).join(' ')
    const { error: err } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, role },
        emailRedirectTo: `${window.location.origin}/dashboard`,
      },
    })
    if (err) {
      setError(err.message)
      setLoading(false)
    } else {
      setDone(true)
    }
  }

  const inputClass = "w-full h-11 px-3.5 rounded-xl text-[14px] text-[#0f172a] placeholder:text-[#94a3b8] outline-none transition-all"
  const inputStyle = { background: '#f1f3f8', border: '1px solid transparent' }
  function focusStyle(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) {
    e.target.style.borderColor = '#0c2d6b'
    e.target.style.background = '#fff'
    e.target.style.boxShadow = '0 0 0 3px rgba(12,45,107,0.1)'
  }
  function blurStyle(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) {
    e.target.style.borderColor = 'transparent'
    e.target.style.background = '#f1f3f8'
    e.target.style.boxShadow = 'none'
  }

  if (done) return (
    <div className="h-screen flex items-center justify-center bg-[#f8f9fb]">
      <div className="bg-white rounded-2xl p-10 text-center max-w-sm w-full mx-4 shadow-lg">
        <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5" style={{ background: '#ecfdf5', border: '2px solid #a7f3d0' }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <h2 className="text-[24px] font-bold text-[#0f172a] mb-2">Check your email</h2>
        <p className="text-[14px] text-[#64748b] mb-1">We sent a confirmation link to</p>
        <p className="text-[14px] font-semibold text-[#0f172a] mb-6">{email}</p>
        <p className="text-[13px] text-[#94a3b8]">Click the link to activate your account, then{' '}
          <Link href="/signin" className="text-[#0c2d6b] hover:underline font-medium">sign in</Link>.
        </p>
      </div>
    </div>
  )

  return (
    <div className="h-screen flex overflow-hidden">
      {/* Left panel — navy with hangar image */}
      <div className="hidden lg:flex lg:w-1/2 relative flex-col p-12" style={{ background: '#0c2d6b' }}>
        <img
          src="https://images.unsplash.com/photo-1760089885613-e8861963223a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjZXNzbmElMjBhaXJwbGFuZSUyMGhhbmdhcnxlbnwxfHx8fDE3NzUxMzE0OTd8MA&ixlib=rb-4.1.0&q=80&w=1080"
          alt="Aircraft hangar"
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

          <div className="mt-auto">
            <h2 className="text-white text-[36px] font-bold leading-tight tracking-tight mb-4">
              Start organizing your aircraft records today.
            </h2>
            <p className="text-[15px] leading-relaxed mb-8" style={{ color: 'rgba(255,255,255,0.65)' }}>
              14-day free trial. No credit card required.
            </p>

            <div className="flex flex-col gap-3">
              {[
                'Upload any aviation document — PDFs, scans, photos',
                'AI automatically classifies and indexes everything',
                'Ask questions, get answers with page citations',
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

      {/* Right panel — signup form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-white overflow-y-auto">
        <div className="w-full max-w-[420px]">
          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#0c2d6b' }}>
              <Plane className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-[14px] text-[#0f172a]">myaircraft</span>
          </div>

          <div className="mb-8">
            <h1 className="text-[28px] font-bold text-[#0f172a] tracking-tight">Create your account</h1>
            <p className="text-[14px] text-[#64748b] mt-1">14-day free trial. No credit card required.</p>
          </div>

          {error && (
            <div className="mb-5 px-4 py-3 rounded-xl text-[13px]" style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b' }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[13px] font-medium text-[#374151] mb-1.5">First name</label>
                <input
                  type="text" value={firstName} onChange={e => setFirstName(e.target.value)}
                  placeholder="Alex" required autoComplete="given-name"
                  className={inputClass} style={inputStyle}
                  onFocus={focusStyle} onBlur={blurStyle}
                />
              </div>
              <div>
                <label className="block text-[13px] font-medium text-[#374151] mb-1.5">Last name</label>
                <input
                  type="text" value={lastName} onChange={e => setLastName(e.target.value)}
                  placeholder="Chen" required autoComplete="family-name"
                  className={inputClass} style={inputStyle}
                  onFocus={focusStyle} onBlur={blurStyle}
                />
              </div>
            </div>

            <div>
              <label className="block text-[13px] font-medium text-[#374151] mb-1.5">Email</label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com" required autoComplete="email"
                className={inputClass} style={inputStyle}
                onFocus={focusStyle} onBlur={blurStyle}
              />
            </div>

            <div>
              <label className="block text-[13px] font-medium text-[#374151] mb-1.5">Password</label>
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="Create a strong password" required minLength={8} autoComplete="new-password"
                className={inputClass} style={inputStyle}
                onFocus={focusStyle} onBlur={blurStyle}
              />
              <PasswordStrength password={password} />
            </div>

            <div>
              <label className="block text-[13px] font-medium text-[#374151] mb-1.5">I am a...</label>
              <select
                value={role} onChange={e => setRole(e.target.value)}
                className="w-full h-11 px-3.5 rounded-xl text-[14px] text-[#0f172a] outline-none transition-all appearance-none"
                style={{ ...inputStyle, backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' strokeWidth='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }}
                onFocus={focusStyle as any} onBlur={blurStyle as any}
              >
                <option value="">Select your role...</option>
                <option value="owner">Aircraft Owner</option>
                <option value="pilot">Pilot</option>
                <option value="mechanic">A&P Mechanic / IA</option>
                <option value="fleet_manager">Fleet Manager</option>
                <option value="broker">Broker / Buyer</option>
                <option value="other">Other</option>
              </select>
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
                  Creating account...
                </span>
              ) : 'Create Account'}
            </button>
          </form>

          <p className="text-center text-[13px] text-[#64748b] mt-6">
            Already have an account?{' '}
            <Link href="/signin" className="text-[#0c2d6b] font-medium hover:underline">Sign in →</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
