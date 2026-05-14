import type { Metadata } from "next"
import { AdminSidebar } from "@/components/admin/sidebar"
import { requireAdminUser } from "@/services/auth-service"

export const metadata: Metadata = {
  title: "Admin Dashboard | Asian Health Hub",
  robots: {
    index: false,
    follow: false,
  },
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await requireAdminUser()

  return (
    <div className="min-h-screen w-full bg-background">
      <AdminSidebar isSuperAdmin={user.role === "superadmin"} />
      <div className="ml-60 min-h-screen">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/95 px-6 backdrop-blur">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Admin Console</p>
            <h1 className="text-lg font-semibold text-foreground">Asian Health Hub Operations</h1>
          </div>
          <span className="inline-flex items-center rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
            Admin: {user.email ?? "System Healthy"}
          </span>
        </header>
        <main className="p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
