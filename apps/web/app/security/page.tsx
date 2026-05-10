/**
 * /security — Phase 14 Sprint 14.6 public security page.
 *
 * Honest disclosure of where data lives, encryption, isolation,
 * SOC 2 status. Server-rendered, derives copy from constants where
 * applicable.
 */
import type { Metadata } from 'next'
import { PublicLayout } from '@/components/marketing/vite/PublicLayout'
import { ShieldCheck, Lock, Database, Globe, AlertTriangle } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Security · aircraft.us',
  description:
    'How aircraft.us protects customer data: encryption, multi-tenant isolation, audit trails, and SOC 2 status.',
  alternates: { canonical: 'https://www.myaircraft.us/security' },
}

const SECTIONS: Array<{
  icon: typeof ShieldCheck
  title: string
  body: string
}> = [
  {
    icon: ShieldCheck,
    title: 'SOC 2 Type II — In progress',
    body:
      'We are working through SOC 2 Type II certification with our auditor. We will publish our report when it lands. We are NOT yet SOC 2 certified.',
  },
  {
    icon: Lock,
    title: 'Encryption',
    body:
      'All data at rest is encrypted (AES-256) by Supabase / AWS S3 / Modal volumes. All data in transit is TLS 1.2+. Page images sent to GPU workers use signed URLs that expire in 5 minutes.',
  },
  {
    icon: Database,
    title: 'Multi-tenant isolation',
    body:
      'Every customer-facing table includes organization_id. Postgres Row-Level Security enforces "you only see your org" on every read. Server-side service role is used only for system-level operations (cron jobs, audit log writes) — never to bypass org isolation for end-user requests.',
  },
  {
    icon: Globe,
    title: 'Where the data lives',
    body:
      'Document storage: Supabase (US-East). Vision page renders: Supabase storage bucket vision-pages. Embeddings: Postgres pgvector (same DB). GPU processing happens ephemerally on Modal (US) and/or Colab (Google US) — pages are processed via signed URLs and never persisted to the GPU host.',
  },
  {
    icon: AlertTriangle,
    title: 'Customer data NEVER trains models',
    body:
      'We do not send customer documents to OpenAI, Anthropic, HuggingFace, or any third-party model provider for training. Anthropic API calls (handwriting detection, embeddings, etc.) use the no-training-on-data setting. ColQwen2 weights are downloaded from HuggingFace once at GPU boot; no document data flows back to HuggingFace.',
  },
]

export default function SecurityPage() {
  return (
    <PublicLayout>
      <main className="bg-background">
        <section className="border-b bg-gradient-to-b from-emerald-50 to-white px-4 py-16">
          <div className="mx-auto max-w-4xl text-center">
            <h1 className="text-4xl font-bold tracking-tight">Security</h1>
            <p className="mt-3 text-lg text-muted-foreground">
              How we protect your aircraft records.
            </p>
          </div>
        </section>

        <section className="px-4 py-12">
          <div className="mx-auto max-w-3xl space-y-6">
            {SECTIONS.map((s) => {
              const Icon = s.icon
              return (
                <div
                  key={s.title}
                  className="rounded-md border bg-background p-5"
                >
                  <div className="flex items-center gap-2">
                    <Icon className="h-5 w-5 text-emerald-700" />
                    <h2 className="text-lg font-semibold">{s.title}</h2>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{s.body}</p>
                </div>
              )
            })}
          </div>
        </section>

        <section className="border-t bg-muted/20 px-4 py-12">
          <div className="mx-auto max-w-3xl">
            <h2 className="text-xl font-semibold">Reporting a vulnerability</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Email <a className="underline" href="mailto:security@myaircraft.us">security@myaircraft.us</a>{' '}
              with details. We respond within one business day. We do not currently run a bug
              bounty program.
            </p>
          </div>
        </section>
      </main>
    </PublicLayout>
  )
}
