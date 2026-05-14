"use client"

import { Building2, ClipboardList, FileText, TrendingUp, Pencil, Trash2, Bot, ArrowRight, ExternalLink } from "lucide-react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import type { AdminOverviewData } from "@/services/admin-service"

const agents = [
  { name: "NPI Seeding", status: "Running", health: "Healthy / Running", icon: "seed" },
  { name: "Web Scraper", status: "Running", health: "Healthy / Running", icon: "globe" },
]

const logs = [
  { time: "12:45:21", tag: "SEEDER", message: "Seeding NPI batch 7821...", color: "text-blue-400" },
  { time: "12:45:18", tag: "SEEDER", message: "Successfully seeded 258 NPIs", color: "text-blue-400" },
  { time: "12:45:12", tag: "SCRAPER", message: "Scraping clinic page 125/500...", color: "text-green-400" },
  { time: "12:45:08", tag: "SCRAPER", message: "Extracted 23 records", color: "text-green-400" },
  { time: "12:45:03", tag: "SYNC", message: "Syncing data to database...", color: "text-yellow-400" },
  { time: "12:44:59", tag: "SYNC", message: "Synced 120 records", color: "text-yellow-400" },
  { time: "12:44:55", tag: "INDEXER", message: "Indexing documents batch 332...", color: "text-purple-400" },
  { time: "12:44:51", tag: "INDEXER", message: "Indexed 198 documents", color: "text-purple-400" },
  { time: "12:44:47", tag: "SCRAPER", message: "Scraping source: medicalboard.go.kr", color: "text-green-400" },
  { time: "12:44:42", tag: "SEEDER", message: "Queue size: 1,250", color: "text-blue-400" },
  { time: "12:44:38", tag: "SYSTEM", message: "All systems operational", color: "text-cyan-400" },
]

function getStatusBadge(status: string) {
  switch (status) {
    case "Active":
      return <span className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700">Active</span>
    case "Verified":
      return <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">Verified</span>
    case "Pending Review":
      return <span className="inline-flex items-center rounded-full bg-orange-50 px-2.5 py-0.5 text-xs font-medium text-orange-600">Pending Review</span>
    case "Draft":
      return <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">Draft</span>
    default:
      return <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">{status}</span>
  }
}

export function DashboardHome({ data }: { data: AdminOverviewData }) {
  const stats = [
    {
      title: "Total Clinics",
      value: data.totalClinics.toLocaleString(),
      subtitle: "All registered clinics",
      icon: Building2,
      iconBg: "bg-blue-50",
      iconColor: "text-blue-600",
    },
    {
      title: "Pending Claims",
      value: data.pendingClaims.toLocaleString(),
      subtitle: "Awaiting review",
      icon: ClipboardList,
      iconBg: "bg-orange-50",
      iconColor: "text-orange-500",
    },
    {
      title: "Draft Articles",
      value: data.draftArticles.toLocaleString(),
      subtitle: "In progress",
      icon: FileText,
      iconBg: "bg-purple-50",
      iconColor: "text-purple-600",
    },
  ]

  return (
    <div className="flex gap-6">
      {/* Left Content Area */}
      <div className="flex-1 space-y-6">
        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          {stats.map((stat) => (
            <Card key={stat.title} className="border border-border bg-card shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${stat.iconBg}`}>
                      <stat.icon className={`h-6 w-6 ${stat.iconColor}`} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">{stat.title}</p>
                      <p className="text-3xl font-bold text-primary">{stat.value}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{stat.subtitle}</p>
                    </div>
                  </div>
                  <TrendingUp className="h-5 w-5 text-muted-foreground/50" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Latest Clinics Table */}
        <Card className="border border-border bg-card shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-4">
            <CardTitle className="text-lg font-semibold text-foreground">Latest Clinics</CardTitle>
            <Button
              render={
                <Link href="/admin/clinics" />
              }
              variant="ghost"
              className="text-primary hover:text-primary/80 hover:bg-primary/5 font-medium"
            >
              View all clinics <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">NPI</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Facility Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Specialty</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.latestClinics.map((clinic) => (
                    <tr key={clinic.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-6 py-4 text-sm text-muted-foreground font-mono">{clinic.npi}</td>
                      <td className="px-6 py-4 text-sm font-medium text-foreground">{clinic.name}</td>
                      <td className="px-6 py-4 text-sm text-muted-foreground">{clinic.specialty}</td>
                      <td className="px-6 py-4">{getStatusBadge(clinic.status)}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <button className="flex items-center gap-1 text-sm text-primary hover:text-primary/80 transition-colors">
                            <Pencil className="h-4 w-4" />
                            Edit
                          </button>
                          <button className="flex items-center gap-1 text-sm text-destructive hover:text-destructive/80 transition-colors">
                            <Trash2 className="h-4 w-4" />
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Pagination */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-border">
              <p className="text-sm text-muted-foreground">Showing {data.latestClinics.length} of {data.totalClinics.toLocaleString()} clinics</p>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" className="h-8 w-8 p-0" disabled>
                  <span className="sr-only">Previous</span>
                  &lt;
                </Button>
                <Button variant="default" size="sm" className="h-8 w-8 p-0">1</Button>
                <Button variant="outline" size="sm" className="h-8 w-8 p-0">2</Button>
                <Button variant="outline" size="sm" className="h-8 w-8 p-0">3</Button>
                <Button variant="outline" size="sm" className="h-8 w-8 p-0">4</Button>
                <Button variant="outline" size="sm" className="h-8 w-8 p-0">5</Button>
                <span className="px-2 text-muted-foreground">...</span>
                <Button variant="outline" size="sm" className="h-8 w-8 p-0">1524</Button>
                <Button variant="outline" size="sm" className="h-8 w-8 p-0">
                  <span className="sr-only">Next</span>
                  &gt;
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Right Sidebar - OpenClaw Status */}
      <div className="w-80 shrink-0">
        <Card className="border border-border bg-card shadow-sm sticky top-6">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50">
                  <Bot className="h-5 w-5 text-teal-600" />
                </div>
                <CardTitle className="text-lg font-semibold text-foreground">OpenClaw Status</CardTitle>
              </div>
              <span className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700">
                System Healthy
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Agent Status */}
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-3">Agent Status</h4>
              <div className="space-y-3">
                {agents.map((agent) => (
                  <div key={agent.name} className="flex items-center justify-between p-3 rounded-xl bg-muted/50">
                    <div className="flex items-center gap-3">
                      <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-100">
                        {agent.icon === "seed" ? (
                          <svg className="h-5 w-5 text-teal-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M12 2v6m0 0c-3 0-6 3-6 6s3 6 6 6 6-3 6-6-3-6-6-6z" />
                          </svg>
                        ) : (
                          <svg className="h-5 w-5 text-teal-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" />
                            <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                          </svg>
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{agent.name}</p>
                        <p className="text-xs text-green-600">{agent.health}</p>
                      </div>
                    </div>
                    <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                      {agent.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Live Activity Logs */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium text-muted-foreground">Live Activity Logs</h4>
                <span className="flex items-center gap-1.5 text-xs text-green-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                  Live
                </span>
              </div>
              <div className="rounded-xl bg-slate-900 p-3 font-mono text-xs max-h-72 overflow-y-auto">
                {logs.map((log, index) => (
                  <div key={index} className="flex gap-2 py-1">
                    <span className="text-slate-500">{log.time}</span>
                    <span className={log.color}>[{log.tag}]</span>
                    <span className="text-slate-300">{log.message}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* View All Logs Button */}
            <Button variant="outline" className="w-full justify-between">
              View all logs
              <ExternalLink className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
