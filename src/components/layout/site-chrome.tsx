"use client"

import { usePathname } from "next/navigation"
import { Header } from "@/components/layout/header"
import { BottomCTA } from "@/components/layout/bottom-cta"
import { Footer } from "@/components/layout/footer"

export function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/")
  const isHome = pathname === "/"
  const isInsightDetail = /^\/insights\/[^/]+/.test(pathname)

  if (isAdmin) {
    return <>{children}</>
  }

  return (
    <>
      <Header variant={isHome ? "home" : isInsightDetail ? "overlay" : "default"} />
      <main className="flex-1">{children}</main>
      <BottomCTA />
      <Footer />
    </>
  )
}
