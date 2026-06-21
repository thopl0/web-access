import { redirect } from "next/navigation";

// `/dashboard/sites` has no page of its own (sites live at `/dashboard` and `/dashboard/sites/new`).
// Send any stray visit back to the portfolio overview rather than 404.
export default function SitesIndexPage() {
  redirect("/dashboard");
}
