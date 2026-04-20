"use client";

import { Shield } from "lucide-react";
import Link from "next/link";

const SECTIONS = [
  {
    title: "1. Information We Collect",
    content: [
      {
        subtitle: "Account Information",
        text: "When you create an account, we collect your name, email address, and the role you select (aircraft owner, mechanic, or fleet operator). For mechanics, we may also collect certificate numbers and shop information you choose to provide.",
      },
      {
        subtitle: "Aircraft Records",
        text: "You upload maintenance logbooks, airworthiness directives, STCs, work orders, and other aviation records to the platform. This constitutes the core of your data on myaircraft.us. These records belong to you.",
      },
      {
        subtitle: "Usage Data",
        text: "We collect standard server logs including IP addresses, browser type, pages visited, and time spent on the platform. This data is used solely for service improvement and security monitoring.",
      },
      {
        subtitle: "Payment Information",
        text: "Billing is processed by Stripe. We do not store your full credit card number. We retain only the last four digits, expiration month/year, and billing address for your records.",
      },
    ],
  },
  {
    title: "2. How We Use Your Information",
    content: [
      {
        subtitle: "Service Delivery",
        text: "We use your data to provide the myaircraft.us platform, including AI-powered document search, compliance tracking, maintenance workflows, and all other features you've subscribed to.",
      },
      {
        subtitle: "AI Processing",
        text: "Your aircraft records are processed by our AI systems to provide answers, summaries, and compliance insights. This processing occurs within our private infrastructure. Your records are never shared with third-party AI providers or used to train public models.",
      },
      {
        subtitle: "Communications",
        text: "We may contact you about maintenance reminders, compliance alerts, and platform updates you have opted in to receive. We do not send marketing emails without explicit consent.",
      },
    ],
  },
  {
    title: "3. Data Sharing and Third Parties",
    content: [
      {
        subtitle: "We Do Not Sell Your Data",
        text: "myaircraft.us does not sell, rent, or barter your personal information or aircraft records to any third party for any purpose.",
      },
      {
        subtitle: "Service Providers",
        text: "We work with a limited set of sub-processors including Stripe (payments), Amazon Web Services (cloud hosting), and Postmark (transactional email). Each provider is bound by data processing agreements consistent with this policy.",
      },
      {
        subtitle: "FAA and Government Requests",
        text: "We may disclose information if required by law, court order, or a valid government request. We will notify you of such requests unless prohibited by law from doing so.",
      },
      {
        subtitle: "Role-Based Sharing",
        text: "When you link your account with a mechanic or another owner, that party gains access only to the records and permissions you explicitly grant. You control all sharing.",
      },
    ],
  },
  {
    title: "4. Data Security",
    content: [
      {
        subtitle: "Encryption",
        text: "All data is encrypted at rest using AES-256 and in transit using TLS 1.3. Encryption keys are managed using AWS KMS with quarterly rotation.",
      },
      {
        subtitle: "Access Controls",
        text: "Our team follows the principle of least privilege. Engineers do not have standing access to production customer data. Access is audited and reviewed quarterly.",
      },
      {
        subtitle: "Incident Response",
        text: "In the event of a security incident affecting your data, we will notify you within 72 hours by email. We maintain an incident response plan tested annually.",
      },
    ],
  },
  {
    title: "5. Your Rights and Controls",
    content: [
      {
        subtitle: "Access and Export",
        text: "You may export all of your aircraft records and account data at any time from your Settings page. Exports are provided in standard PDF and CSV formats.",
      },
      {
        subtitle: "Deletion",
        text: "You may request deletion of your account and all associated data. Deletion requests are processed within 30 days. Note that records subject to ongoing legal matters may be retained per applicable law.",
      },
      {
        subtitle: "Correction",
        text: "You may correct or update any information in your account at any time through the platform settings.",
      },
      {
        subtitle: "California Residents (CCPA)",
        text: "California residents have additional rights under the California Consumer Privacy Act, including the right to know what personal information is collected and the right to opt out of any sale (we do not sell data). Submit requests to privacy@myaircraft.us.",
      },
    ],
  },
  {
    title: "6. Data Retention",
    content: [
      {
        subtitle: "Active Accounts",
        text: "Records are retained for as long as your account remains active. Maintenance records have special importance in aviation and we store them with this in mind.",
      },
      {
        subtitle: "After Cancellation",
        text: "Following account cancellation, your records remain accessible for 30 days to allow export. After that period, records are deleted from our primary systems within 90 days and from backups within 180 days.",
      },
    ],
  },
  {
    title: "7. Cookies",
    content: [
      {
        subtitle: "Essential Cookies",
        text: "We use strictly necessary cookies to maintain your login session and protect against cross-site request forgery. These cannot be disabled without breaking the service.",
      },
      {
        subtitle: "Analytics",
        text: "We use privacy-preserving analytics (no cross-site tracking) to understand how features are used. These analytics do not identify individual users.",
      },
    ],
  },
  {
    title: "8. Children's Privacy",
    content: [
      {
        subtitle: "",
        text: "myaircraft.us is not directed to individuals under 18 years of age. We do not knowingly collect personal information from children. If you believe a child has provided us with personal information, contact us at privacy@myaircraft.us.",
      },
    ],
  },
  {
    title: "9. Changes to This Policy",
    content: [
      {
        subtitle: "",
        text: "We may update this Privacy Policy from time to time. When we make material changes, we will notify you by email and display a notice in the platform at least 14 days before the changes take effect. Continued use of the platform after that period constitutes acceptance of the updated policy.",
      },
    ],
  },
  {
    title: "10. Contact",
    content: [
      {
        subtitle: "",
        text: "For privacy-related questions, data access requests, or to report a security concern, contact us at privacy@myaircraft.us or by mail at: myaircraft.us Inc., 1700 S Lamar Blvd, Suite 200, Austin, TX 78704.",
      },
    ],
  },
];

