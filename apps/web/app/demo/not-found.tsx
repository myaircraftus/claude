import Link from "next/link";
import { Compass, Sparkles } from "lucide-react";

export default function DemoNotFound() {
  return (
    <div className="h-full overflow-y-auto bg-slate-50">
      <div className="max-w-xl mx-auto px-6 py-12 text-center">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center mb-4">
          <Compass className="w-6 h-6" />
        </div>
        <h1 className="text-[22px] text-slate-900 mb-2" style={{ fontWeight: 700 }}>
          This area is preview-only
        </h1>
        <p className="text-slate-600 text-[14px] mb-6">
          The demo includes Dashboard, Aircraft, Mechanic Portal, Marketplace, Ask AI, Documents,
          and Settings. Other sections are available with a free trial account.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link
            href="/demo/owner"
            className="rounded-full bg-slate-900 text-white px-4 py-2 text-[13px] font-semibold hover:bg-slate-800 transition-colors"
          >
            Back to demo
          </Link>
          <Link
            href="/signup?preview=1"
            className="inline-flex items-center gap-1.5 rounded-full bg-blue-600 text-white px-4 py-2 text-[13px] font-semibold hover:bg-blue-700 transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Start free 30-day trial
          </Link>
        </div>
      </div>
    </div>
  );
}
