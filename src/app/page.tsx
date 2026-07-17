import { redirect } from "next/navigation"
import { getDefaultModuleRedirectPath } from "@/lib/modules"

export default function HomePage() {
  redirect(getDefaultModuleRedirectPath() ?? "/dashboard")
}