export function PrivacyPage() {
  return (
    <div className="bg-[#0A1628] min-h-screen">
      {/* Hero */}
      <section className="relative pt-24 pb-12 px-4 border-b border-white/8">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
              <Shield className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h1 className="text-white text-[30px]" style={{ fontWeight: 800 }}>Privacy Policy</h1>
              <p className="text-white/35 text-[13px]">Last updated: April 1, 2026</p>
            </div>
          </div>
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl px-5 py-4">
            <p className="text-white/70 text-[14px] leading-relaxed">
              <span style={{ fontWeight: 600 }} className="text-blue-300">Short version: </span>
              Your aircraft records belong to you. We use them only to provide the service. We don't sell your data, don't use it to train public AI models, and you can export or delete everything at any time.
            </p>
          </div>
        </div>
      </section>

      {/* Content */}
      <section className="px-4 py-12">
        <div className="max-w-3xl mx-auto">
          <div className="space-y-10">
            {SECTIONS.map((section) => (
              <div key={section.title}>
                <h2 className="text-white text-[19px] mb-5 pb-3 border-b border-white/8" style={{ fontWeight: 700 }}>{section.title}</h2>
                <div className="space-y-5">
                  {section.content.map((item, j) => (
                    <div key={j}>
                      {item.subtitle && (
                        <h3 className="text-white/80 text-[14px] mb-1.5" style={{ fontWeight: 600 }}>{item.subtitle}</h3>
                      )}
                      <p className="text-white/45 text-[14px] leading-relaxed">{item.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-12 pt-8 border-t border-white/8">
            <p className="text-white/30 text-[13px] mb-4">
              myaircraft.us Inc. · Austin, Texas · Not affiliated with the FAA or any government agency.
            </p>
            <div className="flex gap-4">
              <Link href="/terms" className="text-[#60a5fa] hover:text-[#93c5fd] text-[13px] transition-colors" style={{ fontWeight: 500 }}>Terms of Service</Link>
              <Link href="/contact" className="text-[#60a5fa] hover:text-[#93c5fd] text-[13px] transition-colors" style={{ fontWeight: 500 }}>Contact Us</Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
