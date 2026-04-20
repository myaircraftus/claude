"use client";

import { useState, useRef, useEffect } from "react";
import { motion } from "motion/react";
import {
  Sparkles, Send, X, CheckCircle2, XCircle, Plane,
  FileText, Wrench, Receipt, AlertTriangle, ArrowRight,
  DollarSign, Clock, Star, Zap, History, Pin, Trash2,
  ChevronRight, BarChart3,
} from "lucide-react";

/* ══════════════════════════════════════════════════════════════
   TYPES
══════════════════════════════════════════════════════════════ */
interface BaseMsg { id: string; role: "user" | "ai"; ts: Date; }

interface TextMsg    extends BaseMsg { kind: "text";    text: string; }
interface ConfirmMsg extends BaseMsg {
  kind: "confirm";
  understanding: string;
  bullets: string[];
  confirmLabel: string;
  payload: ActionPayload;
  state: "pending" | "confirmed" | "declined";
}
interface ResultMsg  extends BaseMsg {
  kind: "result";
  ok: boolean;
  headline: string;
  bullets: string[];
  kv?: Record<string, string>;
}
interface EntityMsg  extends BaseMsg {
  kind: "entity";
  etype: "aircraft" | "estimate" | "workorder" | "invoice" | "squawk";
  data: Record<string, any>;
  follow?: string;
  quickActions?: { label: string; cmd: string; color: string }[];
}
interface ListMsg    extends BaseMsg {
  kind: "list";
  title: string;
  subtitle?: string;
  rows: { id: string; label: string; sub: string; badge?: string; badgeColor?: string; cmd?: string }[];
}

type AiMsg = TextMsg | ConfirmMsg | ResultMsg | EntityMsg | ListMsg;

interface ActionPayload {
  execute: () => { ok: boolean; headline: string; bullets: string[]; kv?: Record<string, string> };
}

interface ConvCtx {
  aircraft?: string;
  estimate?: string;
  workOrder?: string;
  invoice?: string;
  squawk?: string;
}

/* ══════════════════════════════════════════════════════════════
   MOCK DATA
══════════════════════════════════════════════════════════════ */
const AIRCRAFT: Array<{ id: string; model: string; year: number; status: string; hobbs: number; owner: string; squawks: number }> = [];
const ESTIMATES: Array<{ id: string; aircraft: string; customer: string; desc: string; amount: number; status: string; date: string }> = [];
const WORK_ORDERS: Array<{ id: string; aircraft: string; desc: string; status: string; mechanic: string }> = [];
const INVOICES: Array<{ id: string; aircraft: string; customer: string; desc: string; amount: number; status: string; date: string; due: string }> = [];
const SQUAWKS: Array<{ id: string; aircraft: string; desc: string; sev: string; status: string; reported: string }> = [];

