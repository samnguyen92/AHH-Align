"use client"

import { useState } from "react"
import { Sidebar } from "./sidebar"
import { DashboardHome } from "./views/dashboard-home"
import { ClinicsManagement } from "./views/clinics-management"
import { ContentCMS } from "./views/content-cms"
import { ClaimRequests } from "./views/claim-requests"

export type ViewType = "dashboard" | "clinics" | "articles" | "claims"

export function Dashboard() {
  const [activeView, setActiveView] = useState<ViewType>("dashboard")

  const renderView = () => {
    switch (activeView) {
      case "dashboard":
        return <DashboardHome onNavigate={setActiveView} />
      case "clinics":
        return <ClinicsManagement />
      case "articles":
        return <ContentCMS />
      case "claims":
        return <ClaimRequests />
      default:
        return <DashboardHome onNavigate={setActiveView} />
    }
  }

  return (
    <div className="flex h-screen w-full bg-background">
      <Sidebar activeView={activeView} onViewChange={setActiveView} />
      <main className="ml-60 flex-1 overflow-auto p-6">
        {renderView()}
      </main>
    </div>
  )
}
