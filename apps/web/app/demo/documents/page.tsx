import { FileText, Upload, Search, Sparkles } from "lucide-react";
import Link from "next/link";

export const metadata = { title: "Documents · Demo" };

const SAMPLE_DOCS = [
  { name: "N12345 — Airframe logbook (2023-2025).pdf", type: "Logbook", pages: 84, family: "Aircraft Records" },
  { name: "N12345 — STC SA01234CH (Garmin G500).pdf", type: "STC", pages: 12, family: "Modifications" },
  { name: "N67890 — Form 337 (panel upgrade).pdf", type: "337", pages: 4, family: "Major Alterations" },
  { name: "N67890 — Weight & balance (2024).pdf", type: "W&B", pages: 6, family: "Weight & Balance" },
  { name: "AD 2024-12-08 compliance.pdf", type: "AD", pages: 3, family: "AD Compliance" },
];

export default function DemoDocumentsPage() {
  return (
    <div className="h-full overflow-y-auto bg-slate-50">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
            <FileText className="w-5 h-5" />
          </div>
          <h1 className="text-[24px] text-slate-900" style={{ fontWeight: 700 }}>
            Document Vault
          </h1>
        </div>
        <p className="text-slate-600 mb-6 text-[14px]">
          Every page of every PDF is OCR&apos;d and full-text searchable. Find a part number, AD, or
          mechanic&apos;s entry in seconds.
        </p>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  disabled
                  placeholder="Search across every document…"
                  className="pl-8 pr-3 py-2 w-[320px] rounded-lg border border-slate-200 bg-slate-50 text-[13px] text-slate-500"
                />
              </div>
              <span className="text-[11px] px-2 py-1 rounded-full bg-amber-100 text-amber-800 font-semibold">
                Disabled in demo
              </span>
            </div>
            <button
              disabled
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 text-white px-3 py-2 text-[13px] font-semibold opacity-70 cursor-not-allowed"
            >
              <Upload className="w-4 h-4" />
              Upload
            </button>
          </div>

          <table className="w-full text-[13px]">
            <thead className="text-left text-slate-500">
              <tr className="border-b border-slate-200">
                <th className="py-2">Document</th>
                <th className="py-2">Type</th>
                <th className="py-2">Family</th>
                <th className="py-2 text-right">Pages</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {SAMPLE_DOCS.map((doc) => (
                <tr key={doc.name} className="hover:bg-slate-50">
                  <td className="py-3 text-slate-800 font-medium">{doc.name}</td>
                  <td className="py-3 text-slate-600">{doc.type}</td>
                  <td className="py-3 text-slate-600">{doc.family}</td>
                  <td className="py-3 text-right text-slate-500">{doc.pages}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
          <div className="flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-blue-600 mt-0.5" />
            <div>
              <p className="text-[14px] text-slate-900" style={{ fontWeight: 600 }}>
                In the live app, you can upload anything PDF — logbooks, STCs, 337s, W&amp;B,
                inspection reports — and ask plain-English questions across them all.
              </p>
              <Link
                href="/signup?preview=1"
                className="inline-block mt-3 rounded-full bg-blue-600 text-white px-4 py-2 text-[13px] font-semibold hover:bg-blue-700 transition-colors"
              >
                Start free 30-day trial
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
