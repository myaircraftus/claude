import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Security — myaircraft.us',
  description: 'Enterprise-grade security for your most critical aviation records. AES-256 encryption, role-based access control, audit logs, and US-based data storage.',
}

const securityFeatures = [
  {
    icon: 'lock',
    title: 'AES-256 Encryption',
    description: 'All data is encrypted at rest using AES-256 and in transit via TLS 1.3. Your documents are never stored in plaintext.',
  },
  {
    icon: 'shield',
    title: 'Role-Based Access Control',
    description: 'Granular permissions for every user. Owners, mechanics, IAs, and viewers each see exactly what they need — nothing more.',
  },
  {
    icon: 'clipboard',
    title: 'Audit Logs',
    description: 'Every action — document upload, edit, view, and delete — is logged with timestamp and user identity. Full tamper-evident history.',
  },
  {
    icon: 'flag',
    title: 'US-Based Data Storage',
    description: 'All data is stored on US-based servers. We never transfer your records outside the United States without your explicit consent.',
  },
  {
    icon: 'refresh',
    title: 'Automatic Backups',
    description: 'Continuous backups with point-in-time recovery. Your data is never at risk from hardware failure or accidental deletion.',
  },
  {
    icon: 'eye-off',
    title: 'Zero Access by Default',
    description: 'Our team cannot access your aircraft records without your explicit permission. Your data belongs to you.',
  },
]

const roles = [
  {
    name: 'Owner / Admin',
    color: '#2563EB',
    bg: '#EFF6FF',
    border: '#BFDBFE',
    capabilities: [
      'Full access to all aircraft records',
      'Add and remove users',
      'Grant and revoke permissions',
      'Export all data',
      'Manage billing',
    ],
  },
  {
    name: 'Mechanic',
    color: '#0891B2',
    bg: '#ECFEFF',
    border: '#A5F3FC',
    capabilities: [
      'Log maintenance entries',
      'Upload documents',
      'View full record history',
      'Add sign-offs',
      'Cannot manage users or billing',
    ],
  },
  {
    name: 'Inspection Authority',
    color: '#7C3AED',
    bg: '#F5F3FF',
    border: '#DDD6FE',
    capabilities: [
      'View full maintenance history',
      'Access AD compliance reports',
      'Review and approve entries',
      'Add IA sign-offs',
      'Read-only for non-IA records',
    ],
  },
  {
    name: 'Viewer',
    color: '#6B7280',
    bg: '#F9FAFB',
    border: '#E5E7EB',
    capabilities: [
      'View documents and records',
      'Search record history',
      'Cannot upload or edit',
      'Cannot add sign-offs',
      'Ideal for insurers or buyers',
    ],
  },
]

const compliance = [
  {
    title: 'FAA Record-Keeping Standards',
    description: 'Meets the record-keeping requirements of 14 CFR Part 91.417 and Part 43.9. Every entry includes date, description, and approval for return to service.',
    status: 'Compliant',
    color: '#10B981',
    bg: '#F0FDF4',
  },
  {
    title: 'SOC 2 Type II',
    description: 'Our SOC 2 Type II audit is currently in progress. We operate with all controls required by the Trust Services Criteria for Security, Availability, and Confidentiality.',
    status: 'In progress',
    color: '#F59E0B',
    bg: '#FFFBEB',
  },
]

function SecurityIcon({ name }: { name: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {name === 'lock' && <><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></>}
      {name === 'shield' && <><path d="M12 2l8 3.5v5.5c0 4.5-3.5 8-8 9.5C7.5 19 4 15.5 4 11V5.5L12 2z"/><polyline points="9 12 11 14 15 10"/></>}
      {name === 'clipboard' && <><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="11" y2="16"/></>}
      {name === 'flag' && <><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></>}
      {name === 'refresh' && <><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></>}
      {name === 'eye-off' && <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></>}
    </svg>
  )
}

