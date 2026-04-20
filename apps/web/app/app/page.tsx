import { redirect } from "next/navigation";

export default function AppEntryRedirect() {
  redirect("/dashboard");
}
