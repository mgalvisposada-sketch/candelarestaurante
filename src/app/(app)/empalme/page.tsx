import { redirect } from "next/navigation";

/** Redirección legacy: Empalme → Checklist inicial. */
export default function EmpalmeRedirectPage() {
  redirect("/checklist-inicial");
}
