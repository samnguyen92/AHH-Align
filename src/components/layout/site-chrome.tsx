"use client"

import { useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Navbar } from "@/components/site/kit"
import { SiteFooter } from "@/components/site/footer"
import { supabase } from "@/services/supabase-client"

export function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/")
  // Design previews (src/app/preview) render full-bleed with their own nav.
  const isPreview = pathname.startsWith("/preview/")

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event) => {
      if (event === 'PASSWORD_RECOVERY') {
        router.push('/auth/reset-password')
      }
    })

    return () => subscription.unsubscribe()
  }, [router])

  if (isAdmin || isPreview) {
    return <>{children}</>
  }

  // One chrome for every public page (design option A): the floating rounded menu, then the dark footer tile
  // with the quick-search pill that rises once the visitor scrolls.
  return (
    <div className="site flex min-h-full flex-1 flex-col bg-white">
      <Navbar />
      <main className="flex-1">{children}</main>
      <div className="mt-6 md:mt-10">
        <SiteFooter />
      </div>
    </div>
  )
}
