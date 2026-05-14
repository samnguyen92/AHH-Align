"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  Building2,
  FileText,
  ClipboardList,
  Settings,
  ChevronLeft,
  Bot,
  Users,
} from "lucide-react"

const baseNavigation: { href: string; name: string; icon: React.ElementType }[] = [
  { href: "/admin", name: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/clinics", name: "Clinics Management", icon: Building2 },
  { href: "/admin/articles", name: "Content CMS", icon: FileText },
  { href: "/admin/claims", name: "Claim Requests", icon: ClipboardList },
  { href: "/admin/pipeline", name: "AI Pipeline", icon: Bot },
]

const superAdminNavigation: { href: string; name: string; icon: React.ElementType }[] = [
  { href: "/admin/users", name: "User", icon: Users },
]

function isActivePath(pathname: string, href: string) {
  if (href === "/admin") {
    return pathname === "/admin"
  }

  return pathname === href || pathname.startsWith(`${href}/`)
}

export function AdminSidebar({ isSuperAdmin = false }: { isSuperAdmin?: boolean }) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const navigation = isSuperAdmin
    ? [...baseNavigation, ...superAdminNavigation]
    : baseNavigation

  return (
    <aside className={cn(
      "fixed left-0 top-0 z-40 h-screen bg-card border-r border-border transition-all duration-300",
      collapsed ? "w-20" : "w-60"
    )}>
      <div className="flex h-full flex-col">
        {/* Logo */}
        <div className="flex h-16 items-center gap-3 px-4">
          <div className="relative flex h-10 w-10 shrink-0 items-center justify-center">
            <svg viewBox="0 0 40 40" className="h-10 w-10">
              {/* Outer rounded square with teal background */}
              <rect x="0" y="0" width="40" height="40" rx="10" fill="#14B8A6" />
              {/* White medical cross */}
              <rect x="17" y="8" width="6" height="24" rx="1" fill="white" />
              <rect x="8" y="17" width="24" height="6" rx="1" fill="white" />
              {/* Green leaf accent */}
              <ellipse cx="30" cy="30" rx="6" ry="4" fill="#22C55E" transform="rotate(-45 30 30)" />
            </svg>
          </div>
          {!collapsed && (
            <span className="text-lg font-semibold text-foreground">Asian Health Hub</span>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-3 py-4">
          {navigation.map((item) => {
            const isActive = isActivePath(pathname, item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-md"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <item.icon className={cn("h-5 w-5 shrink-0", isActive && "text-primary-foreground")} />
                {!collapsed && <span>{item.name}</span>}
              </Link>
            )
          })}
        </nav>

        {/* Settings */}
        <div className="border-t border-border px-3 py-4">
          <button
            className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <Settings className="h-5 w-5 shrink-0" />
            {!collapsed && <span>Settings</span>}
          </button>
        </div>

        {/* Collapse Button */}
        <div className="border-t border-border p-3">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card hover:bg-muted transition-colors mx-auto"
          >
            <ChevronLeft className={cn(
              "h-5 w-5 text-muted-foreground transition-transform duration-300",
              collapsed && "rotate-180"
            )} />
          </button>
        </div>
      </div>
    </aside>
  )
}
