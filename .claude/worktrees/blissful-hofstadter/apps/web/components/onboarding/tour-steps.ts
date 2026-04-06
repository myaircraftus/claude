export interface TourStep {
  id: string
  title: string
  description: string
  icon: string
  iconColor: string
  bgGradient: string
  ctaHint?: string
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to myaircraft.us',
    description:
      'The only aviation maintenance platform built around a single chat bar. Everything you need — logbook entries, work orders, invoices, compliance tracking — flows from one place.',
    icon: 'Sparkles',
    iconColor: 'text-blue-500',
    bgGradient: 'from-blue-50 to-sky-100',
  },
  {
    id: 'chat',
    title: 'Chat Is Your Command Center',
    description:
      'Type what you want in plain English. "Prepare a logbook entry for an oil change." "Generate a work order for N12345." "Find the alternator part number." The AI handles the rest.',
    icon: 'MessageSquare',
    iconColor: 'text-brand-500',
    bgGradient: 'from-brand-50 to-blue-100',
    ctaHint: "Try: 'Prepare a logbook entry for N12345'",
  },
  {
    id: 'logbook',
    title: 'Logbook Entries in Seconds',
    description:
      'Describe the work performed and the AI drafts a compliant FAR Part 43 maintenance entry — pre-filled with aircraft data, hobbs/tach times, and proper regulatory wording. Review, edit, sign.',
    icon: 'FileText',
    iconColor: 'text-emerald-500',
    bgGradient: 'from-emerald-50 to-green-100',
  },
  {
    id: 'workorder',
    title: 'Work Orders Without the Paperwork',
    description:
      'Open a job with one sentence. Add labor hours, parts, discrepancies, and corrective actions through conversation. The structured work order builds itself in the right panel as you talk.',
    icon: 'Wrench',
    iconColor: 'text-orange-500',
    bgGradient: 'from-orange-50 to-amber-100',
  },
  {
    id: 'invoice',
    title: 'Invoice Customers Instantly',
    description:
      'Once work is done, say "generate invoice" and the system pulls all labor, parts, and costs from the work order into a professional invoice. Email it directly from the platform.',
    icon: 'Receipt',
    iconColor: 'text-green-600',
    bgGradient: 'from-green-50 to-emerald-100',
  },
  {
    id: 'aircraft',
    title: 'Complete Aircraft Records',
    description:
      'Every aircraft in your fleet has a full digital dossier: tail number, serial, engine/prop details, total time, AD compliance status, maintenance history, documents, and reminders.',
    icon: 'Plane',
    iconColor: 'text-sky-500',
    bgGradient: 'from-sky-50 to-blue-100',
  },
  {
    id: 'compliance',
    title: 'Never Miss an AD or Inspection',
    description:
      'The system automatically tracks applicable Airworthiness Directives and recurring inspections. Get reminders before they\'re due — not after. Stay legal, stay safe.',
    icon: 'Shield',
    iconColor: 'text-purple-500',
    bgGradient: 'from-purple-50 to-violet-100',
  },
  {
    id: 'ready',
    title: "You're Ready to Fly",
    description:
      'myaircraft.us runs like a highly competent maintenance coordinator who never sleeps. Ask it anything, generate any record, track every compliance item. Your entire maintenance operation, in one bar.',
    icon: 'CheckCircle2',
    iconColor: 'text-emerald-500',
    bgGradient: 'from-emerald-50 to-green-100',
    ctaHint: 'Start by selecting an aircraft and typing your first message',
  },
]
