import { Dashboard } from "@/components/redesign/Dashboard";

export const metadata = { title: "Owner Demo · MyAircraft" };

export default function DemoOwnerPage() {
  // The demo/owner route uses the same Dashboard component as the mechanic
  // shell — pass persona="owner" so the page heading + subhead is framed
  // for an aircraft owner (not the Shop Command Center copy).
  return <Dashboard persona="owner" />;
}
