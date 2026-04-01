'use client'
import { useState } from 'react'
import Link from 'next/link'
import { createBrowserSupabase } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

function PasswordStrength({ password }: { password: string }) {
  const score = [/.{8,}/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter(r => r.test(password)).length
  const colors = ['#E2E8F0', '#EF4444', '#F59E0B', '#3B82F6', '#10B981']
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong']
  if (!password) return null
  return (
    <div className="mt-2 flex items-center gap-2">
      <div className="flex gap-1 flex-1">
        {[1,2,3,4].map(i => (
          <div key={i} style={{ height: 3, flex: 1, borderRadius: 2, background: i <= score ? colors[score] : '#E2E8F0', transition: 'background 200ms' }}/>
        ))}
      </div>
      <span className="text-[11px] font-medium" style={{ color: colors[score] }}>{labels[score]}</span>
    </div>
  )
}

export default function SignUpPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) { setError('Passwords do not match'); return }
    setLoading(true); setError('')
    const supabase = createBrowserSupabase()
    const { error: err } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: name }, emailRedirectTo: `${window.location.origin}/dashboard` }
    })
    if (err) { setError(err.message); setLoading(false) }
    else setDone(true)
  }

  if (done) return (
    <div className="text-center">
      <div className="w-16 h-16 rounded-full bg-[#ECFDF5] border-2 border-[#A7F3D0] flex items-center justify-center mx-auto mb-5">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      </div>
      <h2 className="text-[24px] font-bold text-[#0D1117] mb-2">Check your email</h2>
      <p className="text-[14px] text-[#6B7280] mb-1">We sent a confirmation link to</p>
      <p className="text-[14px] font-semibold text-[#0D1117] mb-6">{email}</p>
      <p className="text-[13px] text-[#9CA3AF]">Click the link to activate your account, then <Link href="/signin" className="text-[#2563EB] hover:underline">sign in</Link>.</p>
    </div>
  )

  return (
    <div>
      <div className="mb-8">
        <div className="flex items-center gap-2 lg:hidden mb-6">
          <div className="w-7 h-7 rounded-[7px] bg-[#2563EB] flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3L20 8v2l-4 2v6l2 1v2l-6-2-6 2v-2l2-1v-6L4 10V8l8-5z"/></svg>
          </div>
          <span className="font-semibold text-[14px]">myaircraft.us</span>
        </div>
        <h1 className="text-[28px] font-extrabold text-[#0D1117] tracking-tight">Create your account</h1>
        <p className="text-[14px] text-[#6B7280] mt-1">Start with a free 14-day trial. No credit card required.</p>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-[10px] bg-[#FEF2F2] border border-[#FECACA] text-[#991B1B] text-[13px]">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {[
          { label: 'Full name', type: 'text', value: name, set: setName, placeholder: 'Alex Chen', auto: 'name' },
          { label: 'Email', type: 'email', value: email, set: setEmail, placeholder: 'you@example.com', auto: 'email' },
        ].map(f => (
          <div key={f.label}>
            <label className="block text-[13px] font-medium text-[#374151] mb-1.5">{f.label}</label>
            <input type={f.type} value={f.value} onChange={e => f.set(e.target.value)}
              placeholder={f.placeholder} required autoComplete={f.auto}
              className="w-full h-11 px-3.5 rounded-[10px] border border-[#E2E8F0] text-[14px] text-[#0D1117] placeholder:text-[#9CA3AF] outline-none focus:border-[#2563EB] focus:shadow-[0_0_0_3px_rgba(37,99,235,0.15)] transition-all"
            />
          </div>
        ))}
        <div>
          <label className="block text-[13px] font-medium text-[#374151] mb-1.5">Password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            placeholder="Create a strong password" required minLength={8} autoComplete="new-password"
            className="w-full h-11 px-3.5 rounded-[10px] border border-[#E2E8F0] text-[14px] text-[#0D1117] placeholder:text-[#9CA3AF] outline-none focus:border-[#2563EB] focus:shadow-[0_0_0_3px_rgba(37,99,235,0.15)] transition-all"
          />
          <PasswordStrength password={password}/>
        </div>
        <div>
          <label className="block text-[13px] font-medium text-[#374151] mb-1.5">Confirm password</label>
          <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
            placeholder="Repeat your password" required autoComplete="new-password"
            className={`w-full h-11 px-3.5 rounded-[10px] border text-[14px] text-[#0D1117] placeholder:text-[#9CA3AF] outline-none transition-all ${confirm && confirm !== password ? 'border-[#EF4444] focus:shadow-[0_0_0_3px_rgba(239,68,68,0.15)]' : 'border-[#E2E8F0] focus:border-[#2563EB] focus:shadow-[0_0_0_3px_rgba(37,99,235,0.15)]'}`}
          />
          {confirm && confirm !== password && <p className="mt-1 text-[12px] text-[#EF4444]">Passwords do not match</p>}
        </div>
        <button type="submit" disabled={loading}
          className="w-full h-11 flex items-center justify-center text-[14px] font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-[10px] transition-all shadow-[0_2px_8px_rgba(37,99,235,0.25)] disabled:opacity-60 mt-2">
          {loading ? 'Creating account...' : 'Create account'}
        </button>
      </form>

      <p className="text-center text-[13px] text-[#6B7280] mt-6">
        Already have an account?{' '}
        <Link href="/signin" className="text-[#2563EB] font-medium hover:underline">Sign in →</Link>
      </p>
    </div>
  )
}