/* ══════════════════════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════════════════════ */
let _id = 100;
function uid() { return `m${_id++}`; }
function fmt$(n: number) { return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2 })}`; }
function randWO() { return `WO-2026-0${Math.floor(Math.random() * 900 + 100)}`; }
function aiText(text: string): TextMsg { return { id: uid(), role: "ai", ts: new Date(), kind: "text", text }; }

function renderBold(text: string) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return parts.map((p, i) => i % 2 === 1 ? <strong key={i} style={{ fontWeight: 600 }}>{p}</strong> : p);
}
function renderText(text: string) {
  return <>{text.split("\n").map((line, i, arr) => <span key={i}>{renderBold(line)}{i < arr.length - 1 && <br />}</span>)}</>;
}

/* ══════════════════════════════════════════════════════════════
   NLP PROCESSOR
══════════════════════════════════════════════════════════════ */
function processInput(raw: string, ctx: ConvCtx): { replies: AiMsg[]; newCtx: ConvCtx } {
  const lo = raw.toLowerCase().trim();
  const newCtx = { ...ctx };
  const replies: AiMsg[] = [];

  const nMatch   = raw.match(/\bN\d{4,5}\b/i);
  const estMatch = raw.match(/EST[-\s]?2026[-\s]?\d{4}/i);
  const woMatch  = raw.match(/WO[-\s]?2026[-\s]?\d{4}/i);
  const invMatch = raw.match(/INV[-\s]?2026[-\s]?\d{4}/i);
  const sqMatch  = raw.match(/SQ[-\s]?\d{3}/i);

  const nId    = nMatch   ? nMatch[0].toUpperCase() : null;
  const estId  = estMatch ? estMatch[0].toUpperCase().replace(/\s/g, "-") : null;
  const woId   = woMatch  ? woMatch[0].toUpperCase().replace(/\s/g, "-") : null;
  const invId  = invMatch ? invMatch[0].toUpperCase().replace(/\s/g, "-") : null;
  const sqId   = sqMatch  ? sqMatch[0].toUpperCase().replace(/\s/g, "-") : null;

  if (nId) newCtx.aircraft = nId;
  if (estId) newCtx.estimate = estId;
  if (woId) newCtx.workOrder = woId;
  if (invId) newCtx.invoice = invId;
  if (sqId) newCtx.squawk = sqId;

  const refAc  = nId   || (/\b(it|that|this aircraft)\b/.test(lo) ? ctx.aircraft  : null);
  const refEst = estId || (/\b(it|that|this estimate)\b/.test(lo) ? ctx.estimate  : null);
  const refWo  = woId  || (/\b(it|that|this work order)\b/.test(lo) ? ctx.workOrder : null);
  const refInv = invId || (/\b(it|that|this invoice)\b/.test(lo) ? ctx.invoice   : null);

  /* ── FLEET / OVERVIEW ── */
  if (/\b(fleet|overview|all aircraft|attention|what.{0,20}(going on|today|now)|summary|status update|pending)\b/.test(lo) && !/\b(squawk|estimate|work order|invoice|approve)\b/.test(lo)) {
    const grounded = AIRCRAFT.filter(a => a.status.includes("Ground"));
    const pendingCount = ESTIMATES.filter(e => e.status === "Pending Approval").length
      + WORK_ORDERS.filter(w => w.status === "Pending Approval").length
      + INVOICES.filter(i => i.status === "Draft").length;
    replies.push(aiText(`Here's your fleet snapshot. You have **${AIRCRAFT.length} aircraft** — ${grounded.length > 0 ? `**${grounded.length} grounded**` : "all airworthy"} — with **${SQUAWKS.filter(s => s.status === "Open").length} open squawks** and **${pendingCount} items** waiting for your action.`));
    replies.push({ id: uid(), role: "ai", ts: new Date(), kind: "list", title: "Aircraft Status", rows: AIRCRAFT.map(a => ({
      id: a.id, label: `${a.id} — ${a.model}`, sub: `${a.owner} · ${a.hobbs} hrs`,
      badge: a.status,
      badgeColor: a.status === "Airworthy" ? "text-emerald-700 bg-emerald-50 border-emerald-200" : "text-red-700 bg-red-50 border-red-200",
      cmd: `tell me about ${a.id}`,
    })) });
    return { replies, newCtx };
  }

  /* ── AIRCRAFT DETAIL ── */
  const acObj = nId ? AIRCRAFT.find(a => a.id === nId) : (ctx.aircraft ? AIRCRAFT.find(a => a.id === ctx.aircraft) : null);
  if (acObj && /\b(about|status|info|detail|show|view|open|tell|check|what|how|inspect|look)\b/.test(lo) && !/\b(squawk|estimate|work order|invoice|approve|reject|ground|release|airworthy)\b/.test(lo)) {
    newCtx.aircraft = acObj.id;
    const openSq = SQUAWKS.filter(s => s.aircraft === acObj.id && s.status === "Open");
    const wos = WORK_ORDERS.filter(w => w.aircraft === acObj.id);
    const isAOG = acObj.status.includes("Ground");
    replies.push({ id: uid(), role: "ai", ts: new Date(), kind: "entity", etype: "aircraft", data: acObj,
      follow: `${acObj.id} has **${openSq.length} open squawk${openSq.length !== 1 ? "s" : ""}** and **${wos.length} work order${wos.length !== 1 ? "s" : ""}** on record. ${isAOG ? "⚠️ This aircraft is currently **grounded (AOG)** and cannot be dispatched." : "This aircraft is **airworthy** and available for scheduling."}`,
      quickActions: [
        { label: "View Squawks",    cmd: `show squawks for ${acObj.id}`,    color: "text-amber-700 bg-amber-50 border-amber-200" },
        { label: "View Work Orders",cmd: `show work orders for ${acObj.id}`,color: "text-blue-700 bg-blue-50 border-blue-200"   },
        isAOG
          ? { label: "Release Aircraft", cmd: `release ${acObj.id} airworthy`, color: "text-emerald-700 bg-emerald-50 border-emerald-200" }
          : { label: "Ground Aircraft",  cmd: `ground ${acObj.id}`,            color: "text-red-700 bg-red-50 border-red-200" },
      ],
    });
    return { replies, newCtx };
  }

  /* ── SQUAWKS: LIST ── */
  if (/\b(squawk|squawks|discrepanc)\b/.test(lo) && /\b(show|list|view|open|all|my|what|check|tell)\b/.test(lo) && !/\b(add|log|create|new|close|prioritize)\b/.test(lo)) {
    const filterAc = nId || ctx.aircraft;
    const list = filterAc ? SQUAWKS.filter(s => s.aircraft === filterAc && s.status === "Open") : SQUAWKS.filter(s => s.status === "Open");
    replies.push({ id: uid(), role: "ai", ts: new Date(), kind: "list",
      title: filterAc ? `Open Squawks — ${filterAc}` : "All Open Squawks",
      subtitle: `${list.length} squawk${list.length !== 1 ? "s" : ""} requiring attention`,
      rows: list.map(s => ({
        id: s.id, label: `${s.id} — ${s.aircraft}`, sub: s.desc,
        badge: s.sev,
        badgeColor: s.sev === "High" ? "text-red-700 bg-red-50 border-red-200" : "text-amber-700 bg-amber-50 border-amber-200",
        cmd: `tell me about squawk ${s.id}`,
      })),
    });
    return { replies, newCtx };
  }

  /* ── SQUAWK: SINGLE ── */
  if (sqId) {
    const sq = SQUAWKS.find(s => s.id === sqId);
    if (sq) {
      newCtx.squawk = sq.id;
      replies.push({ id: uid(), role: "ai", ts: new Date(), kind: "entity", etype: "squawk", data: sq,
        follow: `Severity is **${sq.sev}**. ${sq.sev === "High" ? "This squawk is grounding-level — consider addressing it immediately." : "This squawk is being tracked. You can prioritize or close it once resolved."}`,
        quickActions: [
          { label: "Close Squawk",      cmd: `close squawk ${sq.id}`,      color: "text-emerald-700 bg-emerald-50 border-emerald-200" },
          { label: "Prioritize (High)", cmd: `prioritize squawk ${sq.id}`, color: "text-red-700 bg-red-50 border-red-200" },
        ],
      });
      return { replies, newCtx };
    }
  }

  /* ── ADD SQUAWK ── */
  if (/\b(add|log|create|file|new)\s+(a\s+)?squawk\b/.test(lo)) {
    const ac = nId || ctx.aircraft;
    const descMatch = raw.match(/(?:about|for|that|saying|:)\s+(.+)/i) || raw.match(/squawk\s+(?:on\s+\w+\s+)?(.+)/i);
    const desc = descMatch ? descMatch[1].trim() : "Unspecified discrepancy";
    const newSqId = `SQ-00${SQUAWKS.length + 1}`;
    if (!ac) {
      replies.push(aiText("Which aircraft would you like to log this squawk on? Please include the N-number — for example: _\"Add a squawk on N12345 about the GPS signal\"_."));
      return { replies, newCtx };
    }
    const acData = AIRCRAFT.find(a => a.id === ac);
    replies.push({ id: uid(), role: "ai", ts: new Date(), kind: "confirm",
      understanding: `Log a new squawk on **${ac}**${acData ? ` (${acData.model})` : ""}`,
      bullets: [
        `Squawk ID: **${newSqId}** (auto-assigned)`,
        `Aircraft: **${ac}**`,
        `Description: "${desc}"`,
        `Severity: **Medium** — adjustable after creation`,
        "Assigned mechanic and shop will be notified",
      ],
      confirmLabel: "Add Squawk",
      payload: { execute: () => ({ ok: true, headline: `Squawk ${newSqId} logged on ${ac}`, bullets: [`${newSqId} created on ${ac}`, `"${desc}"`, "Severity: Medium", "Shop & mechanic notified"], kv: { Aircraft: ac, "Squawk ID": newSqId, Severity: "Medium", Status: "Open" } }) },
      state: "pending",
    });
    return { replies, newCtx };
  }

  /* ── ESTIMATES: LIST ── */
  if (/\b(estimates?)\b/.test(lo) && /\b(show|open|view|list|pull|pending|my|all|see|check)\b/.test(lo) && !/\b(approve|reject)\b/.test(lo)) {
    const filterAc = nId || ctx.aircraft;
    const list = filterAc ? ESTIMATES.filter(e => e.aircraft === filterAc) : ESTIMATES;
    replies.push({ id: uid(), role: "ai", ts: new Date(), kind: "list",
      title: filterAc ? `Estimates — ${filterAc}` : "All Estimates",
      subtitle: `${list.length} estimate${list.length !== 1 ? "s" : ""}`,
      rows: list.map(e => ({
        id: e.id, label: `${e.id} — ${e.customer}`, sub: `${e.desc} · ${fmt$(e.amount)}`,
        badge: e.status,
        badgeColor: e.status === "Pending Approval" ? "text-amber-700 bg-amber-50 border-amber-200" : "text-slate-600 bg-slate-50 border-slate-200",
        cmd: `open estimate ${e.id}`,
      })),
    });
    return { replies, newCtx };
  }

  /* ── ESTIMATE: OPEN SPECIFIC ── */
  if (estId || (refEst && /\b(open|view|show|tell|check|about|pull up)\b/.test(lo))) {
    const id = estId || refEst!;
    const est = ESTIMATES.find(e => e.id === id);
    if (est) {
      newCtx.estimate = est.id;
      replies.push({ id: uid(), role: "ai", ts: new Date(), kind: "entity", etype: "estimate", data: est,
        follow: `This estimate is **${est.status}**. ${est.status === "Pending Approval" ? "Approving it will automatically create a work order and notify the customer." : ""}`,
        quickActions: est.status === "Pending Approval" ? [
          { label: "Approve Estimate", cmd: `approve estimate ${est.id}`, color: "text-emerald-700 bg-emerald-50 border-emerald-200" },
          { label: "Reject Estimate",  cmd: `reject estimate ${est.id}`,  color: "text-red-700 bg-red-50 border-red-200" },
        ] : [],
      });
      return { replies, newCtx };
    }
  }

  /* ── APPROVE ESTIMATE ── */
  if (/\b(approve)\b/.test(lo) && (/\b(estimate|est)\b/.test(lo) || refEst)) {
    const id = estId || refEst || null;
    if (/\ball\b/.test(lo)) {
      const pending = ESTIMATES.filter(e => e.status === "Pending Approval");
      replies.push({ id: uid(), role: "ai", ts: new Date(), kind: "confirm",
        understanding: `Approve all **${pending.length} pending estimates**`,
        bullets: [...pending.map(e => `${e.id} — ${e.customer}: ${fmt$(e.amount)}`), `${pending.length} work orders auto-created`, "All customers notified by email"],
        confirmLabel: "Approve All Estimates",
        payload: { execute: () => ({ ok: true, headline: `${pending.length} estimates approved`, bullets: [...pending.map(e => `${e.id} → Approved`), "Work orders created", "Customers notified"], kv: { Approved: String(pending.length), "WOs Created": String(pending.length) } }) },
        state: "pending",
      });
      return { replies, newCtx };
    }
    const est = id ? ESTIMATES.find(e => e.id === id) : null;
    if (!est) {
      replies.push(aiText("I couldn't find that estimate. Here are the ones currently pending your approval:"));
      replies.push({ id: uid(), role: "ai", ts: new Date(), kind: "list", title: "Pending Estimates",
        rows: ESTIMATES.filter(e => e.status === "Pending Approval").map(e => ({ id: e.id, label: `${e.id} — ${e.customer}`, sub: `${e.desc} · ${fmt$(e.amount)}`, badge: "Pending", badgeColor: "text-amber-700 bg-amber-50 border-amber-200", cmd: `approve estimate ${e.id}` })),
      });
      return { replies, newCtx };
    }
    const newWo = randWO();
    newCtx.estimate = est.id;
    replies.push({ id: uid(), role: "ai", ts: new Date(), kind: "confirm",
      understanding: `Approve estimate **${est.id}** for ${fmt$(est.amount)}`,
      bullets: [
        `Estimate: **${est.id}** — ${est.desc}`,
        `Customer: **${est.customer}** · Aircraft ${est.aircraft}`,
        `Amount: **${fmt$(est.amount)}**`,
        `Work order **${newWo}** will be created automatically`,
        "Customer notified by email · Billing clock starts",
      ],
      confirmLabel: "Approve Estimate",
      payload: { execute: () => ({ ok: true, headline: `${est.id} approved`, bullets: [`${est.id} → Approved`, `Work Order ${newWo} created`, `${est.customer} notified`, "Billing clock started"], kv: { Estimate: est.id, Amount: fmt$(est.amount), "WO Created": newWo, Status: "Approved" } }) },
      state: "pending",
    });
    return { replies, newCtx };
  }

  /* ── REJECT ESTIMATE ── */
  if (/\b(reject|decline|deny)\b/.test(lo) && (/\b(estimate|est)\b/.test(lo) || refEst)) {
    const id = estId || refEst;
    const est = id ? ESTIMATES.find(e => e.id === id) : null;
    if (!est) { replies.push(aiText("Which estimate would you like to reject? You can say _\"reject EST-2026-0018\"_ or just _\"reject it\"_ if we're already talking about one.")); return { replies, newCtx }; }
    newCtx.estimate = est.id;
    replies.push({ id: uid(), role: "ai", ts: new Date(), kind: "confirm",
      understanding: `Reject estimate **${est.id}**`,
      bullets: [`Estimate: **${est.id}** — ${est.desc}`, `Customer: **${est.customer}** · ${fmt$(est.amount)}`, "Status → Rejected", "Customer and shop will be notified"],
      confirmLabel: "Reject Estimate",
      payload: { execute: () => ({ ok: true, headline: `${est.id} rejected`, bullets: [`${est.id} → Rejected`, `${est.customer} notified`, "Shop notified", "Estimate archived"], kv: { Estimate: est.id, Status: "Rejected" } }) },
      state: "pending",
    });
    return { replies, newCtx };
  }

  /* ── WORK ORDERS: LIST ── */
  if (/\b(work orders?|wo)\b/.test(lo) && /\b(show|list|view|check|pending|my|all|see|open)\b/.test(lo) && !/\b(approve|authorize)\b/.test(lo)) {
    const filterAc = nId || ctx.aircraft;
    const list = filterAc ? WORK_ORDERS.filter(w => w.aircraft === filterAc) : WORK_ORDERS;
    if (woId) {
      const wo = WORK_ORDERS.find(w => w.id === woId);
      if (wo) {
        newCtx.workOrder = wo.id;
        replies.push({ id: uid(), role: "ai", ts: new Date(), kind: "entity", etype: "workorder", data: wo,
          follow: `This work order is **${wo.status}**. ${wo.status === "Pending Approval" ? "You need to authorize it before the mechanic can begin work." : ""}`,
          quickActions: wo.status === "Pending Approval" ? [{ label: "Authorize Work Order", cmd: `approve work order ${wo.id}`, color: "text-emerald-700 bg-emerald-50 border-emerald-200" }] : [],
        });
        return { replies, newCtx };
      }
    }
    replies.push({ id: uid(), role: "ai", ts: new Date(), kind: "list",
      title: filterAc ? `Work Orders — ${filterAc}` : "All Work Orders",
      rows: list.map(w => ({ id: w.id, label: `${w.id} — ${w.aircraft}`, sub: `${w.desc} · ${w.mechanic}`,
        badge: w.status,
        badgeColor: w.status === "Pending Approval" ? "text-amber-700 bg-amber-50 border-amber-200" : w.status === "In Progress" ? "text-blue-700 bg-blue-50 border-blue-200" : "text-emerald-700 bg-emerald-50 border-emerald-200",
        cmd: `open work order ${w.id}`,
      })),
    });
    return { replies, newCtx };
  }

  /* ── APPROVE WORK ORDER ── */
  if (/\b(approve|authorize)\b/.test(lo) && (/\b(work order|wo)\b/.test(lo) || refWo)) {
    const id = woId || refWo;
    const wo = id ? WORK_ORDERS.find(w => w.id === id) : WORK_ORDERS.find(w => w.status === "Pending Approval");
    if (!wo) { replies.push(aiText("I couldn't find a work order to authorize. Which one are you referring to?")); return { replies, newCtx }; }
    newCtx.workOrder = wo.id;
    replies.push({ id: uid(), role: "ai", ts: new Date(), kind: "confirm",
      understanding: `Authorize work order **${wo.id}**`,
      bullets: [`Work Order: **${wo.id}** — ${wo.desc}`, `Aircraft: **${wo.aircraft}**`, `Mechanic: **${wo.mechanic}**`, "Mechanic cleared to begin work", "Parts procurement authorized"],
      confirmLabel: "Authorize Work Order",
      payload: { execute: () => ({ ok: true, headline: `${wo.id} authorized`, bullets: [`${wo.id} → Authorized`, `${wo.mechanic} notified to begin`, "Parts procurement approved"], kv: { "Work Order": wo.id, Status: "Authorized", Mechanic: wo.mechanic } }) },
      state: "pending",
    });
    return { replies, newCtx };
  }

  /* ── INVOICES: LIST ── */
  if (/\b(invoices?|inv)\b/.test(lo) && /\b(show|list|view|check|pending|my|all|see|draft)\b/.test(lo) && !/\b(send|mark|paid)\b/.test(lo)) {
    if (invId) {
      const inv = INVOICES.find(i => i.id === invId);
      if (inv) {
        newCtx.invoice = inv.id;
        replies.push({ id: uid(), role: "ai", ts: new Date(), kind: "entity", etype: "invoice", data: inv,
          follow: inv.status === "Draft" ? "This invoice is a **draft** — ready to send to the customer when you're set." : inv.status === "Overdue" ? "⚠️ This invoice is **overdue**. Consider following up with the customer." : "",
          quickActions: inv.status === "Draft" ? [{ label: "Send Invoice", cmd: `send invoice ${inv.id}`, color: "text-blue-700 bg-blue-50 border-blue-200" }]
            : inv.status === "Overdue" ? [{ label: "Mark as Paid", cmd: `mark invoice ${inv.id} paid`, color: "text-emerald-700 bg-emerald-50 border-emerald-200" }] : [],
        });
        return { replies, newCtx };
      }
    }
    const filterAc = nId || ctx.aircraft;
    const list = filterAc ? INVOICES.filter(i => i.aircraft === filterAc) : INVOICES;
    replies.push({ id: uid(), role: "ai", ts: new Date(), kind: "list",
      title: filterAc ? `Invoices — ${filterAc}` : "All Invoices",
      rows: list.map(i => ({ id: i.id, label: `${i.id} — ${i.customer}`, sub: `${i.desc} · ${fmt$(i.amount)}`,
        badge: i.status,
        badgeColor: i.status === "Overdue" ? "text-red-700 bg-red-50 border-red-200" : i.status === "Draft" ? "text-slate-600 bg-slate-50 border-slate-200" : "text-emerald-700 bg-emerald-50 border-emerald-200",
        cmd: `open invoice ${i.id}`,
      })),
    });
    return { replies, newCtx };
  }

  /* ── SEND INVOICE ── */
  if (/\b(send)\b/.test(lo) && (/\b(invoice|inv)\b/.test(lo) || refInv)) {
    const id = invId || refInv;
    const inv = id ? INVOICES.find(i => i.id === id) : INVOICES.find(i => i.status === "Draft");
    if (!inv) { replies.push(aiText("I couldn't find a draft invoice to send. Which invoice are you referring to?")); return { replies, newCtx }; }
    newCtx.invoice = inv.id;
    replies.push({ id: uid(), role: "ai", ts: new Date(), kind: "confirm",
      understanding: `Send invoice **${inv.id}** to **${inv.customer}**`,
      bullets: [`Invoice: **${inv.id}** — ${inv.desc}`, `Customer: **${inv.customer}**`, `Amount: **${fmt$(inv.amount)}**`, "Customer receives email with payment link", "Payment due in 14 days · Auto-reminders at 7 and 3 days"],
      confirmLabel: "Send Invoice",
      payload: { execute: () => ({ ok: true, headline: `Invoice ${inv.id} sent to ${inv.customer}`, bullets: [`${inv.id} → Sent`, `Email delivered to ${inv.customer}`, "Payment link activated", "Auto-reminders scheduled"], kv: { Invoice: inv.id, Amount: fmt$(inv.amount), Status: "Sent", Due: "14 days" } }) },
      state: "pending",
    });
    return { replies, newCtx };
  }

  /* ── GROUND AIRCRAFT ── */
  if (/\b(ground|aog)\b/.test(lo) && !/\b(all)\b/.test(lo)) {
    const ac = refAc ? AIRCRAFT.find(a => a.id === refAc) : null;
    if (!ac) { replies.push(aiText("Which aircraft would you like to ground? Please provide the N-number — for example: _\"Ground N67890\"_.")); return { replies, newCtx }; }
    newCtx.aircraft = ac.id;
    if (ac.status.includes("Ground")) { replies.push(aiText(`${ac.id} is already grounded (AOG). To release it, say **"release ${ac.id}"** or **"set ${ac.id} airworthy"**.`)); return { replies, newCtx }; }
    replies.push({ id: uid(), role: "ai", ts: new Date(), kind: "confirm",
      understanding: `Ground **${ac.id}** (${ac.model}) — mark AOG`,
      bullets: [`Aircraft: **${ac.id}** — ${ac.model}`, "Status → **Grounded (AOG)**", "Aircraft removed from scheduling immediately", "All upcoming reservations cancelled", "Assigned mechanic alerted · Owner notified"],
      confirmLabel: "Ground Aircraft",
      payload: { execute: () => ({ ok: true, headline: `${ac.id} is now grounded (AOG)`, bullets: [`${ac.id} → Grounded (AOG)`, "Removed from scheduling", "Reservations cancelled", "Mechanic alerted"], kv: { Aircraft: ac.id, Status: "Grounded (AOG)", Alert: "Sent" } }) },
      state: "pending",
    });
    return { replies, newCtx };
  }

  /* ── RELEASE AIRCRAFT ── */
  if (/\b(release|airworthy|unground|return to service)\b/.test(lo)) {
    const ac = refAc ? AIRCRAFT.find(a => a.id === refAc) : null;
    if (!ac) { replies.push(aiText("Which aircraft would you like to return to service? Please include the N-number.")); return { replies, newCtx }; }
    newCtx.aircraft = ac.id;
    replies.push({ id: uid(), role: "ai", ts: new Date(), kind: "confirm",
      understanding: `Release **${ac.id}** back to airworthy`,
      bullets: [`Aircraft: **${ac.id}** — ${ac.model}`, "Status → **Airworthy**", "Aircraft available for scheduling", "AOG flag cleared · Customers notified"],
      confirmLabel: "Release to Airworthy",
      payload: { execute: () => ({ ok: true, headline: `${ac.id} released to airworthy`, bullets: [`${ac.id} → Airworthy`, "AOG flag cleared", "Available for scheduling", "Customers notified"], kv: { Aircraft: ac.id, Status: "Airworthy" } }) },
      state: "pending",
    });
    return { replies, newCtx };
  }

  /* ── FINANCIAL SUMMARY ── */
  if (/\b(financial|money|revenue|outstanding|billing|finance)\b/.test(lo)) {
    const outstanding = INVOICES.filter(i => i.status !== "Paid").reduce((s, i) => s + i.amount, 0);
    const pendingEst = ESTIMATES.filter(e => e.status === "Pending Approval").reduce((s, e) => s + e.amount, 0);
    replies.push(aiText(`Your financial snapshot: **${fmt$(outstanding)} outstanding** across ${INVOICES.filter(i => i.status !== "Paid").length} invoices, and **${fmt$(pendingEst)} in pending estimates** awaiting your approval.`));
    replies.push({ id: uid(), role: "ai", ts: new Date(), kind: "list", title: "Outstanding Invoices",
      rows: INVOICES.filter(i => i.status !== "Paid").map(i => ({ id: i.id, label: `${i.id} — ${i.customer}`, sub: fmt$(i.amount), badge: i.status, badgeColor: i.status === "Overdue" ? "text-red-700 bg-red-50 border-red-200" : "text-slate-600 bg-slate-50 border-slate-200", cmd: `open invoice ${i.id}` })),
    });
    return { replies, newCtx };
  }

  /* ── HELP ── */
  if (/\b(help|what can|how do|what do|guide|tutorial|commands)\b/.test(lo)) {
    replies.push(aiText("I'm your **AircraftDesk AI** — here's everything I can help you with:"));
    replies.push({ id: uid(), role: "ai", ts: new Date(), kind: "list", title: "What I Can Do",
      rows: [
        { id: "1", label: "Aircraft Management",  sub: "Check status, ground/release, view details",    cmd: "show me my fleet" },
        { id: "2", label: "Squawks",              sub: "View, add, close, or prioritize squawks",       cmd: "show all open squawks" },
        { id: "3", label: "Estimates",            sub: "View, approve, or reject estimates",            cmd: "show pending estimates" },
        { id: "4", label: "Work Orders",          sub: "View and authorize work orders",                cmd: "show all work orders" },
        { id: "5", label: "Invoices",             sub: "View, send, and track payment status",          cmd: "show my invoices" },
        { id: "6", label: "Financial Summary",    sub: "Outstanding balances and revenue overview",     cmd: "show financial summary" },
      ],
    });
    return { replies, newCtx };
  }

  /* ── FALLBACK ── */
  replies.push(aiText(`I'm not quite sure what you're looking for. Try asking me things like:\n\n• "What needs my attention today?"\n• "Show me pending estimates"\n• "Approve estimate EST-2026-0018"\n• "Add a squawk to N12345 about the GPS"\n• "What's the status of N67890?"\n\nOr say **"help"** to see everything I can do.`));
  return { replies, newCtx };
}

