// Standalone scanner layout — full-screen, no sidebar, optimized for iPad/tablet
export default function ScannerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {children}
    </div>
  )
}
