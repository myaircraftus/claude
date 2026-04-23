import {
  Plane, Wrench, FileText, Receipt, BookOpen, Users, User, LayoutDashboard,
  AlertTriangle, Package,
} from "lucide-react";
import type { MechanicSection, SquawkRecord } from "./types";

export const EMPTY_SQUAWK_QUEUE: SquawkRecord[] = [];
export const EST_THREADS: Record<string, any[]> = {};

export const NAV_ITEMS: { id: MechanicSection; label: string; icon: any; badge?: number }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "aircraft", label: "Aircraft", icon: Plane, badge: 3 },
  { id: "squawks", label: "Squawks", icon: AlertTriangle, badge: 4 },
  { id: "estimates", label: "Estimates", icon: FileText, badge: 2 },
  { id: "workorders", label: "Work Orders", icon: Wrench, badge: 2 },
  { id: "invoices", label: "Invoices", icon: Receipt, badge: 3 },
  { id: "logbook", label: "Logbook Entries", icon: BookOpen, badge: 3 },
  { id: "parts", label: "Parts", icon: Package },
  { id: "customers", label: "Customers", icon: Users },
  { id: "team", label: "Team", icon: User },
];