/* ══════════════════════════════════════════════════════════════
   ENTITY FIELDS
══════════════════════════════════════════════════════════════ */
function getEntityFields(etype: EntityMsg["etype"], data: Record<string, any>): Record<string, string> {
  if (etype === "aircraft")  return { "N-Number": data.id, Model: data.model, Year: String(data.year), Status: data.status, Hobbs: `${data.hobbs} hrs`, Owner: data.owner };
  if (etype === "estimate")  return { "Estimate": data.id, Aircraft: data.aircraft, Customer: data.customer, Description: data.desc, Amount: fmt$(data.amount), Status: data.status };
  if (etype === "workorder") return { "Work Order": data.id, Aircraft: data.aircraft, Description: data.desc, Status: data.status, Mechanic: data.mechanic };
  if (etype === "invoice")   return { Invoice: data.id, Aircraft: data.aircraft, Customer: data.customer, Description: data.desc, Amount: fmt$(data.amount), Status: data.status };
  return { "Squawk": data.id, Aircraft: data.aircraft, Description: data.desc, Severity: data.sev, Status: data.status, Reported: data.reported };
}

const ETYPE_ICON: Record<string, any> = { aircraft: Plane, estimate: FileText, workorder: Wrench, invoice: Receipt, squawk: AlertTriangle };
const ETYPE_COLOR: Record<string, { bg: string; icon: string; header: string }> = {
  aircraft:  { bg: "bg-blue-50",    icon: "text-blue-600 bg-blue-100",    header: "bg-blue-50 border-blue-100" },
  estimate:  { bg: "bg-amber-50",   icon: "text-amber-600 bg-amber-100",  header: "bg-amber-50 border-amber-100" },
  workorder: { bg: "bg-violet-50",  icon: "text-violet-600 bg-violet-100",header: "bg-violet-50 border-violet-100" },
  invoice:   { bg: "bg-emerald-50", icon: "text-emerald-600 bg-emerald-100", header: "bg-emerald-50 border-emerald-100" },
  squawk:    { bg: "bg-red-50",     icon: "text-red-600 bg-red-100",      header: "bg-red-50 border-red-100" },
};

