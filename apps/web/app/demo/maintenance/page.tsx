import { redirect } from "next/navigation";

export default function DemoMaintenancePage() {
  redirect("/demo/mechanic?tab=workorders");
}
