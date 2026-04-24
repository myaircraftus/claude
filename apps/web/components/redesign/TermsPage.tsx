"use client";

import { ScrollText } from "lucide-react";
import Link from "next/link";

const SECTIONS = [
  {
    title: "1. Acceptance of Terms",
    content: "By creating an account or using the myaircraft.us platform, you agree to be bound by these Terms of Service. If you are using the platform on behalf of a business, you represent that you have authority to bind that business to these terms. If you do not agree, do not use the platform.",
  },
  {
    title: "2. Description of Service",
    content: "myaircraft.us provides a cloud-based aircraft records intelligence platform ('Service') that allows aircraft owners, A&P mechanics, IAs, and fleet operators to store, search, and analyze aviation maintenance records. The Service includes AI-powered document search, compliance tracking, maintenance workflow tools, and related features. myaircraft.us is not affiliated with the FAA or any government agency. The Service is for informational and organizational purposes only.",
  },
  {
    title: "3. Account Registration",
    content: "You must provide accurate and complete information when creating an account. You are responsible for maintaining the security of your account credentials. You must notify us immediately at security@myaircraft.us if you suspect unauthorized access to your account. We reserve the right to terminate accounts that provide false information or violate these terms.",
  },
  {
    title: "4. Subscription and Billing",
    content: "The Service is provided on a subscription basis. Current pricing is $99 per aircraft per month (owner plan) or $99 per mechanic per month (mechanic plan), with an annual plan available at $79/month paid annually. All fees are non-refundable except as required by applicable law. We reserve the right to change pricing with 30 days' notice to current subscribers. Billing is processed monthly or annually depending on your selected plan.",
  },
  {
    title: "5. Free Trial",
    content: "New accounts receive a 30-day free trial with full access to all platform features. No credit card is required to start a trial. At the end of the trial period, continued access requires a paid subscription. We reserve the right to modify or discontinue the trial offer at any time.",
  },
  {
    title: "6. Acceptable Use",
    content: "You agree to use the Service only for lawful purposes and in accordance with these terms. You may not: (a) upload records that you do not have the right to upload; (b) use the Service to store or transmit malicious code; (c) attempt to gain unauthorized access to any part of the Service; (d) reverse engineer, decompile, or disassemble any part of the Service; (e) use the Service in a way that could damage, disable, or impair the platform; or (f) share your account credentials with unauthorized parties.",
  },
  {
    title: "7. Aircraft Records and Data Ownership",
    content: "You retain full ownership of all aircraft records and data you upload to the platform. myaircraft.us claims no ownership interest in your records. By uploading records, you grant myaircraft.us a limited, non-exclusive license to process, store, and display your records solely for the purpose of providing the Service to you. This license terminates when you delete the records or close your account.",
  },
  {
    title: "8. Important Aviation Disclaimers",
    content: "THE SERVICE IS FOR ORGANIZATIONAL AND INFORMATIONAL PURPOSES ONLY. MYAIRCRAFT.US DOES NOT PROVIDE LEGAL, REGULATORY, OR AIRWORTHINESS ADVICE. AI-GENERATED SUMMARIES AND COMPLIANCE ASSESSMENTS ARE PROVIDED FOR INFORMATIONAL PURPOSES ONLY AND DO NOT CONSTITUTE AN AIRWORTHINESS DETERMINATION OR FAA-APPROVED MAINTENANCE REVIEW. ALWAYS CONSULT A QUALIFIED A&P MECHANIC OR IA FOR MAINTENANCE DECISIONS. YOUR PHYSICAL LOGBOOKS REMAIN THE FAA-RECOGNIZED LEGAL RECORD OF MAINTENANCE. DIGITAL RECORDS ON THIS PLATFORM DO NOT REPLACE LEGALLY REQUIRED PHYSICAL RECORDS.",
  },
  {
    title: "9. AI Features",
    content: "The Service includes AI-powered features including natural language search, document summarization, and compliance assistance. These features are based on machine learning and may occasionally produce inaccurate or incomplete results. You acknowledge that AI-generated content requires human review before any aviation maintenance or compliance decision is made. myaircraft.us does not warrant the accuracy, completeness, or fitness for purpose of any AI-generated output.",
  },
  {
    title: "10. Intellectual Property",
    content: "The myaircraft.us platform, including its software, design, trademarks, and proprietary AI models, is the intellectual property of myaircraft.us Inc. and is protected by applicable intellectual property laws. Nothing in these terms grants you any rights in our intellectual property except the limited right to use the Service as described herein.",
  },
  {
    title: "11. Privacy",
    content: "Our collection and use of personal information is governed by our Privacy Policy, which is incorporated into these Terms of Service by reference. By using the Service, you agree to the terms of the Privacy Policy.",
  },
  {
    title: "12. Third-Party Services",
    content: "The Service may integrate with third-party services such as parts suppliers, payment processors, and aviation databases. Your use of third-party services is governed by those services' own terms and privacy policies. myaircraft.us is not responsible for the accuracy, availability, or policies of third-party services.",
  },
  {
    title: "13. Service Availability",
    content: "We target 99.9% uptime for the Service. Scheduled maintenance will be announced with reasonable advance notice. Unplanned outages will be communicated through our status page at status.myaircraft.us. We do not guarantee uninterrupted access to the Service.",
  },
  {
    title: "14. Limitation of Liability",
    content: "TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, MYAIRCRAFT.US SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOSS OF DATA, LOSS OF PROFITS, OR PROPERTY DAMAGE, ARISING FROM YOUR USE OF OR INABILITY TO USE THE SERVICE. OUR TOTAL LIABILITY IN ANY 12-MONTH PERIOD SHALL NOT EXCEED THE SUBSCRIPTION FEES PAID BY YOU IN THAT PERIOD.",
  },
  {
    title: "15. Indemnification",
    content: "You agree to indemnify and hold harmless myaircraft.us, its officers, directors, employees, and agents from any claims, damages, or expenses arising from: (a) your use of the Service; (b) your violation of these terms; (c) your violation of any third-party rights; or (d) any aviation maintenance decision made based on information from the platform.",
  },
  {
    title: "16. Termination",
    content: "Either party may terminate the subscription at any time. You may cancel through your account settings. We may terminate your account for violation of these terms, non-payment, or fraudulent activity. Upon termination, your access ceases and records are handled per the Privacy Policy. Termination does not entitle you to a refund of any pre-paid subscription fees.",
  },
  {
    title: "17. Governing Law and Disputes",
    content: "These Terms of Service are governed by the laws of the State of Texas, without regard to conflict of law principles. Any dispute arising from these terms or your use of the Service shall be resolved by binding arbitration in Austin, Texas under the rules of the American Arbitration Association, except that either party may seek injunctive relief in any court of competent jurisdiction. Class action waiver: disputes must be brought individually, not as part of a class action.",
  },
  {
    title: "18. Changes to Terms",
    content: "We may update these Terms of Service from time to time. Material changes will be communicated by email and in-app notice at least 14 days before taking effect. Continued use of the Service after changes take effect constitutes acceptance of the updated terms.",
  },
  {
    title: "19. Contact",
    content: "Questions about these Terms of Service should be directed to legal@myaircraft.us or by mail to: myaircraft.us Inc., 1700 S Lamar Blvd, Suite 200, Austin, TX 78704.",
  },
];

