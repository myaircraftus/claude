"use client";

import { useState, useRef } from "react";
import { motion, useInView } from "motion/react";
import { BookOpen, Clock, Tag, ArrowRight, Search, ChevronRight, Rss } from "lucide-react";
import Link from "next/link";

export type BlogPagePost = {
  id: string;
  category: string;
  title: string;
  excerpt: string;
  author: string;
  authorRole: string;
  date: string;
  readTime: string;
  tag: string;
  tagColor: string;
  featured: boolean;
};

function FadeIn({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  return (
    <motion.div ref={ref} initial={{ opacity: 0, y: 28 }} animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }} className={className}>
      {children}
    </motion.div>
  );
}

const CATEGORIES = ["All", "Compliance", "AI & Technology", "Maintenance", "Regulations", "Platform Updates", "Owner Tips"];

const FALLBACK_POSTS: BlogPagePost[] = [
  {
    id: "understanding-ad-compliance-2025",
    category: "Compliance",
    title: "Understanding AD Compliance in 2025: What Every Aircraft Owner Needs to Know",
    excerpt: "Airworthiness Directives are one of the most misunderstood — and most consequential — parts of aircraft ownership. Here's a practical guide to staying legal without losing your weekends.",
    author: "Sarah Okonkwo",
    authorRole: "CTO, A&P/IA",
    date: "April 8, 2026",
    readTime: "8 min read",
    tag: "Must-read",
    tagColor: "bg-red-500/15 text-red-400 border-red-500/20",
    featured: true,
  },
  {
    id: "ai-aviation-records-how-it-works",
    category: "AI & Technology",
    title: "How AI Actually Reads Your Logbooks — And What It Can and Can't Do",
    excerpt: "Large language models can answer questions from unstructured documents. But aviation records have unique challenges: handwritten entries, abbreviations, dates in margin — here's how we handle all of it.",
    author: "Daniel Reyes",
    authorRole: "Head of AI",
    date: "March 28, 2026",
    readTime: "11 min read",
    tag: "Deep Dive",
    tagColor: "bg-violet-500/15 text-violet-400 border-violet-500/20",
    featured: true,
  },
  {
    id: "annual-inspection-checklist",
    category: "Maintenance",
    title: "Annual Inspection Season: A Pre-Annual Checklist for Aircraft Owners",
    excerpt: "Your annual is coming up. Here's exactly what to prepare, what documents to have ready, and what questions to ask your IA before the inspection begins.",
    author: "Marcus Webb",
    authorRole: "CEO, PPL/IR",
    date: "March 15, 2026",
    readTime: "6 min read",
    tag: "Owner Tips",
    tagColor: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
    featured: false,
  },
  {
    id: "faa-registry-changes-2026",
    category: "Regulations",
    title: "FAA Aircraft Registry Updates in 2026: What Changed and What It Means",
    excerpt: "The FAA updated several processes for aircraft registration renewal and N-number assignment this year. We break down the changes and how they affect owners of recently-registered aircraft.",
    author: "Lisa Chen",
    authorRole: "General Counsel",
    date: "March 3, 2026",
    readTime: "5 min read",
    tag: "Regulatory",
    tagColor: "bg-blue-500/15 text-blue-400 border-blue-500/20",
    featured: false,
  },
  {
    id: "mechanic-portal-v2-launch",
    category: "Platform Updates",
    title: "Mechanic Portal 2.0: Work Orders, Revenue Analytics, and the New Parts Catalog",
    excerpt: "We just shipped the biggest update to the Mechanic Portal since launch. Here's a walkthrough of every new feature, why we built it, and feedback from our beta users.",
    author: "Marcus Webb",
    authorRole: "CEO",
    date: "February 18, 2026",
    readTime: "7 min read",
    tag: "New Feature",
    tagColor: "bg-amber-500/15 text-amber-400 border-amber-500/20",
    featured: false,
  },
  {
    id: "elt-battery-replacement-guide",
    category: "Maintenance",
    title: "ELT Battery Replacement: The Compliance Item Most Owners Forget",
    excerpt: "FAR 91.207 requires ELT batteries to be replaced at specific intervals. They're cheap to replace and expensive to forget. Here's everything you need to know.",
    author: "Sarah Okonkwo",
    authorRole: "A&P/IA",
    date: "February 5, 2026",
    readTime: "4 min read",
    tag: "Safety",
    tagColor: "bg-red-500/15 text-red-400 border-red-500/20",
    featured: false,
  },
  {
    id: "cessna-182-common-ads",
    category: "Compliance",
    title: "Cessna 182: The 12 ADs Every Owner Should Have Memorized",
    excerpt: "The Cessna 182 is one of the most common GA aircraft in the U.S. fleet — and it has a set of frequently-issued ADs that catch owners off guard. Know these before your next annual.",
    author: "Sarah Okonkwo",
    authorRole: "A&P/IA",
    date: "January 22, 2026",
    readTime: "9 min read",
    tag: "Type-Specific",
    tagColor: "bg-sky-500/15 text-sky-400 border-sky-500/20",
    featured: false,
  },
  {
    id: "document-scanning-best-practices",
    category: "Owner Tips",
    title: "Scanning Paper Logbooks: Best Practices for Maximum OCR Accuracy",
    excerpt: "Whether you're using our free scanning service or doing it yourself, the quality of your scan determines the quality of AI-extracted data. Here are the settings and techniques that matter.",
    author: "Daniel Reyes",
    authorRole: "Head of AI",
    date: "January 10, 2026",
    readTime: "5 min read",
    tag: "Guide",
    tagColor: "bg-teal-500/15 text-teal-400 border-teal-500/20",
    featured: false,
  },
  {
    id: "prepurchase-inspection-questions",
    category: "Owner Tips",
    title: "27 Questions to Ask Before Buying a Used Aircraft",
    excerpt: "A pre-purchase inspection only covers what your IA can see. Before you bring in the inspector, use this checklist to audit the aircraft's records — and spot red flags in the paper trail.",
    author: "Tom Brandt",
    authorRole: "VP Sales, CFI",
    date: "December 18, 2025",
    readTime: "10 min read",
    tag: "Buyer's Guide",
    tagColor: "bg-amber-500/15 text-amber-400 border-amber-500/20",
    featured: false,
  },
];

