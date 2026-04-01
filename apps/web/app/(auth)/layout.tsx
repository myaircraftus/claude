export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex">
      {/* Left panel — dark, 40% */}
      <div className="hidden lg:flex lg:w-[40%] flex-col justify-between p-10"
        style={{ background: '#0D1117', borderRight: '1px solid #1C2333' }}>
        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-[8px] bg-[#2563EB] flex items-center justify-center shadow-[0_2px_8px_rgba(37,99,235,0.4)]">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3L20 8v2l-4 2v6l2 1v2l-6-2-6 2v-2l2-1v-6L4 10V8l8-5z"/>
            </svg>
          </div>
          <span className="font-semibold text-[15px] text-white tracking-tight">myaircraft.us</span>
        </div>
        {/* Tagline */}
        <div>
          <h2 className="text-[32px] font-extrabold text-white leading-tight tracking-tight mb-6">
            Your aircraft records,<br/>finally searchable.
          </h2>
          <ul className="space-y-3">
            {[
              'Citation-backed answers',
              'Aircraft-specific workspaces',
              'Secure and private',
            ].map(item => (
              <li key={item} className="flex items-center gap-2.5 text-[14px] text-[#9CA3AF]">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                {item}
              </li>
            ))}
          </ul>
        </div>
        {/* Mini app preview */}
        <div className="bg-[#161B25] rounded-[12px] border border-[#2A3347] p-4 text-[12px]">
          <div className="flex items-center gap-2 mb-3 pb-2 border-b border-[#2A3347]">
            <div className="w-5 h-5 rounded-[5px] bg-[#2563EB]/20 flex items-center justify-center">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3L20 8v2l-4 2v6l2 1v2l-6-2-6 2v-2l2-1v-6L4 10V8l8-5z"/>
              </svg>
            </div>
            <span className="text-white font-medium text-[11px]">N172MA · Cessna 172S</span>
          </div>
          <div className="space-y-2">
            <div className="flex justify-end">
              <span className="bg-[#2563EB] text-white px-2.5 py-1.5 rounded-[8px] rounded-tr-[2px] text-[11px]">When was the last annual?</span>
            </div>
            <div className="flex gap-1.5">
              <div className="w-4 h-4 rounded-full bg-[#1C2333] border border-[#2A3347] flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg width="8" height="8" viewBox="0 0 24 24" fill="#3B82F6"><path d="M12 2l2.4 7.2H22l-6.2 4.5 2.4 7.2L12 17l-6.2 3.9 2.4-7.2L2 9.2h7.6L12 2z"/></svg>
              </div>
              <div className="bg-[#1C2333] border border-[#2A3347] rounded-[8px] rounded-tl-[2px] px-2.5 py-1.5">
                <p className="text-[#E2E8F0] text-[11px]">Annual completed <span className="text-white font-semibold">March 14, 2024</span> — IA John Harrison.</p>
                <div className="mt-1.5 flex items-center gap-1">
                  <span className="text-[9px] font-bold uppercase text-[#10B981] bg-[#10B981]/10 px-1.5 py-0.5 rounded-full">Logbook · Page 47</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* Right panel — white, 60% */}
      <div className="flex-1 flex items-center justify-center p-6 bg-white">
        <div className="w-full max-w-[400px]">
          {children}
        </div>
      </div>
    </div>
  )
}