export function TermsPage() {
  return (
    <div className="bg-[#0A1628] min-h-screen">
      {/* Hero */}
      <section className="relative pt-24 pb-12 px-4 border-b border-white/8">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <ScrollText className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h1 className="text-white text-[30px]" style={{ fontWeight: 800 }}>Terms of Service</h1>
              <p className="text-white/35 text-[13px]">Last updated: April 1, 2026 · Effective: April 15, 2026</p>
            </div>
          </div>
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-5 py-4">
            <p className="text-white/70 text-[14px] leading-relaxed">
              <span style={{ fontWeight: 600 }} className="text-amber-300">Important: </span>
              myaircraft.us is an organizational tool, not an FAA-approved maintenance system. AI outputs are for reference only. Always consult a qualified A&P mechanic or IA for maintenance decisions. Your physical logbooks remain the legal record.
            </p>
          </div>
        </div>
      </section>

      {/* Content */}
      <section className="px-4 py-12">
        <div className="max-w-3xl mx-auto">
          {/* TOC */}
          <div className="bg-[#0d1f3c] border border-white/8 rounded-2xl p-6 mb-10">
            <h2 className="text-white/50 text-[12px] mb-4" style={{ fontWeight: 700, letterSpacing: "0.07em" }}>TABLE OF CONTENTS</h2>
            <div className="grid grid-cols-2 gap-2">
              {SECTIONS.map((s) => (
                <div key={s.title} className="text-white/35 text-[12px] hover:text-white/60 transition-colors cursor-pointer">
                  {s.title.split(". ")[0]}. {s.title.split(". ")[1]}
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-8">
            {SECTIONS.map((section) => (
              <div key={section.title}>
                <h2 className="text-white text-[17px] mb-3 pb-3 border-b border-white/8" style={{ fontWeight: 700 }}>{section.title}</h2>
                <p className="text-white/50 text-[14px] leading-relaxed">{section.content}</p>
              </div>
            ))}
          </div>

          <div className="mt-12 pt-8 border-t border-white/8">
            <p className="text-white/30 text-[13px] mb-4">
              myaircraft.us Inc. · Austin, Texas · Not affiliated with the FAA or any government agency.
            </p>
            <div className="flex gap-4">
              <Link href="/privacy" className="text-[#60a5fa] hover:text-[#93c5fd] text-[13px] transition-colors" style={{ fontWeight: 500 }}>Privacy Policy</Link>
              <Link href="/contact" className="text-[#60a5fa] hover:text-[#93c5fd] text-[13px] transition-colors" style={{ fontWeight: 500 }}>Contact Us</Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
