import {
  Hash, Mail, Eye, Lock, Bell, User, MessageSquare, CheckCircle,
} from "lucide-react";

export const sevColor = (s: "Low" | "Medium" | "High" | "Critical") => ({ Low: "bg-slate-100 text-slate-500", Medium: "bg-slate-100 text-slate-600", High: "bg-slate-800 text-white", Critical: "bg-slate-900 text-white" }[s]);

export const threadIcon = (type: string) => {
  const map: Record<string, any> = { system: Hash, email: Mail, tracking: Eye, internal: Lock, reminder: Bell, customer: User, reply: MessageSquare, approval: CheckCircle };
  const Icon = map[type] || Hash;
  return Icon;
};

export const threadColor = (type: string) => ({
  system:   "bg-slate-100 text-slate-500",
  email:    "bg-slate-100 text-slate-600",
  tracking: "bg-slate-100 text-slate-500",
  internal: "bg-slate-100 text-slate-600",
  reminder: "bg-slate-100 text-slate-500",
  customer: "bg-[#2563EB]/10 text-[#2563EB]",
  reply:    "bg-slate-100 text-slate-600",
  approval: "bg-slate-800 text-white",
}[type] || "bg-slate-100 text-slate-500");

export const invoiceStatusColor = (s: string) => ({ Draft: "bg-slate-100 text-slate-600", Sent: "bg-slate-100 text-slate-700", Paid: "bg-slate-800 text-white", Overdue: "bg-slate-200 text-slate-700" }[s] || "bg-slate-100 text-slate-600");

export const normalizeCustomerIdentity = (...values: Array<string | null | undefined>) =>
  values
    .map((value) =>
      (value ?? "")
        .toLowerCase()
        .replace(/\b(inc|llc|corp|corporation|company|co)\b/g, " ")
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
    )
    .filter(Boolean)
    .join("|");