export default function SecurityPage() {
  return (
    <div className="pt-[88px]">
      {/* Hero */}
      <section className="relative py-24 overflow-hidden">
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 0%, #EFF6FF 0%, #F8F9FB 60%, #F8F9FB 100%)' }} />
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'linear-gradient(#2563EB 1px, transparent 1px), linear-gradient(90deg, #2563EB 1px, transparent 1px)', backgroundSize: '60px 60px' }} />
        <div className="relative max-w-4xl mx-auto px-6 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#EFF6FF] border border-[#BFDBFE] text-[#2563EB] text-[13px] font-medium mb-6">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l8 3.5v5.5c0 4.5-3.5 8-8 9.5C7.5 19 4 15.5 4 11V5.5L12 2z"/></svg>
            Enterprise-grade security
          </div>
          <h1 className="text-[52px] lg:text-[64px] font-extrabold text-[#0D1117] leading-[1.1] tracking-tight mb-6">
            Security you can trust with your{' '}
            <span className="text-[#2563EB]">most critical records</span>
          </h1>
          <p className="text-[20px] text-[#4B5563] leading-relaxed max-w-2xl mx-auto">
            Aviation records are irreplaceable. We treat them that way — with enterprise-grade security, strict access control, and complete audit trails.
          </p>
        </div>
      </section>

      {/* Security Features */}
      <section className="py-20 bg-white">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-14">
            <h2 className="text-[36px] font-extrabold text-[#0D1117] tracking-tight mb-3">Built-in security, by default</h2>
            <p className="text-[18px] text-[#6B7280]">Every account gets the same level of protection. No security add-ons required.</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {securityFeatures.map((feature) => (
              <div key={feature.title} className="p-6 bg-[#F8F9FB] border border-[#E2E8F0] rounded-[16px] hover:border-[#BFDBFE] transition-colors">
                <div className="w-10 h-10 rounded-[10px] bg-[#EFF6FF] flex items-center justify-center mb-4">
                  <SecurityIcon name={feature.icon} />
                </div>
                <h3 className="font-semibold text-[17px] text-[#0D1117] mb-2">{feature.title}</h3>
                <p className="text-[14px] text-[#6B7280] leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Access Control */}
      <section className="py-20 bg-[#F8F9FB]">
        <div className="max-w-5xl mx-auto px-6">
          <div className="text-center mb-14">
            <h2 className="text-[36px] font-extrabold text-[#0D1117] tracking-tight mb-3">Role-based access control</h2>
            <p className="text-[18px] text-[#6B7280]">Every user gets exactly the access they need — no more, no less.</p>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            {roles.map((role) => (
              <div key={role.name} className="bg-white border rounded-[16px] p-6" style={{ borderColor: role.border }}>
                <div className="flex items-center gap-2 mb-4">
                  <span className="px-2.5 py-1 text-[12px] font-semibold rounded-[6px]" style={{ color: role.color, background: role.bg }}>{role.name}</span>
                </div>
                <ul className="space-y-2">
                  {role.capabilities.map(cap => (
                    <li key={cap} className="flex items-center gap-2 text-[14px] text-[#374151]">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      {cap}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Compliance */}
      <section className="py-20 bg-white">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center mb-14">
            <h2 className="text-[36px] font-extrabold text-[#0D1117] tracking-tight mb-3">Compliance</h2>
            <p className="text-[18px] text-[#6B7280]">Built to meet regulatory and industry standards.</p>
          </div>
          <div className="space-y-4">
            {compliance.map((item) => (
              <div key={item.title} className="flex items-start gap-5 p-6 bg-[#F8F9FB] border border-[#E2E8F0] rounded-[16px]">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-semibold text-[17px] text-[#0D1117]">{item.title}</h3>
                    <span className="px-2.5 py-0.5 text-[12px] font-semibold rounded-full" style={{ color: item.color, background: item.bg }}>{item.status}</span>
                  </div>
                  <p className="text-[14px] text-[#6B7280] leading-relaxed">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Data Ownership */}
      <section className="py-20 bg-[#F8F9FB]">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <div className="w-14 h-14 rounded-[14px] bg-[#EFF6FF] flex items-center justify-center mx-auto mb-6">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><polyline points="12 8 12 12 14 14"/>
            </svg>
          </div>
          <h2 className="text-[32px] font-extrabold text-[#0D1117] tracking-tight mb-4">Your data belongs to you</h2>
          <p className="text-[17px] text-[#6B7280] leading-relaxed mb-6">
            We never sell, share, or use your aircraft records for any purpose other than providing the service. You can export all your data at any time, in standard formats. If you close your account, your data is deleted within 30 days.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            {['Export anytime', 'No data lock-in', 'Deletion on request', 'No third-party sharing'].map(item => (
              <div key={item} className="flex items-center gap-2 px-3 py-1.5 bg-white border border-[#E2E8F0] rounded-[8px] text-[13px] font-medium text-[#374151]">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-28" style={{ background: '#0D1117' }}>
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-[42px] font-extrabold text-white tracking-tight leading-tight mb-4">
            Secure your records today.
          </h2>
          <p className="text-[18px] text-[#9CA3AF] mb-10">Start with a 14-day free trial. No credit card required.</p>
          <Link href="/signup" className="inline-flex items-center gap-2 px-8 py-4 text-[15px] font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-[12px] transition-all shadow-[0_4px_20px_rgba(37,99,235,0.4)]">
            Get started free →
          </Link>
        </div>
      </section>
    </div>
  )
}