export function BlogPage({ posts }: { posts?: BlogPagePost[] } = {}) {
  const [activeCategory, setActiveCategory] = useState("All");
  const [query, setQuery] = useState("");
  const sourcePosts = posts && posts.length > 0 ? posts : FALLBACK_POSTS;

  const filtered = sourcePosts.filter((p) => {
    const matchesCat = activeCategory === "All" || p.category === activeCategory;
    const matchesQ   = query === "" || p.title.toLowerCase().includes(query.toLowerCase()) || p.excerpt.toLowerCase().includes(query.toLowerCase());
    return matchesCat && matchesQ;
  });

  const featured = filtered.filter((p) => p.featured);
  const rest     = filtered.filter((p) => !p.featured);

  return (
    <div className="bg-[#0A1628] min-h-screen">

      {/* ── Hero ── */}
      <section className="relative pt-24 pb-16 px-4 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-[#1E3A5F]/40 to-transparent pointer-events-none" />
        <div className="max-w-4xl mx-auto text-center relative z-10">
          <FadeIn>
            <div className="inline-flex items-center gap-2 bg-[#2563EB]/15 border border-[#2563EB]/30 rounded-full px-4 py-1.5 mb-6">
              <Rss className="w-3.5 h-3.5 text-[#60a5fa]" />
              <span className="text-[#60a5fa] text-[12px]" style={{ fontWeight: 700, letterSpacing: "0.07em" }}>INSIGHTS & UPDATES</span>
            </div>
          </FadeIn>
          <FadeIn delay={0.08}>
            <h1 className="text-white text-[48px] tracking-tight mb-4 leading-[1.15]" style={{ fontWeight: 900 }}>
              The myaircraft.us Blog
            </h1>
          </FadeIn>
          <FadeIn delay={0.14}>
            <p className="text-white/45 text-[17px] leading-relaxed max-w-xl mx-auto mb-8">
              Aviation compliance, maintenance best practices, AI technology, and platform updates — written by pilots and mechanics.
            </p>
          </FadeIn>

          {/* Search */}
          <FadeIn delay={0.2}>
            <div className="max-w-md mx-auto relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search articles…"
                className="w-full bg-white/5 border border-white/15 rounded-xl pl-10 pr-4 py-3 text-white placeholder:text-white/30 text-[14px] focus:outline-none focus:border-[#2563EB]/60 transition-colors"
              />
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── Category tabs ── */}
      <section className="px-4 pb-8">
        <div className="max-w-5xl mx-auto">
          <FadeIn>
            <div className="flex items-center gap-2 flex-wrap">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] border transition-all ${
                    activeCategory === cat
                      ? "bg-[#2563EB] border-[#2563EB] text-white"
                      : "bg-white/5 border-white/10 text-white/50 hover:text-white hover:border-white/25"
                  }`}
                  style={{ fontWeight: activeCategory === cat ? 600 : 400 }}
                >
                  {cat === "All" && <Tag className="w-3.5 h-3.5" />}
                  {cat}
                </button>
              ))}
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── Posts ── */}
      <section className="px-4 pb-20">
        <div className="max-w-5xl mx-auto">
          {filtered.length === 0 && (
            <div className="text-center py-20">
              <BookOpen className="w-10 h-10 text-white/20 mx-auto mb-3" />
              <p className="text-white/40 text-[15px]">No articles found for your search.</p>
            </div>
          )}

          {/* Featured posts */}
          {featured.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
              {featured.map((post, i) => (
                <FadeIn key={post.id} delay={i * 0.06}>
                  <Link href={`/blog/${post.id}`} className="block">
                    <article className="bg-gradient-to-br from-[#0d1f3c] to-[#0a1628] border border-white/10 rounded-2xl p-6 flex flex-col h-full hover:border-white/20 transition-colors group cursor-pointer">
                      <div className="flex items-center gap-2 mb-4 flex-wrap">
                        <span className={`text-[11px] px-2.5 py-1 rounded-full border ${post.tagColor}`} style={{ fontWeight: 600 }}>{post.tag}</span>
                        <span className="text-[#60a5fa] text-[11px]" style={{ fontWeight: 600 }}>{post.category}</span>
                      </div>
                      <h2 className="text-white text-[19px] mb-3 leading-snug group-hover:text-[#60a5fa] transition-colors" style={{ fontWeight: 700 }}>{post.title}</h2>
                      <p className="text-white/45 text-[13px] leading-relaxed flex-1 mb-5">{post.excerpt}</p>
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-white/70 text-[12px]" style={{ fontWeight: 600 }}>{post.author}</div>
                          <div className="text-white/30 text-[11px]">{post.date} · {post.readTime}</div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-white/30 group-hover:text-[#60a5fa] group-hover:translate-x-0.5 transition-all" />
                      </div>
                    </article>
                  </Link>
                </FadeIn>
              ))}
            </div>
          )}

          {/* Rest of posts */}
          {rest.length > 0 && (
            <div className="space-y-3">
              {rest.map((post, i) => (
                <FadeIn key={post.id} delay={i * 0.04}>
                  <Link href={`/blog/${post.id}`} className="block">
                    <article className="bg-[#0d1f3c] border border-white/8 rounded-2xl px-6 py-5 flex items-center gap-5 hover:border-white/20 transition-colors group cursor-pointer">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <span className={`text-[11px] px-2 py-0.5 rounded-full border ${post.tagColor}`} style={{ fontWeight: 600 }}>{post.tag}</span>
                          <span className="text-white/30 text-[11px]">{post.category}</span>
                        </div>
                        <h3 className="text-white text-[15px] mb-1 leading-snug group-hover:text-[#60a5fa] transition-colors truncate" style={{ fontWeight: 600 }}>{post.title}</h3>
                        <div className="flex items-center gap-3 text-white/30 text-[12px]">
                          <span style={{ fontWeight: 500 }}>{post.author}</span>
                          <span>·</span>
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{post.readTime}</span>
                          <span>·</span>
                          <span>{post.date}</span>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-white/25 group-hover:text-[#60a5fa] group-hover:translate-x-0.5 transition-all shrink-0" />
                    </article>
                  </Link>
                </FadeIn>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Newsletter CTA ── */}
      <section className="px-4 py-16 bg-[#060f1e]">
        <div className="max-w-2xl mx-auto text-center">
          <FadeIn>
            <div className="w-12 h-12 rounded-2xl bg-[#2563EB]/15 border border-[#2563EB]/30 flex items-center justify-center mx-auto mb-5">
              <Rss className="w-6 h-6 text-[#60a5fa]" />
            </div>
            <h2 className="text-white text-[30px] mb-3" style={{ fontWeight: 800 }}>Stay current on aviation compliance</h2>
            <p className="text-white/40 text-[15px] mb-6">New articles every week. No spam. Unsubscribe anytime.</p>
            <div className="flex gap-3 max-w-sm mx-auto">
              <input
                type="email"
                placeholder="your@email.com"
                className="flex-1 bg-white/5 border border-white/15 rounded-xl px-4 py-3 text-white placeholder:text-white/25 text-[14px] focus:outline-none focus:border-[#2563EB]/60 transition-colors"
              />
              <button className="bg-[#2563EB] hover:bg-[#1d4ed8] text-white px-5 py-3 rounded-xl text-[14px] transition-all shrink-0 flex items-center gap-1.5" style={{ fontWeight: 600 }}>
                Subscribe <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </FadeIn>
        </div>
      </section>

    </div>
  );
}
