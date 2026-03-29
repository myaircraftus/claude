export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-950 via-brand-900 to-sky-900">
      <div className="w-full max-w-md px-4">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M28 16L4 8L10 16L4 24L28 16Z" fill="#3b82f6" stroke="#60a5fa" strokeWidth="1.5" strokeLinejoin="round"/>
            </svg>
            <span className="text-2xl font-bold text-white tracking-tight">myaircraft.us</span>
          </div>
          <p className="text-sky-300 text-sm">Ask your aircraft anything.</p>
        </div>
        {children}
      </div>
    </div>
  )
}
