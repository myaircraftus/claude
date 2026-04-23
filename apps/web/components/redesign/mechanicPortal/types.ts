import type { FaaLookupResult } from "../faaRegistryService";
import type { LaborLine, PartsLine } from "../workspace/DataStore";

export type FoundFaaResult = Extract<FaaLookupResult, { found: true }>;

export type MechanicInvoice = {
  id: string;
  number: string;
  aircraft: string;
  customer: string;
  company?: string;
  amount: number;
  tax: number;
  total: number;
  status: string;
  paymentStatus: string;
  issuedDate?: string;
  dueDate?: string;
  daysOut?: number;
  linkedWO?: string;
  email?: string;
  phone?: string;
  address?: string;
  laborLines: LaborLine[];
  partsLines: PartsLine[];
};

export type SquawkRecord = {
  id: string;
  tail: string;
  model: string;
  customer: string;
  title: string;
  desc: string;
  category: string;
  severity: "Low" | "Medium" | "High" | "Critical";
  date: string;
  status: string;
  grounded?: boolean;
};

export type MechanicSection =
  | "dashboard"
  | "aircraft"
  | "squawks"
  | "estimates"
  | "workorders"
  | "invoices"
  | "logbook"
  | "customers"
  | "team"
  | "parts";

export interface GeneratedEstimate {
  laborLines: { id: string; desc: string; hours: number; rate: number; total: number }[];
  partsLines: { id: string; pn: string; desc: string; qty: number; price: number; total: number }[];
  assumptions: string;
  total: number;
}
