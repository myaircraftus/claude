export function AppMockup() {
  return (
    <div
      className="w-full max-w-lg"
      style={{
        background: '#161B25',
        borderRadius: 20,
        border: '1px solid #2A3347',
        boxShadow: '0 24px 64px rgba(0,0,0,0.25), 0 8px 24px rgba(0,0,0,0.15)',
        overflow: 'hidden',
      }}
    >
      {/* Window bar */}
      <div className="flex items-center gap-1.5 px-4 py-3 border-b border-[#2A3347]">
        <div className="w-3 h-3 rounded-full bg-[#FF5F57]" />
        <div className="w-3 h-3 rounded-full bg-[#FEBC2E]" />
        <div className="w-3 h-3 rounded-full bg-[#28C840]" />
      </div>
      {/* App header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#2A3347]">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-[6px] bg-[#2563EB]/20 flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3L20 8v2l-4 2v6l2 1v2l-6-2-6 2v-2l2-1v-6L4 10V8l8-5z"/>
            </svg>
          </div>
          <span className="text-white font-semibold text-[13px]">N172MA</span>
          <span className="text-[#4B5563] text-[12px]">Cessna 172S</span>
        </div>
        <div className="flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>
        </div>
      </div>
      {/* Chat area */}
      <div className="px-4 py-4 space-y-4">
        {/* User message */}
        <div className="flex justify-end">
          <div className="max-w-[80%] px-3.5 py-2.5 rounded-[12px] rounded-tr-[4px] bg-[#2563EB] text-white text-[13px] leading-relaxed">
            When was the last annual inspection completed?
          </div>
        </div>
        {/* AI response */}
        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <div className="w-6 h-6 rounded-full bg-[#1C2333] border border-[#2A3347] flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="#3B82F6"><path d="M12 2l2.4 7.2H22l-6.2 4.5 2.4 7.2L12 17l-6.2 3.9 2.4-7.2L2 9.2h7.6L12 2z"/></svg>
            </div>
            <div className="max-w-[85%] px-3.5 py-2.5 rounded-[12px] rounded-tl-[4px] bg-[#1C2333] border border-[#2A3347]">
              <p className="text-[#E2E8F0] text-[13px] leading-relaxed">
                The annual inspection was completed on <span className="text-white font-semibold">March 14, 2024</span>, signed off by IA John Harrison (certificate #3847291).
              </p>
            </div>
          </div>
          {/* Citation card */}
          <div className="ml-8 bg-[#1C2333] border border-[#2A3347] border-l-[3px] border-l-[#10B981] rounded-[8px] px-3 py-2.5">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wide text-[#10B981] bg-[#10B981]/10 px-1.5 py-0.5 rounded-full">Logbook</span>
              <span className="text-[10px] font-bold uppercase tracking-wide text-[#10B981] bg-[#10B981]/10 px-1.5 py-0.5 rounded-full">High Confidence</span>
              <span className="text-[10px] text-[#6B7280] bg-[#232B3E] px-1.5 py-0.5 rounded-full">Page 47</span>
            </div>
            <p className="text-[12px] text-[#9CA3AF]">2024 Annual Logbook Entry · &ldquo;Annual inspection completed 03/14/24...&rdquo;</p>
            <button className="mt-1.5 text-[11px] text-[#3B82F6] font-medium flex items-center gap-1 hover:underline">
              View source page →
            </button>
          </div>
        </div>
        {/* Input bar */}
        <div className="flex items-center gap-2 bg-[#1C2333] border border-[#2A3347] rounded-[10px] px-3 py-2.5 mt-2">
          <input
            readOnly
            placeholder="Ask anything about N172MA..."
            className="flex-1 bg-transparent text-[13px] text-[#6B7280] outline-none placeholder:text-[#4B5563]"
          />
          <button className="w-6 h-6 rounded-[6px] bg-[#2563EB] flex items-center justify-center flex-shrink-0">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
