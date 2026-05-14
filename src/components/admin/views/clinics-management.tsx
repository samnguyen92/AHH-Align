"use client"

import { Search, Plus, Pencil, Trash2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import type { AdminClinicRow } from "@/services/admin-service"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

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

export function ClinicsManagement({
  clinics,
  total,
}: {
  clinics: AdminClinicRow[]
  total: number
}) {
  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-3">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search clinics..."
              className="pl-9 bg-card border-border"
            />
          </div>
          <Select>
            <SelectTrigger className="w-[140px] bg-card border-border">
              <SelectValue placeholder="City" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sf">San Francisco</SelectItem>
              <SelectItem value="oakland">Oakland</SelectItem>
              <SelectItem value="sanjose">San Jose</SelectItem>
              <SelectItem value="la">Los Angeles</SelectItem>
            </SelectContent>
          </Select>
          <Select>
            <SelectTrigger className="w-[160px] bg-card border-border">
              <SelectValue placeholder="Specialty" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="primary">Primary Care</SelectItem>
              <SelectItem value="internal">Internal Medicine</SelectItem>
              <SelectItem value="family">Family Medicine</SelectItem>
              <SelectItem value="pediatrics">Pediatrics</SelectItem>
              <SelectItem value="cardiology">Cardiology</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
          <Plus className="mr-2 h-4 w-4" />
          Add New Clinic
        </Button>
      </div>

      {/* Data Table */}
      <Card className="border border-border bg-card shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg font-semibold text-foreground">
            All Clinics
          </CardTitle>
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
                {clinics.map((clinic) => (
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
            <p className="text-sm text-muted-foreground">Showing 1 to {clinics.length} of {total.toLocaleString()} clinics</p>
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
  )
}