/* ══════════════════════════════════════════════════════════════
   COMPONENTS
══════════════════════════════════════════════════════════════ */
function EntityCard({ msg, onCmd }: { msg: EntityMsg; onCmd: (c: string) => void }) {
  const { etype, data, follow, quickActions } = msg;
  const Icon = ETYPE_ICON[etype];
  const clr = ETYPE_COLOR[etype];
  const fields = getEntityFields(etype, data);
  const label = etype === "workorder" ? "Work Order" : etype.charAt(0).toUpperCase() + etype.slice(1);
  return (
    <div className="bg-white border border-border rounded-2xl rounded-tl-sm overflow-hidden shadow-sm">
      <div className={`flex items-center gap-2.5 px-4 py-3 border-b border-border ${clr.header}`}>
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${clr.icon}`}><Icon className="w-4 h-4" /></div>
        <span className="text-[12px] text-foreground" style={{ fontWeight: 600 }}>{label}</span>
        <span className="ml-auto text-[11px] text-muted-foreground font-mono">{data.id}</span>
      </div>
      <div className="px-4 py-3 grid grid-cols-2 gap-x-6 gap-y-2.5">
        {Object.entries(fields).map(([k, v]) => (
          <div key={k}>
            <div className="text-[9px] text-muted-foreground uppercase tracking-wide mb-0.5" style={{ fontWeight: 700 }}>{k}</div>
            <div className="text-[12px] text-foreground" style={{ fontWeight: 500 }}>{v}</div>
          </div>
        ))}
      </div>
      {follow && (
        <div className="px-4 py-2.5 border-t border-border bg-muted/20 text-[12px] text-muted-foreground leading-relaxed">
          {renderBold(follow)}
        </div>
      )}
      {quickActions && quickActions.length > 0 && (
        <div className="px-4 py-3 border-t border-border flex flex-wrap gap-2">
          {quickActions.map(a => (
            <button key={a.cmd} onClick={() => onCmd(a.cmd)} className={`text-[11px] px-3 py-1.5 rounded-xl border transition-all hover:shadow-sm ${a.color}`} style={{ fontWeight: 600 }}>
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ListCard({ msg, onCmd }: { msg: ListMsg; onCmd: (c: string) => void }) {
  return (
    <div className="bg-white border border-border rounded-2xl rounded-tl-sm overflow-hidden shadow-sm">
      <div className="px-4 py-3 border-b border-border">
        <div className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>{msg.title}</div>
        {msg.subtitle && <div className="text-[11px] text-muted-foreground mt-0.5">{msg.subtitle}</div>}
      </div>
      <div className="divide-y divide-border">
        {msg.rows.length === 0
          ? <div className="px-4 py-6 text-center text-[12px] text-muted-foreground">Nothing to show</div>
          : msg.rows.map(row => (
            <button key={row.id} onClick={() => row.cmd && onCmd(row.cmd)} disabled={!row.cmd}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left group">
              <div className="flex-1 min-w-0">
                <div className="text-[12px] text-foreground" style={{ fontWeight: 500 }}>{row.label}</div>
                <div className="text-[11px] text-muted-foreground truncate">{row.sub}</div>
              </div>
              {row.badge && <span className={`text-[10px] px-2 py-0.5 rounded-full border shrink-0 ${row.badgeColor || ""}`} style={{ fontWeight: 600 }}>{row.badge}</span>}
              {row.cmd && <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors shrink-0" />}
            </button>
          ))}
      </div>
    </div>
  );
}

function ConfirmCard({ msg, onConfirm, onDecline }: { msg: ConfirmMsg; onConfirm: () => void; onDecline: () => void }) {
  return (
    <div className={`bg-white border rounded-2xl rounded-tl-sm overflow-hidden shadow-sm transition-all ${msg.state === "confirmed" ? "border-emerald-200" : msg.state === "declined" ? "border-red-200 opacity-60" : "border-border"}`}>
      <div className="px-4 py-3 border-b border-border bg-muted/20">
        <div className="flex items-center gap-1.5 mb-1.5 text-[10px] text-muted-foreground" style={{ fontWeight: 600 }}>
          <Sparkles className="w-3 h-3 text-primary" /> I understood this as:
        </div>
        <div className="text-[13px] text-foreground" style={{ fontWeight: 600 }}>{renderBold(msg.understanding)}</div>
      </div>
      <div className="px-4 py-3 space-y-2">
        {msg.bullets.map((b, i) => (
          <div key={i} className="flex items-start gap-2 text-[12px] text-foreground">
            <ArrowRight className="w-3 h-3 text-muted-foreground/40 shrink-0 mt-0.5" />
            <span>{renderBold(b)}</span>
          </div>
        ))}
      </div>
      {msg.state === "pending" && (
        <div className="px-4 py-3 border-t border-border flex items-center gap-2">
          <button onClick={onConfirm} className="flex items-center gap-1.5 bg-primary text-white text-[12px] px-4 py-2 rounded-xl hover:bg-primary/90 transition-all" style={{ fontWeight: 600 }}>
            <CheckCircle2 className="w-3.5 h-3.5" /> Yes, {msg.confirmLabel}
          </button>
          <button onClick={onDecline} className="flex items-center gap-1.5 bg-muted text-muted-foreground text-[12px] px-4 py-2 rounded-xl hover:bg-muted/80 transition-all" style={{ fontWeight: 500 }}>
            <XCircle className="w-3.5 h-3.5" /> Cancel
          </button>
        </div>
      )}
      {msg.state === "confirmed" && (
        <div className="px-4 py-2.5 border-t border-emerald-200 bg-emerald-50 flex items-center gap-1.5 text-[11px] text-emerald-700" style={{ fontWeight: 600 }}>
          <CheckCircle2 className="w-3.5 h-3.5" /> Confirmed — executing...
        </div>
      )}
      {msg.state === "declined" && (
        <div className="px-4 py-2.5 border-t border-red-200 bg-red-50 flex items-center gap-1.5 text-[11px] text-red-600" style={{ fontWeight: 600 }}>
          <XCircle className="w-3.5 h-3.5" /> Cancelled
        </div>
      )}
    </div>
  );
}

function ResultCard({ msg }: { msg: ResultMsg }) {
  return (
    <div className={`bg-white border rounded-2xl rounded-tl-sm overflow-hidden shadow-sm ${msg.ok ? "border-emerald-200" : "border-red-200"}`}>
      <div className={`flex items-center gap-2 px-4 py-3 ${msg.ok ? "bg-emerald-50" : "bg-red-50"}`}>
        {msg.ok ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <XCircle className="w-4 h-4 text-red-600" />}
        <span className={`text-[13px] ${msg.ok ? "text-emerald-700" : "text-red-700"}`} style={{ fontWeight: 600 }}>{msg.headline}</span>
      </div>
      <div className="px-4 py-3 space-y-1.5">
        {msg.bullets.map((b, i) => (
          <div key={i} className="flex items-start gap-2 text-[12px] text-foreground">
            <ArrowRight className="w-3 h-3 text-muted-foreground/40 shrink-0 mt-0.5" />
            {b}
          </div>
        ))}
      </div>
      {msg.kv && (
        <div className="px-4 pb-3 flex flex-wrap gap-1.5">
          {Object.entries(msg.kv).map(([k, v]) => (
            <div key={k} className="flex items-center gap-1.5 bg-muted/40 rounded-lg px-2.5 py-1">
              <span className="text-[9px] text-muted-foreground uppercase tracking-wide" style={{ fontWeight: 700 }}>{k}</span>
              <span className="text-[11px] text-foreground" style={{ fontWeight: 600 }}>{v}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ThinkingDots() {
  return (
    <div className="flex items-end gap-2.5 mb-4">
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shrink-0">
        <Sparkles className="w-4 h-4 text-white" />
      </div>
      <div className="bg-white border border-border rounded-2xl rounded-tl-sm px-5 py-3.5 flex items-center gap-1.5 shadow-sm">
        {[0, 1, 2].map(i => (
          <motion.div key={i} className="w-2 h-2 rounded-full bg-primary/50"
            animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.2 }} />
        ))}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   CONSTANTS
══════════════════════════════════════════════════════════════ */
const WELCOME: TextMsg = {
  id: "welcome", role: "ai", ts: new Date(), kind: "text",
  text: "Hi! I'm your **AircraftDesk AI**. Ask me anything about your fleet in plain English — I'll understand it, confirm what you mean, and take action.\n\nTry: \"What needs my attention today?\" or \"Show me the status of N67890.\"",
};

const QUICK_PROMPTS = [
  { label: "Fleet status today",      cmd: "What needs my attention today?" },
  { label: "Pending estimates",        cmd: "Show me pending estimates" },
  { label: "Open squawks",             cmd: "Show all open squawks" },
  { label: "Check N67890",             cmd: "Tell me about N67890" },
  { label: "Financial summary",        cmd: "Show financial summary" },
  { label: "Approve all estimates",    cmd: "Approve all estimates" },
];

/* ══════════════════════════════════════════════════════════════
   QUICK ACTION GROUPS (right panel)
══════════════════════════════════════════════════════════════ */
const QUICK_ACTION_GROUPS = [
  {
    title: "Fleet", color: "text-blue-700 bg-blue-50 border-blue-200",
    actions: [
      { label: "Fleet overview today",  cmd: "What needs my attention today?", icon: BarChart3 },
      { label: "Aircraft N67890",       cmd: "Tell me about N67890",           icon: Plane },
      { label: "Aircraft N12345",       cmd: "Tell me about N12345",           icon: Plane },
      { label: "All open squawks",      cmd: "Show all open squawks",          icon: AlertTriangle },
    ],
  },
  {
    title: "Estimates & Work Orders", color: "text-amber-700 bg-amber-50 border-amber-200",
    actions: [
      { label: "Pending estimates",     cmd: "Show me pending estimates",  icon: FileText },
      { label: "Approve all estimates", cmd: "Approve all estimates",      icon: CheckCircle2 },
      { label: "All work orders",       cmd: "Show all work orders",       icon: Wrench },
    ],
  },
  {
    title: "Invoices", color: "text-emerald-700 bg-emerald-50 border-emerald-200",
    actions: [
      { label: "All invoices",          cmd: "Show all invoices",          icon: Receipt },
      { label: "Overdue invoices",      cmd: "Show overdue invoices",      icon: Clock },
      { label: "Financial summary",     cmd: "Show financial summary",     icon: DollarSign },
    ],
  },
];

/* ══════════════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════════════ */
export function OwnerCommandCenter({ showRightPanel = false }: { showRightPanel?: boolean }) {
  const [messages, setMessages] = useState<AiMsg[]>([WELCOME]);
  const [input, setInput]       = useState("");
  const [thinking, setThinking] = useState(false);
  const [ctx, setCtx]           = useState<ConvCtx>({});

  /* Right-panel state */
  const [rightTab, setRightTab]   = useState<"actions" | "history" | "saved">("actions");
  const [savedCmds, setSavedCmds] = useState<string[]>([
    "What needs my attention today?",
    "Show all open squawks",
    "Approve all estimates",
    "Show financial summary",
  ]);
  const [newSaved, setNewSaved]   = useState("");
  const [cmdHistory, setCmdHistory] = useState<{ ts: Date; text: string }[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const feedRef  = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [messages, thinking]);

  function sendMessage(raw: string) {
    const text = raw.trim();
    if (!text || thinking) return;
    setInput("");
    setCmdHistory(h => [{ ts: new Date(), text }, ...h].slice(0, 40));
    const userMsg: TextMsg = { id: uid(), role: "user", ts: new Date(), kind: "text", text };
    setMessages(prev => [...prev, userMsg]);
    setThinking(true);
    const delay = 600 + Math.random() * 700;
    setTimeout(() => {
      const { replies, newCtx } = processInput(text, ctx);
      setCtx(newCtx);
      setMessages(prev => [...prev, ...replies]);
      setThinking(false);
    }, delay);
  }

  function handleConfirm(msgId: string) {
    setMessages(prev => prev.map(m =>
      m.id === msgId && m.kind === "confirm" ? { ...m, state: "confirmed" as const } : m
    ));
    setThinking(true);
    const msg = messages.find(m => m.id === msgId) as ConfirmMsg | undefined;
    if (!msg) return;
    setTimeout(() => {
      const result = msg.payload.execute();
      const resultMsg: ResultMsg = { id: uid(), role: "ai", ts: new Date(), kind: "result", ...result };
      setMessages(prev => [...prev, resultMsg]);
      setThinking(false);
    }, 600 + Math.random() * 400);
  }

  function handleDecline(msgId: string) {
    setMessages(prev => prev.map(m =>
      m.id === msgId && m.kind === "confirm" ? { ...m, state: "declined" as const } : m
    ));
    setMessages(prev => [...prev, aiText("No problem — action cancelled. Is there anything else I can help you with?")]);
  }

  function handleCmd(cmd: string) { sendMessage(cmd); }

  function renderMsg(msg: AiMsg) {
    if (msg.role === "user" && msg.kind === "text") {
      return (
        <motion.div key={msg.id} initial={{ opacity: 0, y: 6, x: 16 }} animate={{ opacity: 1, y: 0, x: 0 }} transition={{ duration: 0.18 }} className="flex justify-end mb-4">
          <div className="bg-primary text-white rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-[70%] text-[13px] shadow-sm leading-relaxed" style={{ fontWeight: 400 }}>
            {msg.text}
          </div>
        </motion.div>
      );
    }
    return (
      <motion.div key={msg.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="flex items-start gap-2.5 mb-4">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
          <Sparkles className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 space-y-2 max-w-[85%]">
          {msg.kind === "text" && (
            <div className="bg-white border border-border rounded-2xl rounded-tl-sm px-4 py-3 text-[13px] text-foreground shadow-sm leading-relaxed">
              {renderText(msg.text)}
            </div>
          )}
          {msg.kind === "entity"  && <EntityCard  msg={msg} onCmd={handleCmd} />}
          {msg.kind === "list"    && <ListCard    msg={msg} onCmd={handleCmd} />}
          {msg.kind === "confirm" && <ConfirmCard msg={msg} onConfirm={() => handleConfirm(msg.id)} onDecline={() => handleDecline(msg.id)} />}
          {msg.kind === "result"  && <ResultCard  msg={msg} />}
        </div>
      </motion.div>
    );
  }

  const showPrompts = messages.length <= 2 && !thinking;
  const pendingCount = ESTIMATES.filter(e => e.status === "Pending Approval").length
    + WORK_ORDERS.filter(w => w.status === "Pending Approval").length;
  const urgentCount = SQUAWKS.filter(s => s.status === "Open" && s.sev === "High").length;

  return (
    <div className="h-full flex overflow-hidden bg-[#f7f8fa]">

      {/* ── Chat column ── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Header */}
        <div className="shrink-0 bg-white border-b border-border px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-sm">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-[15px] text-foreground" style={{ fontWeight: 700 }}>AircraftDesk AI</h1>
                  <span className="flex items-center gap-1 text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full" style={{ fontWeight: 600 }}>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Online
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground">Ask anything in plain English — I understand context and confirm before acting</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {[
                { icon: Plane,         label: "Aircraft",  value: AIRCRAFT.length,  color: "text-primary" },
                { icon: FileText,      label: "Pending",   value: pendingCount,     color: "text-amber-600" },
                { icon: AlertTriangle, label: "Urgent",    value: urgentCount,      color: "text-red-600" },
              ].map(s => (
                <div key={s.label} className="text-center bg-white border border-border rounded-xl px-4 py-2 min-w-[64px]">
                  <div className={`text-[20px] tracking-tight ${s.color}`} style={{ fontWeight: 800 }}>{s.value}</div>
                  <div className="text-[9px] text-muted-foreground uppercase tracking-wide" style={{ fontWeight: 600 }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Chat feed */}
        <div ref={feedRef} className="flex-1 overflow-y-auto px-6 py-6">
          <div className="max-w-2xl mx-auto">
            {messages.map(renderMsg)}
            {thinking && <ThinkingDots />}

            {showPrompts && (
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="ml-10 mt-1">
                <div className="text-[11px] text-muted-foreground mb-2" style={{ fontWeight: 500 }}>Quick prompts to get started:</div>
                <div className="flex flex-wrap gap-2">
                  {QUICK_PROMPTS.map(p => (
                    <button key={p.cmd} onClick={() => handleCmd(p.cmd)}
                      className="text-[12px] px-3 py-1.5 bg-white border border-border rounded-xl text-foreground hover:border-primary/40 hover:bg-primary/5 transition-all" style={{ fontWeight: 500 }}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
            <div className="h-2" />
          </div>
        </div>

        {/* Input bar */}
        <div className="shrink-0 bg-white border-t border-border px-6 py-4">
          <div className="max-w-2xl mx-auto">
            <div className={`flex items-center gap-3 rounded-2xl px-4 py-3 bg-white border transition-all shadow-sm ${
              thinking ? "border-primary/30 shadow-primary/5" : "border-border focus-within:border-primary/50 focus-within:shadow-md"
            }`}>
              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                {thinking
                  ? <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.8, repeat: Infinity, ease: "linear" }}>
                      <Sparkles className="w-3.5 h-3.5 text-primary" />
                    </motion.div>
                  : <Sparkles className="w-3.5 h-3.5 text-primary" />
                }
              </div>
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
                disabled={thinking}
                placeholder={thinking ? "AircraftDesk AI is thinking…" : "Ask anything — e.g. \"Open my estimate for Steve Williams\""}
                className="flex-1 bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground/45 outline-none"
                autoFocus
              />
              {input && !thinking && (
                <button onClick={() => setInput("")} className="text-muted-foreground hover:text-foreground transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              <button onClick={() => sendMessage(input)} disabled={!input.trim() || thinking}
                className="w-8 h-8 rounded-full bg-primary flex items-center justify-center hover:bg-primary/90 disabled:opacity-40 transition-all shrink-0">
                <Send className="w-3.5 h-3.5 text-white" />
              </button>
            </div>
            <p className="text-center text-[10px] text-muted-foreground/50 mt-2">
              AircraftDesk AI confirms before taking any action · Always verify critical changes
            </p>
          </div>
        </div>
      </div>

      {/* ── Right panel ── */}
      {showRightPanel && (
        <div className="w-[272px] shrink-0 border-l border-border bg-white flex flex-col">
          {/* Tab bar */}
          <div className="flex shrink-0 border-b border-border">
            {([
              { id: "actions" as const, label: "Actions",  icon: Zap     },
              { id: "history" as const, label: "History",  icon: History  },
              { id: "saved"   as const, label: "Saved",    icon: Star     },
            ]).map(t => (
              <button key={t.id} onClick={() => setRightTab(t.id)}
                className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[10px] transition-colors border-b-2 ${
                  rightTab === t.id
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
                style={{ fontWeight: rightTab === t.id ? 700 : 500 }}>
                <t.icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            ))}
          </div>

          {/* Actions */}
          {rightTab === "actions" && (
            <div className="flex-1 overflow-y-auto p-3 space-y-4">
              {pendingCount > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <div className="text-[11px] text-amber-800 mb-2" style={{ fontWeight: 700 }}>
                    ⚡ {pendingCount} item{pendingCount !== 1 ? "s" : ""} need your attention
                  </div>
                  {ESTIMATES.filter(e => e.status === "Pending Approval").map(e => (
                    <button key={e.id} onClick={() => handleCmd(`approve estimate ${e.id}`)}
                      className="w-full text-left py-1.5 text-[11px] text-amber-700 hover:text-amber-900 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3 h-3 shrink-0" />
                      Approve {e.id} — ${e.amount.toLocaleString()}
                    </button>
                  ))}
                </div>
              )}
              {QUICK_ACTION_GROUPS.map(group => (
                <div key={group.title}>
                  <div className={`text-[9px] uppercase tracking-widest px-1 mb-2 ${group.color.split(" ")[0]}`} style={{ fontWeight: 700 }}>
                    {group.title}
                  </div>
                  <div className="space-y-1">
                    {group.actions.map(a => (
                      <button key={a.cmd} onClick={() => handleCmd(a.cmd)}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border text-left hover:shadow-sm transition-all ${group.color}`}>
                        <a.icon className="w-3.5 h-3.5 shrink-0" />
                        <span className="flex-1 text-[11px]" style={{ fontWeight: 500 }}>{a.label}</span>
                        <ChevronRight className="w-3 h-3 opacity-40" />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* History */}
          {rightTab === "history" && (
            <div className="flex-1 overflow-y-auto p-3">
              {cmdHistory.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-36 text-muted-foreground">
                  <History className="w-8 h-8 opacity-20 mb-2" />
                  <span className="text-[12px]">No history yet</span>
                  <span className="text-[11px] opacity-60 mt-0.5">Commands appear here</span>
                </div>
              ) : (
                <div className="space-y-0.5">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-widest mb-2 px-1" style={{ fontWeight: 600 }}>
                    Recent commands
                  </div>
                  {cmdHistory.map((h, i) => (
                    <button key={i} onClick={() => handleCmd(h.text)}
                      className="w-full text-left px-3 py-2 rounded-xl hover:bg-muted/40 transition-colors group">
                      <div className="text-[12px] text-foreground truncate" style={{ fontWeight: 500 }}>{h.text}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {h.ts.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Saved */}
          {rightTab === "saved" && (
            <div className="flex-1 overflow-y-auto flex flex-col p-3 gap-3">
              <div className="flex items-center gap-2">
                <input
                  value={newSaved}
                  onChange={e => setNewSaved(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && newSaved.trim()) {
                      setSavedCmds(s => [newSaved.trim(), ...s]);
                      setNewSaved("");
                    }
                  }}
                  placeholder="Pin a command…"
                  className="flex-1 text-[12px] border border-border rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-primary/20"
                />
                <button
                  onClick={() => { if (newSaved.trim()) { setSavedCmds(s => [newSaved.trim(), ...s]); setNewSaved(""); } }}
                  className="w-8 h-8 rounded-xl bg-primary text-white flex items-center justify-center hover:bg-primary/90 disabled:opacity-40"
                  disabled={!newSaved.trim()}>
                  <Pin className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="space-y-1">
                {savedCmds.map((cmd, i) => (
                  <div key={i} className="flex items-center gap-1 group">
                    <button onClick={() => handleCmd(cmd)}
                      className="flex-1 text-left px-3 py-2 rounded-xl hover:bg-muted/40 transition-colors text-[12px] text-foreground" style={{ fontWeight: 500 }}>
                      {cmd}
                    </button>
                    <button onClick={() => setSavedCmds(s => s.filter((_, j) => j !== i))}
                      className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-50 rounded-lg transition-all">
                      <Trash2 className="w-3 h-3 text-red-400" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
