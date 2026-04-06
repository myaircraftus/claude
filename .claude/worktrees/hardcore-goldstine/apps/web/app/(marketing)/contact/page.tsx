'use client'

import { useState } from 'react'

const INFO_CARDS = [
  {
    title: 'Free Setup Included',
    description: "We'll help you set up your account, import your aircraft, and configure your workspace at no cost.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>
    ),
  },
  {
    title: 'Free Ingestion Assistance',
    description: 'We help structure and organize your existing records — whether digital PDFs or scanned documents.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
        <polyline points="10 9 9 9 8 9"/>
      </svg>
    ),
  },
  {
    title: 'Onsite Scanning Available',
    description: '$1,000 per aircraft set of logbooks. We come to you and scan everything on-site.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2"/>
        <line x1="3" y1="9" x2="21" y2="9"/>
        <line x1="3" y1="15" x2="21" y2="15"/>
        <line x1="9" y1="3" x2="9" y2="21"/>
        <line x1="15" y1="3" x2="15" y2="21"/>
      </svg>
    ),
  },
  {
    title: 'Response Within 24 Hours',
    description: 'Our team reviews every inquiry and responds within one business day.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <polyline points="12 6 12 12 16 14"/>
      </svg>
    ),
  },
]

const FAQ_ITEMS = [
  {
    question: "What's included in the free setup?",
    answer:
      'Free setup includes account creation, aircraft profile configuration, initial document upload guidance, and a walkthrough of the platform. We spend up to 2 hours with you to ensure everything is organized correctly from day one.',
  },
  {
    question: 'Do I need to pay for scanning if I already have digital records?',
    answer:
      'No. If you already have PDFs or digital copies of your logbooks and maintenance records, ingestion is free. The $1,000 scanning fee only applies if you need physical logbooks scanned on-site.',
  },
  {
    question: 'How long does ingestion take?',
    answer:
      'Most aircraft with a complete digital record set are fully ingested within 24–48 hours. For large fleets or physical logbook scanning, we provide a timeline estimate before you commit.',
  },
  {
    question: 'What aircraft records do you support?',
    answer:
      'myaircraft.us supports airframe, engine, and propeller logbooks; annual inspection records; STC documentation; 337 forms; AD compliance records; weight & balance reports; and maintenance release documents. If you have a record type not listed, ask us — we likely support it.',
  },
  {
    question: 'Is my data secure?',
    answer:
      'Yes. All data is encrypted at rest and in transit. We use Supabase with row-level security, meaning your records are only accessible to you and anyone you explicitly grant access to. We never share or sell your data.',
  },
]

