"use client"

import Link from "next/link"
import { ArrowRight } from "lucide-react"

/**
 * Trust-signal section showing the real world the product lives in:
 * actual A&P mechanics working on actual airframes in actual shops.
 *
 * Three Unsplash photos (licensed for unlimited commercial use, no
 * attribution required) — selected to match the persona mix:
 *  - Maintenance hangar floor with technician working on an aircraft
 *  - Close-up of a wrench on an aircraft engine cylinder
 *  - Pilot/owner walking around their aircraft at a small GA airport
 *
 * Sits between the ProductPreview tab section and the Who-it's-for
 * persona cards. Anchors the dashboards in reality so visitors can
 * picture the product running in their actual hangar.
 *
 * No <Image> from next/image — the CSP allows images: 'https:' so
 * plain <img> works and we skip the image-domains allowlist dance.
 */

// Use the same Unsplash photo IDs the HomePage already loads at the top of
// the file (IMG_MECHANIC / IMG_LOGBOOK / IMG_OWNER) — those were hand-picked
// from search results so they actually depict aviation maintenance scenes.
// Plus a fourth "pilot at aircraft" photo. The CSP allows img-src 'https:'
// so plain <img> tags work without configuring next/image remotePatterns.
const PHOTOS = [
  {
    url:
      "https://images.unsplash.com/photo-1742729251800-2f58d9c91553?auto=format&fit=crop&w=1000&q=80",
    alt: "Aircraft mechanic working on an engine",
    caption: "Built in the hangar",
    description:
      "Designed with A&P mechanics in real shops — from one-person owner-operations to 30-tech MRO floors.",
  },
  {
    url:
      "https://images.unsplash.com/photo-1547717015-67560f10d0a0?auto=format&fit=crop&w=1000&q=80",
    alt: "Aviation logbook and maintenance records",
    caption: "Every cylinder. Every page.",
    description:
      "Engine logbook, airframe logbook, prop logbook, equipment list, 337s, 8130-3s, AD compliance — one searchable source of truth.",
  },
  {
    url:
      "https://images.unsplash.com/photo-1686686489494-76caffffe5b5?auto=format&fit=crop&w=1000&q=80",
    alt: "Pilot walking around their aircraft at a GA airport",
    caption: "From Cessna to Cirrus",
    description:
      "Vintage paper-logbook airframes through brand-new glass-panel composites. If it flies and has records, we manage them.",
  },
]

export function RealShopsStrip() {
  return (
    <section className="relative bg-white py-24 border-t border-gray-100 overflow-hidden">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 bg-[#0A1628] text-white rounded-full px-4 py-1.5 mb-4">
            <span className="text-[11px] font-semibold tracking-wider uppercase">In the wild</span>
          </div>
          <h2 className="text-[40px] md:text-[48px] text-[#0A1628] tracking-tight leading-[1.05] mb-4 font-black">
            Built for the people
            <br />
            <span className="text-[#2563EB]">who actually turn the wrench.</span>
          </h2>
          <p className="text-[16px] text-gray-500 max-w-2xl mx-auto">
            Not a polished demo built in a coffee shop. A platform shaped by hangar floors, owner kitchens,
            and FBO offices — by the people whose names end up in the logbook.
          </p>
        </div>

        <div className="grid sm:grid-cols-3 gap-5">
          {PHOTOS.map((p) => (
            <div
              key={p.url}
              className="group rounded-3xl overflow-hidden border border-gray-200 bg-white hover:border-gray-300 hover:shadow-lg transition-all"
            >
              <div className="relative aspect-[4/3] overflow-hidden bg-gray-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.url}
                  alt={p.alt}
                  loading="lazy"
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0A1628]/40 via-transparent to-transparent" />
              </div>
              <div className="p-5">
                <h3 className="text-[16px] text-[#0A1628] mb-1.5" style={{ fontWeight: 800 }}>
                  {p.caption}
                </h3>
                <p className="text-[13px] text-gray-500 leading-relaxed">{p.description}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-4 text-center">
          <p className="text-[14px] text-gray-500">
            Want to see the real product in action?
          </p>
          <Link
            href="/demo/owner"
            className="inline-flex items-center gap-2 text-[14px] text-[#2563EB] hover:text-[#1d4ed8] font-semibold"
          >
            Open the owner sandbox <ArrowRight className="w-4 h-4" />
          </Link>
          <span className="text-gray-300">·</span>
          <Link
            href="/demo/mechanic"
            className="inline-flex items-center gap-2 text-[14px] text-[#2563EB] hover:text-[#1d4ed8] font-semibold"
          >
            Open the mechanic sandbox <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </section>
  )
}
