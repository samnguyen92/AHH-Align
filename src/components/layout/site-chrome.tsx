"use client"

import { usePathname } from "next/navigation"
import { Header } from "@/components/layout/header"
import { BottomCTA } from "@/components/layout/bottom-cta"
import { Footer } from "@/components/layout/footer"

export function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/")
  const isHome = pathname === "/"
  const isAbout = pathname === "/about"
  const isPulse = pathname === "/pulse" || pathname.startsWith("/pulse/")
  const isSearch = pathname === "/search"
  const isInsightsIndex = pathname === "/insights"
  const isInsightDetail = /^\/insights\/[^/]+/.test(pathname)
  const isClinicDetail = /^\/clinics\/[^/]+/.test(pathname)

  if (isAdmin) {
    return <>{children}</>
  }

  return (
    <>
      <Header variant={isHome || isAbout || isPulse || isSearch || isInsightsIndex || isClinicDetail ? "home" : isInsightDetail ? "overlay" : "default"} />
      <main className="flex-1">{children}</main>
      <BottomCTA />
      <Footer />
    </>
  )
}
