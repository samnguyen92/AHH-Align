"use client"

import { Search, Plus, Pencil, Trash2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const clinics = [
  { npi: "1234567890", name: "Sunrise Family Clinic", specialty: "Family Medicine", status: "Active" },
  { npi: "2345678901", name: "HealthFirst Medical Center", specialty: "Internal Medicine", status: "Verified" },
  { npi: "3456789012", name: "Seoul Orthopedic Clinic", specialty: "Orthopedic Surgery", status: "Pending Review" },
  { npi: "4567890123", name: "Bangkok Dental Care", specialty: "Dentistry", status: "Active" },
  { npi: "5678901234", name: "MyCare Women's Health", specialty: "Obstetrics & Gynecology", status: "Verified" },
  { npi: "6789012345", name: "Prime Physio Center", specialty: "Physical Therapy", status: "Draft" },
  { npi: "7890123456", name: "HealthyKids Pediatrics", specialty: "Pediatrics", status: "Pending Review" },
  { npi: "8901234567", name: "VisionPlus Eye Clinic", specialty: "Ophthalmology", status: "Active" },
  { npi: "9012345678", name: "Wellness Heart Center", specialty: "Cardiology", status: "Verified" },
  { npi: "0123456789", name: "Advanced Skin Clinic", specialty: "Dermatology", status: "Draft" },
  { npi: "1122334455", name: "Bay Area Family Clinic", specialty: "Family Medicine", status: "Active" },
  { npi: "2233445566", name: "Pacific Medical Group", specialty: "Primary Care", status: "Verified" },
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

export function ClinicsManagement() {
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
                  <tr key={clinic.npi} className="hover:bg-muted/30 transition-colors">
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
            <p className="text-sm text-muted-foreground">Showing 1 to 12 of 15,231 clinics</p>
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
