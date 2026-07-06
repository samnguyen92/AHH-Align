"use client"

import { useState, useEffect } from "react"
import { BarChart3, Search, Eye, MousePointerClick, HelpCircle, Flame, RefreshCw, LogIn } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { supabase } from "@/services/supabase-client"

interface AnalyticsData {
  counts: {
    page_view: number
    search_query: number
    clinic_click: number
    claim_start: number
  }
  popularSearches: { query: string; count: number }[]
  popularClinics: { id: string; name: string; count: number }[]
  popularPaths: { path: string; count: number }[]
  dailyTrend: { date: string; count: number }[]
  recentEvents: any[]
}

export default function AnalyticsDashboardPage() {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [range, setRange] = useState("7d")

  const fetchAnalytics = async (selectedRange: string = "7d") => {
    setError(null)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token

      const headers: Record<string, string> = {}
      if (token) {
        headers["Authorization"] = `Bearer ${token}`
      }

      const res = await fetch(`/api/admin/analytics?range=${selectedRange}`, { headers })
      if (!res.ok) {
        if (res.status === 403) {
          throw new Error("You must be logged in as an admin to view this page.")
        }
        throw new Error("Failed to fetch analytics statistics.")
      }

      const result = await res.json()
      setData(result)
    } catch (err: any) {
      setError(err.message || "An error occurred while loading analytics.")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchAnalytics(range)
  }, [])

  const handleRefresh = () => {
    setRefreshing(true)
    fetchAnalytics(range)
  }

  const handleRangeChange = (newRange: string) => {
    setRefreshing(true)
    setRange(newRange)
    fetchAnalytics(newRange)
  }

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <RefreshCw className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading analytics dashboard...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Card className="max-w-md border-destructive/20 bg-destructive/5">
          <CardContent className="p-6 text-center space-y-4">
            <h3 className="text-lg font-bold text-destructive">Unauthorized Access</h3>
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button onClick={() => window.location.reload()} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
              Retry Load
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const stats = [
    {
      title: "Page Views",
      value: data?.counts.page_view ?? 0,
      icon: Eye,
      color: "text-blue-500",
      bg: "bg-blue-50",
    },
    {
      title: "Searches Logged",
      value: data?.counts.search_query ?? 0,
      icon: Search,
      color: "text-purple-500",
      bg: "bg-purple-50",
    },
    {
      title: "Clinic Clicks",
      value: data?.counts.clinic_click ?? 0,
      icon: MousePointerClick,
      color: "text-teal-500",
      bg: "bg-teal-50",
    },
    {
      title: "Claims Initiated",
      value: data?.counts.claim_start ?? 0,
      icon: HelpCircle,
      color: "text-orange-500",
      bg: "bg-orange-50",
    },
  ]

  return (
    <div className="space-y-6">
      {/* Title & Refresh */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Lightweight Analytics</h1>
          <p className="text-sm text-muted-foreground">Recent search, page views, and clinic click events</p>
        </div>
        <Button 
          onClick={handleRefresh} 
          disabled={refreshing} 
          variant="outline" 
          className="border-border bg-card hover:bg-muted/50"
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title} className="border border-border bg-card shadow-sm">
            <CardContent className="p-5 flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{stat.title}</p>
                <p className="text-2xl font-bold text-foreground">{stat.value.toLocaleString()}</p>
              </div>
              <div className={`h-10 w-10 rounded-xl ${stat.bg} flex items-center justify-center shrink-0`}>
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Page Views Trend Chart */}
      <Card className="border border-border bg-card shadow-sm">
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-6 gap-4">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-md font-semibold text-foreground">Page Views Trend</CardTitle>
              <p className="text-xs text-muted-foreground">Historical traffic view count</p>
            </div>
          </div>
          {/* Time range filters */}
          <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/30 p-1 shrink-0">
            {[
              { id: "7d", label: "7 Days" },
              { id: "30d", label: "30 Days" },
              { id: "1y", label: "1 Year" },
            ].map((opt) => (
              <button
                key={opt.id}
                onClick={() => handleRangeChange(opt.id)}
                className={`rounded-md px-3 py-1 text-xs font-semibold transition-all duration-200 cursor-pointer ${
                  range === opt.id
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="p-6 pt-0">
          {(() => {
            const dailyTrend = data?.dailyTrend || [];
            const maxVal = Math.max(...dailyTrend.map((d: { count: number }) => d.count), 1);
            const gridLines = [0, 0.25, 0.5, 0.75, 1];

            // Spacing parameters
            const chartWidth = 700;
            const chartHeight = 180;
            const paddingLeft = 50;
            const paddingRight = 30;
            const paddingTop = 20;
            const paddingBottom = 40;

            const graphWidth = chartWidth - paddingLeft - paddingRight;
            const graphHeight = chartHeight - paddingTop - paddingBottom;

            const barWidth = dailyTrend.length > 20 ? 12 : (dailyTrend.length > 10 ? 24 : 38);
            const colWidth = graphWidth / dailyTrend.length;

            return (
              <div className="w-full">
                <div className={`relative h-64 w-full transition-opacity duration-200 ${refreshing ? 'opacity-50' : 'opacity-100'}`}>
                  <svg className="w-full h-full" viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#14b8a6" /> {/* teal-500 */}
                        <stop offset="100%" stopColor="#3b82f6" /> {/* blue-500 */}
                      </linearGradient>
                    </defs>

                    {/* Grid lines */}
                    {gridLines.map((ratio, idx) => {
                      const y = paddingTop + (1 - ratio) * graphHeight;
                      const label = Math.round(ratio * maxVal);
                      return (
                        <g key={idx} className="opacity-30">
                          <line x1={paddingLeft} y1={y} x2={chartWidth - paddingRight} y2={y} stroke="currentColor" className="text-border" strokeWidth="1" strokeDasharray="3 3" />
                          <text x="15" y={y + 4} className="text-[10px] fill-muted-foreground font-semibold text-right" textAnchor="start">
                            {label}
                          </text>
                        </g>
                      );
                    })}

                    {/* Bars */}
                    {dailyTrend.map((item: { date: string; count: number }, index: number) => {
                      const x = paddingLeft + index * colWidth + (colWidth - barWidth) / 2;
                      const barHeight = (item.count / maxVal) * graphHeight;
                      const y = chartHeight - paddingBottom - barHeight;

                      const showLabel = dailyTrend.length > 20 ? (index % 5 === 0 || index === dailyTrend.length - 1) : true;

                      return (
                        <g key={index} className="group">
                          {/* Hover highlight background column */}
                          <rect
                            x={paddingLeft + index * colWidth}
                            y={paddingTop}
                            width={colWidth}
                            height={graphHeight}
                            className="fill-muted/20 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                          />
                          {/* Interactive Bar */}
                          <rect
                            x={x}
                            y={y}
                            width={barWidth}
                            height={Math.max(barHeight, 2)}
                            rx="3"
                            fill="url(#barGradient)"
                            className="opacity-90 hover:opacity-100 transition-all duration-200 cursor-pointer"
                          />
                          {/* Value label on top of bar on hover */}
                          <text
                            x={x + barWidth / 2}
                            y={y - 6}
                            textAnchor="middle"
                            className="text-[10px] font-bold fill-foreground opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                          >
                            {item.count}
                          </text>
                          {/* X Axis Date Label */}
                          {showLabel && (
                            <text
                              x={x + barWidth / 2}
                              y={chartHeight - 15}
                              textAnchor="middle"
                              className="text-[10px] font-semibold fill-muted-foreground"
                            >
                              {item.date}
                            </text>
                          )}
                        </g>
                      );
                    })}

                    {/* Bottom axis line */}
                    <line x1={paddingLeft} y1={chartHeight - paddingBottom} x2={chartWidth - paddingRight} y2={chartHeight - paddingBottom} stroke="currentColor" className="text-border" strokeWidth="1.5" />
                  </svg>
                </div>
              </div>
            );
          })()}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Aggregations */}
        <div className="lg:col-span-2 space-y-6">
          {/* Top Searches */}
          <Card className="border border-border bg-card shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-md font-semibold text-foreground flex items-center gap-2">
                <Search className="h-4 w-4 text-primary" /> Popular Search Queries
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/20 text-left text-xs font-semibold text-muted-foreground">
                      <th className="px-5 py-3">Search Query</th>
                      <th className="px-5 py-3 text-right">Search Volume</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data?.popularSearches.length === 0 ? (
                      <tr>
                        <td colSpan={2} className="px-5 py-4 text-center text-muted-foreground">No search queries logged yet.</td>
                      </tr>
                    ) : (
                      data?.popularSearches.map((s, idx) => (
                        <tr key={idx} className="hover:bg-muted/10">
                          <td className="px-5 py-3 font-medium text-foreground">"{s.query}"</td>
                          <td className="px-5 py-3 text-right text-muted-foreground font-semibold">{s.count.toLocaleString()}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Popular Clicked Clinics */}
          <Card className="border border-border bg-card shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-md font-semibold text-foreground flex items-center gap-2">
                <MousePointerClick className="h-4 w-4 text-primary" /> Most Clicked Clinics
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/20 text-left text-xs font-semibold text-muted-foreground">
                      <th className="px-5 py-3">Clinic Name</th>
                      <th className="px-5 py-3 text-right">Total Clicks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data?.popularClinics.length === 0 ? (
                      <tr>
                        <td colSpan={2} className="px-5 py-4 text-center text-muted-foreground">No clinic clicks logged yet.</td>
                      </tr>
                    ) : (
                      data?.popularClinics.map((c, idx) => (
                        <tr key={idx} className="hover:bg-muted/10">
                          <td className="px-5 py-3 font-medium text-foreground">{c.name}</td>
                          <td className="px-5 py-3 text-right text-muted-foreground font-semibold">{c.count.toLocaleString()}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Popular Pages */}
          <Card className="border border-border bg-card shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-md font-semibold text-foreground flex items-center gap-2">
                <Eye className="h-4 w-4 text-primary" /> Most Visited Paths
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/20 text-left text-xs font-semibold text-muted-foreground">
                      <th className="px-5 py-3">Page Path</th>
                      <th className="px-5 py-3 text-right">Page Views</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data?.popularPaths.length === 0 ? (
                      <tr>
                        <td colSpan={2} className="px-5 py-4 text-center text-muted-foreground">No page views logged yet.</td>
                      </tr>
                    ) : (
                      data?.popularPaths.map((p, idx) => (
                        <tr key={idx} className="hover:bg-muted/10">
                          <td className="px-5 py-3 font-mono text-xs text-foreground">{p.path}</td>
                          <td className="px-5 py-3 text-right text-muted-foreground font-semibold">{p.count.toLocaleString()}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Live Logs Stream */}
        <div>
          <Card className="border border-border bg-card shadow-sm sticky top-6">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-md font-semibold text-foreground flex items-center gap-2">
                  <Flame className="h-4 w-4 text-orange-500 animate-pulse" /> Live Event Stream
                </CardTitle>
                <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-semibold text-green-700">
                  Live
                </span>
              </div>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              <div className="rounded-xl bg-slate-950 p-4 font-mono text-xs max-h-[500px] overflow-y-auto space-y-3 text-slate-200">
                {data?.recentEvents.length === 0 ? (
                  <p className="text-slate-500 text-center py-4">No events logged in system.</p>
                ) : (
                  data?.recentEvents.map((event) => {
                    const time = new Date(event.created_at).toLocaleTimeString()
                    let color = "text-blue-400"
                    let detail = ""

                    if (event.event_name === "search_query") {
                      color = "text-purple-400"
                      detail = `query: "${event.metadata?.query || ""}"`
                    } else if (event.event_name === "clinic_click") {
                      color = "text-teal-400"
                      detail = `clinic: "${event.metadata?.clinic_name || ""}"`
                    } else if (event.event_name === "claim_start") {
                      color = "text-orange-400"
                      detail = `clinic_id: ${event.metadata?.clinic_id || ""}`
                    } else {
                      detail = `path: ${event.path || ""}`
                    }

                    return (
                      <div key={event.id} className="border-b border-slate-800/50 pb-2 last:border-0 last:pb-0">
                        <div className="flex justify-between text-[10px] text-slate-500 mb-1">
                          <span>{time}</span>
                          <span className={color}>[{event.event_name}]</span>
                        </div>
                        <p className="text-slate-300 break-all">{detail}</p>
                      </div>
                    )
                  })
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