function FAQAccordion() {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  return (
    <div className="divide-y divide-[#E2E8F0]">
      {FAQ_ITEMS.map((item, i) => (
        <div key={i}>
          <button
            className="w-full flex items-center justify-between py-5 text-left gap-4 group"
            onClick={() => setOpenIndex(openIndex === i ? null : i)}
          >
            <span className="text-[15px] font-semibold text-[#0D1117] group-hover:text-blue-600 transition-colors">
              {item.question}
            </span>
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#F1F3F7] flex items-center justify-center transition-transform duration-200" style={{ transform: openIndex === i ? 'rotate(45deg)' : 'none' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2.5" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            </span>
          </button>
          {openIndex === i && (
            <p className="pb-5 text-[14px] text-[#6B7280] leading-relaxed">
              {item.answer}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}

export default function ContactPage() {
  const [submitted, setSubmitted] = useState(false)
  const [form, setForm] = useState({
    name: '',
    email: '',
    organization: '',
    role: '',
    message: '',
  })

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitted(true)
  }

  return (
    <div className="pt-28 pb-20 px-6">
      {/* Hero */}
      <div className="max-w-6xl mx-auto text-center mb-16">
        <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-full px-4 py-1.5 mb-6">
          <div className="w-1.5 h-1.5 rounded-full bg-blue-500"/>
          <span className="text-[13px] font-medium text-blue-700">Free setup & onboarding included</span>
        </div>
        <h1 className="text-[42px] md:text-[54px] font-bold text-[#0D1117] tracking-tight leading-[1.1] mb-5">
          Book a Demo
        </h1>
        <p className="text-[18px] text-[#6B7280] max-w-2xl mx-auto leading-relaxed">
          See myaircraft.us in action with your own aircraft. We'll walk you through the platform,
          answer your questions, and get you set up — at no cost.
        </p>
      </div>

      {/* Two-column layout */}
      <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-12 mb-20">
        {/* LEFT: Contact Form */}
        <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm p-8">
          {submitted ? (
            <div className="flex flex-col items-center justify-center h-full py-16 text-center">
              <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mb-5">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
              <h2 className="text-[22px] font-bold text-[#0D1117] mb-3">Thank you!</h2>
              <p className="text-[15px] text-[#6B7280] leading-relaxed max-w-sm">
                We've received your message and will get back to you within 24 hours.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              <div>
                <h2 className="text-[20px] font-bold text-[#0D1117] mb-1">Get in touch</h2>
                <p className="text-[13px] text-[#9CA3AF]">Fill out the form and we'll be in touch within 24 hours.</p>
              </div>

              {/* Name */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="name" className="text-[13px] font-semibold text-[#374151]">Name</label>
                <input
                  id="name"
                  name="name"
                  type="text"
                  required
                  value={form.name}
                  onChange={handleChange}
                  placeholder="Your full name"
                  className="h-11 px-4 rounded-[10px] border border-[#E2E8F0] bg-[#F8F9FB] text-[14px] text-[#0D1117] placeholder-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
              </div>

              {/* Email */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="email" className="text-[13px] font-semibold text-[#374151]">Email</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  value={form.email}
                  onChange={handleChange}
                  placeholder="you@example.com"
                  className="h-11 px-4 rounded-[10px] border border-[#E2E8F0] bg-[#F8F9FB] text-[14px] text-[#0D1117] placeholder-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
              </div>

              {/* Organization */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="organization" className="text-[13px] font-semibold text-[#374151]">Organization <span className="text-[#9CA3AF] font-normal">(optional)</span></label>
                <input
                  id="organization"
                  name="organization"
                  type="text"
                  value={form.organization}
                  onChange={handleChange}
                  placeholder="Company or FBO name"
                  className="h-11 px-4 rounded-[10px] border border-[#E2E8F0] bg-[#F8F9FB] text-[14px] text-[#0D1117] placeholder-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
              </div>

              {/* Role */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="role" className="text-[13px] font-semibold text-[#374151]">Role</label>
                <select
                  id="role"
                  name="role"
                  required
                  value={form.role}
                  onChange={handleChange}
                  className="h-11 px-4 rounded-[10px] border border-[#E2E8F0] bg-[#F8F9FB] text-[14px] text-[#0D1117] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all appearance-none"
                >
                  <option value="" disabled>Select your role</option>
                  <option value="owner">Aircraft Owner</option>
                  <option value="ap">A&P Mechanic</option>
                  <option value="ia">IA</option>
                  <option value="flight_school">Flight School</option>
                  <option value="mro">MRO</option>
                  <option value="broker">Broker</option>
                  <option value="other">Other</option>
                </select>
              </div>

              {/* Message */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="message" className="text-[13px] font-semibold text-[#374151]">Message <span className="text-[#9CA3AF] font-normal">(optional)</span></label>
                <textarea
                  id="message"
                  name="message"
                  rows={4}
                  value={form.message}
                  onChange={handleChange}
                  placeholder="Tell us about your aircraft, fleet size, or what you're hoping to accomplish..."
                  className="px-4 py-3 rounded-[10px] border border-[#E2E8F0] bg-[#F8F9FB] text-[14px] text-[#0D1117] placeholder-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none"
                />
              </div>

              <button
                type="submit"
                className="h-12 px-6 rounded-[10px] bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-[15px] font-semibold transition-all duration-150 shadow-[0_2px_8px_rgba(37,99,235,0.25)] hover:shadow-[0_4px_16px_rgba(37,99,235,0.35)] mt-1"
              >
                Send Message →
              </button>
            </form>
          )}
        </div>

        {/* RIGHT: Info cards */}
        <div className="flex flex-col gap-5 justify-center">
          {INFO_CARDS.map((card) => (
            <div key={card.title} className="flex gap-4 items-start bg-white rounded-2xl border border-[#E2E8F0] shadow-sm p-6">
              <div className="flex-shrink-0 w-10 h-10 rounded-[10px] bg-blue-50 text-blue-600 flex items-center justify-center">
                {card.icon}
              </div>
              <div>
                <h3 className="text-[15px] font-semibold text-[#0D1117] mb-1">{card.title}</h3>
                <p className="text-[13px] text-[#6B7280] leading-relaxed">{card.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* FAQ Section */}
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-10">
          <h2 className="text-[30px] font-bold text-[#0D1117] mb-3">Frequently asked questions</h2>
          <p className="text-[15px] text-[#6B7280]">Everything you need to know before getting started.</p>
        </div>
        <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-sm px-8">
          <FAQAccordion />
        </div>
      </div>
    </div>
  )
}
