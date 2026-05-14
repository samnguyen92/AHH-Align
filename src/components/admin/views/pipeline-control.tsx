"use client"

import { useState } from "react"
import { Bot, Play, Pause, RotateCcw, Activity, Database, Globe, FileText, ImageIcon, CheckCircle2, AlertTriangle } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { supabase } from "@/lib/supabase/client"
import { persistAuthToken } from "@/lib/auth/session-cookie"

const agents = [
  { name: "NPI Seeding", status: "Running", progress: 72, icon: Database, color: "text-blue-600", bg: "bg-blue-50" },
  { name: "Web Scraper", status: "Running", progress: 46, icon: Globe, color: "text-green-600", bg: "bg-green-50" },
  { name: "Insight Writer", status: "Idle", progress: 0, icon: FileText, color: "text-purple-600", bg: "bg-purple-50" },
  { name: "Image Generator", status: "Healthy", progress: 100, icon: ImageIcon, color: "text-orange-600", bg: "bg-orange-50" },
]

const jobs = [
  { id: "JOB-7842", type: "Clinic Scrape", target: "San Jose Vietnamese clinics", status: "Running", started: "12:45 PM" },
  { id: "JOB-7841", type: "Research Report", target: "Asian mental health services", status: "Completed", started: "12:18 PM" },
  { id: "JOB-7840", type: "Article Rewrite", target: "I-693 guide", status: "Completed", started: "11:52 AM" },
  { id: "JOB-7839", type: "Image Repair", target: "Article images", status: "Warning", started: "11:31 AM" },
]

const logs = [
  { time: "12:45:21", tag: "PIPELINE", message: "Started clinic scrape batch for San Jose", color: "text-blue-400" },
  { time: "12:45:18", tag: "SEARCH", message: "Collected 24 source candidates", color: "text-cyan-400" },
  { time: "12:45:12", tag: "SCRAPER", message: "Extracting Google Places metadata...", color: "text-green-400" },
  { time: "12:45:08", tag: "STORAGE", message: "Uploading clinic image to Supabase Storage", color: "text-yellow-400" },
  { time: "12:45:03", tag: "DB", message: "Upserted 4 enriched clinic records", color: "text-purple-400" },
  { time: "12:44:59", tag: "SYSTEM", message: "OpenClaw worker heartbeat healthy", color: "text-green-400" },
]

function getStatusBadge(status: string) {
  switch (status) {
    case "Running":
      return <Badge className="bg-blue-50 text-blue-700 hover:bg-blue-50">Running</Badge>
    case "Completed":
      return <Badge className="bg-success/20 text-success hover:bg-success/20">Completed</Badge>
    case "Warning":
      return <Badge className="bg-warning/20 text-warning hover:bg-warning/20">Warning</Badge>
    default:
      return <Badge variant="secondary">{status}</Badge>
  }
}

export function PipelineControl() {
  const [message, setMessage] = useState<string | null>(null)
  const [isRunningAction, setIsRunningAction] = useState(false)

  async function triggerPipeline(action: "run_pipeline" | "pause_pipeline" | "restart_pipeline") {
    setIsRunningAction(true)
    setMessage(null)
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token

    if (!token) {
      setMessage("Please sign in again before running pipeline actions.")
      setIsRunningAction(false)
      return
    }

    persistAuthToken(token)

    const response = await fetch("/api/admin/pipeline", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action }),
    })
    const result = await response.json()
    setMessage(result.message ?? result.error ?? `${action} completed.`)
    setIsRunningAction(false)
  }

  return (
    <div className="space-y-6">
      {/* Control Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">AI Pipeline Control</h2>
          <p className="text-sm text-muted-foreground">Monitor OpenClaw workers, current jobs, and live backend logs.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button disabled={isRunningAction} onClick={() => triggerPipeline("run_pipeline")} className="bg-primary text-primary-foreground hover:bg-primary/90">
            <Play className="mr-2 h-4 w-4" />
            Run Pipeline
          </Button>
          <Button disabled={isRunningAction} onClick={() => triggerPipeline("pause_pipeline")} variant="outline" className="border-input">
            <Pause className="mr-2 h-4 w-4" />
            Pause
          </Button>
          <Button disabled={isRunningAction} onClick={() => triggerPipeline("restart_pipeline")} variant="outline" className="border-input">
            <RotateCcw className="mr-2 h-4 w-4" />
            Restart
          </Button>
        </div>
      </div>

      {message && (
        <div className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          {message}
        </div>
      )}

      {/* Agent Cards */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {agents.map((agent) => (
          <Card key={agent.name} className="border border-border bg-card shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${agent.bg}`}>
                  <agent.icon className={`h-6 w-6 ${agent.color}`} />
                </div>
                {getStatusBadge(agent.status)}
              </div>
              <div className="mt-4">
                <h3 className="font-semibold text-foreground">{agent.name}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{agent.progress}% current batch</p>
                <Progress value={agent.progress} className="mt-3 h-1.5" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        {/* Jobs Table */}
        <Card className="border border-border bg-card shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-4">
            <CardTitle className="text-lg font-semibold text-foreground">Recent Jobs</CardTitle>
            <Activity className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Job ID</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Type</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Target</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Started</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {jobs.map((job) => (
                    <tr key={job.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-6 py-4 text-sm text-muted-foreground font-mono">{job.id}</td>
                      <td className="px-6 py-4 text-sm font-medium text-foreground">{job.type}</td>
                      <td className="px-6 py-4 text-sm text-muted-foreground">{job.target}</td>
                      <td className="px-6 py-4">{getStatusBadge(job.status)}</td>
                      <td className="px-6 py-4 text-sm text-muted-foreground">{job.started}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Health + Logs */}
        <Card className="border border-border bg-card shadow-sm">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50">
                  <Bot className="h-5 w-5 text-teal-600" />
                </div>
                <CardTitle className="text-lg font-semibold text-foreground">Live Status</CardTitle>
              </div>
              <CheckCircle2 className="h-5 w-5 text-success" />
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-muted/50 p-4">
                <p className="text-xs text-muted-foreground">Queue</p>
                <p className="text-2xl font-bold text-primary">12</p>
              </div>
              <div className="rounded-xl bg-muted/50 p-4">
                <p className="text-xs text-muted-foreground">Errors</p>
                <p className="flex items-center gap-2 text-2xl font-bold text-warning">
                  <AlertTriangle className="h-5 w-5" />
                  1
                </p>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium text-muted-foreground">Live Activity Logs</h4>
                <span className="flex items-center gap-1.5 text-xs text-green-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                  Live
                </span>
              </div>
              <div className="rounded-xl bg-slate-900 p-3 font-mono text-xs max-h-80 overflow-y-auto">
                {logs.map((log, index) => (
                  <div key={index} className="flex gap-2 py-1">
                    <span className="text-slate-500">{log.time}</span>
                    <span className={log.color}>[{log.tag}]</span>
                    <span className="text-slate-300">{log.message}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
