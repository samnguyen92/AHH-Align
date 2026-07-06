"use client"

import { useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Header } from "@/components/layout/header"
import { BottomCTA } from "@/components/layout/bottom-cta"
import { Footer } from "@/components/layout/footer"
import { supabase } from "@/services/supabase-client"

export function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/")
  const isHome = pathname === "/"
  const isAbout = pathname === "/about"
  const isPulse = pathname === "/pulse" || pathname.startsWith("/pulse/")
  const isSearch = pathname === "/search"
  const isInsightsIndex = pathname === "/insights"
  const isInsightDetail = /^\/insights\/[^/]+/.test(pathname)
  const isClinicDetail = /^\/clinics\/[^/]+/.test(pathname)
  const isClaim = pathname === "/claim" || pathname.startsWith("/claim/")

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event) => {
      if (event === 'PASSWORD_RECOVERY') {
        router.push('/auth/reset-password')
      }
    })

    return () => subscription.unsubscribe()
  }, [router])

  if (isAdmin) {
    return <>{children}</>
  }

  return (
    <>
      <Header variant={isHome || isAbout || isPulse || isSearch || isInsightsIndex || isClinicDetail || isClaim ? "home" : isInsightDetail ? "overlay" : "default"} />
      <main className="flex-1">{children}</main>
      <BottomCTA />
      <Footer />
    </>
  )
}
