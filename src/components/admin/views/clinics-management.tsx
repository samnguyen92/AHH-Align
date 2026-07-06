"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Search, Plus, Pencil, Trash2, Loader2, X } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import type { AdminClinicRow } from "@/services/admin-service"
import { supabase } from "@/services/supabase-client"
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
  const router = useRouter()
  const [editingClinic, setEditingClinic] = useState<any>(null)
  const [fetchingId, setFetchingId] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<
    "general" | "hours_contact" | "about" | "highlights" | "services" | "team" | "pricing" | "insurance" | "images"
  >("general")

  const handleEditClick = async (clinicId: string) => {
    setFetchingId(clinicId)
    setErrorMessage(null)
    setActiveTab("general")
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      
      const headers: Record<string, string> = {}
      if (token) {
        headers["Authorization"] = `Bearer ${token}`
      }

      const res = await fetch(`/api/admin/clinics/${clinicId}`, { headers })
      if (!res.ok) throw new Error("Failed to fetch clinic details")
      const data = await res.json()
      
      const languagesStr = Array.isArray(data.clinic.languages)
        ? data.clinic.languages.join(", ")
        : ""

      const insuranceStr = Array.isArray(data.clinic.metadata?.insurance_accepted)
        ? data.clinic.metadata.insurance_accepted.join(", ")
        : ""

      const servicesStr = Array.isArray(data.clinic.metadata?.services)
        ? data.clinic.metadata.services.join(", ")
        : ""
        
      const workingHours = {
        monday: data.clinic.metadata?.working_hours?.monday || "",
        tuesday: data.clinic.metadata?.working_hours?.tuesday || "",
        wednesday: data.clinic.metadata?.working_hours?.wednesday || "",
        thursday: data.clinic.metadata?.working_hours?.thursday || "",
        friday: data.clinic.metadata?.working_hours?.friday || "",
        saturday: data.clinic.metadata?.working_hours?.saturday || "",
        sunday: data.clinic.metadata?.working_hours?.sunday || "",
      }

      setEditingClinic({
        ...data.clinic,
        languages: languagesStr,
        description: data.clinic.description || "",
        metadata: {
          ...data.clinic.metadata,
          short_description: data.clinic.metadata?.short_description || "",
          insurance_accepted: insuranceStr,
          services: servicesStr,
          highlights: data.clinic.metadata?.highlights || [],
          services_offered: data.clinic.metadata?.services_offered || [],
          team_members: data.clinic.metadata?.team_members || [],
          pricing: data.clinic.metadata?.pricing || [],
          images: Array.isArray(data.clinic.metadata?.images) ? data.clinic.metadata.images : [],
          working_hours: workingHours,
          website: data.clinic.metadata?.website || "",
          appointment_url: data.clinic.metadata?.appointment_url || "",
          email: data.clinic.metadata?.email || "",
          fax: data.clinic.metadata?.fax || "",
          google_maps_url: data.clinic.metadata?.google_maps_url || "",
        }
      })
    } catch (err: any) {
      setErrorMessage(err.message || "An error occurred while fetching clinic details.")
      setEditingClinic({ id: clinicId, name: "" })
    } finally {
      setFetchingId(null)
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingClinic) return
    setIsSaving(true)
    setErrorMessage(null)

    const languagesArray = typeof editingClinic.languages === 'string'
      ? editingClinic.languages.split(',').map((s: string) => s.trim()).filter(Boolean)
      : editingClinic.languages

    const insuranceArray = typeof editingClinic.metadata?.insurance_accepted === 'string'
      ? editingClinic.metadata.insurance_accepted.split(',').map((s: string) => s.trim()).filter(Boolean)
      : editingClinic.metadata?.insurance_accepted || []

    const servicesArray = typeof editingClinic.metadata?.services === 'string'
      ? editingClinic.metadata.services.split(',').map((s: string) => s.trim()).filter(Boolean)
      : editingClinic.metadata?.services || []

    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      
      const headers: Record<string, string> = {
        "Content-Type": "application/json"
      }
      if (token) {
        headers["Authorization"] = `Bearer ${token}`
      }

      const res = await fetch(`/api/admin/clinics/${editingClinic.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          ...editingClinic,
          languages: languagesArray,
          metadata: {
            ...editingClinic.metadata,
            insurance_accepted: insuranceArray,
            services: servicesArray,
          }
        }),
      })

      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.error || "Failed to update clinic")
      }

      setEditingClinic(null)
      router.refresh()
    } catch (err: any) {
      setErrorMessage(err.message || "An error occurred while saving.")
    } finally {
      setIsSaving(false)
    }
  }

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
                    <td className="px-6 py-4 text-sm font-medium text-foreground">
                      <a
                        href={`/clinics/${clinic.slug || clinic.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-primary hover:underline transition-colors"
                      >
                        {clinic.name}
                      </a>
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">{clinic.specialty}</td>
                    <td className="px-6 py-4">{getStatusBadge(clinic.status)}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <button 
                          onClick={() => handleEditClick(clinic.id)}
                          disabled={!!fetchingId}
                          className="flex items-center gap-1 text-sm text-primary hover:text-primary/80 transition-colors disabled:opacity-50"
                        >
                          {fetchingId === clinic.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Pencil className="h-4 w-4" />
                          )}
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

      {/* Edit Clinic Modal */}
      {editingClinic && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto">
          <div className="relative w-full max-w-2xl rounded-xl bg-card border border-border p-6 shadow-xl max-h-[90vh] overflow-y-auto flex flex-col">
            <div className="flex items-center justify-between border-b border-border pb-3 mb-4">
              <h3 className="text-lg font-semibold text-foreground">Edit Clinic</h3>
              <button 
                onClick={() => setEditingClinic(null)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {errorMessage && (
              <div className="mb-4 rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
                {errorMessage}
              </div>
            )}

            {/* Tabs Header */}
            <div className="flex border-b border-border mb-6 overflow-x-auto gap-2">
              <button
                type="button"
                onClick={() => setActiveTab("general")}
                className={`px-3 py-2 text-sm font-semibold border-b-2 transition-all whitespace-nowrap ${
                  activeTab === "general"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                General
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("hours_contact")}
                className={`px-3 py-2 text-sm font-semibold border-b-2 transition-all whitespace-nowrap ${
                  activeTab === "hours_contact"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                Hours & Contact
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("about")}
                className={`px-3 py-2 text-sm font-semibold border-b-2 transition-all whitespace-nowrap ${
                  activeTab === "about"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                About & Excerpt
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("highlights")}
                className={`px-3 py-2 text-sm font-semibold border-b-2 transition-all whitespace-nowrap ${
                  activeTab === "highlights"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                Highlights
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("services")}
                className={`px-3 py-2 text-sm font-semibold border-b-2 transition-all whitespace-nowrap ${
                  activeTab === "services"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                Services
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("team")}
                className={`px-3 py-2 text-sm font-semibold border-b-2 transition-all whitespace-nowrap ${
                  activeTab === "team"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                Meet the Team
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("pricing")}
                className={`px-3 py-2 text-sm font-semibold border-b-2 transition-all whitespace-nowrap ${
                  activeTab === "pricing"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                Pricing
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("insurance")}
                className={`px-3 py-2 text-sm font-semibold border-b-2 transition-all whitespace-nowrap ${
                  activeTab === "insurance"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                Insurance
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("images")}
                className={`px-3 py-2 text-sm font-semibold border-b-2 transition-all whitespace-nowrap ${
                  activeTab === "images"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                Images
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4 flex-1">
              {activeTab === "general" && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block sm:col-span-2">
                    <span className="text-xs font-semibold text-muted-foreground block mb-1">Facility Name *</span>
                    <Input
                      required
                      value={editingClinic.name || ""}
                      onChange={(e) => setEditingClinic({ ...editingClinic, name: e.target.value })}
                      className="bg-background border-border"
                    />
                  </label>

                  <label className="block">
                    <span className="text-xs font-semibold text-muted-foreground block mb-1">Specialty</span>
                    <Input
                      value={editingClinic.specialty || ""}
                      onChange={(e) => setEditingClinic({ ...editingClinic, specialty: e.target.value })}
                      className="bg-background border-border"
                    />
                  </label>

                  <label className="block">
                    <span className="text-xs font-semibold text-muted-foreground block mb-1">Phone</span>
                    <Input
                      value={editingClinic.phone || ""}
                      onChange={(e) => setEditingClinic({ ...editingClinic, phone: e.target.value })}
                      className="bg-background border-border"
                    />
                  </label>

                  <label className="block sm:col-span-2">
                    <span className="text-xs font-semibold text-muted-foreground block mb-1">Languages (comma separated)</span>
                    <Input
                      value={editingClinic.languages || ""}
                      onChange={(e) => setEditingClinic({ ...editingClinic, languages: e.target.value })}
                      placeholder="e.g. Vietnamese, Korean, English"
                      className="bg-background border-border"
                    />
                  </label>

                  <label className="block sm:col-span-2">
                    <span className="text-xs font-semibold text-muted-foreground block mb-1">Street Address</span>
                    <Input
                      value={editingClinic.address || ""}
                      onChange={(e) => setEditingClinic({ ...editingClinic, address: e.target.value })}
                      className="bg-background border-border"
                    />
                  </label>

                  <label className="block">
                    <span className="text-xs font-semibold text-muted-foreground block mb-1">City</span>
                    <Input
                      value={editingClinic.city || ""}
                      onChange={(e) => setEditingClinic({ ...editingClinic, city: e.target.value })}
                      className="bg-background border-border"
                    />
                  </label>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="text-xs font-semibold text-muted-foreground block mb-1">State</span>
                      <Input
                        value={editingClinic.state || ""}
                        onChange={(e) => setEditingClinic({ ...editingClinic, state: e.target.value })}
                        className="bg-background border-border"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-semibold text-muted-foreground block mb-1">Zip Code</span>
                      <Input
                        value={editingClinic.zip_code || ""}
                        onChange={(e) => setEditingClinic({ ...editingClinic, zip_code: e.target.value })}
                        className="bg-background border-border"
                      />
                    </label>
                  </div>
                </div>
              )}

              {activeTab === "about" && (
                <div className="space-y-4">
                  <label className="block">
                    <span className="text-xs font-semibold text-muted-foreground block mb-1">Excerpt (Short Description)</span>
                    <textarea
                      value={editingClinic.metadata?.short_description || ""}
                      onChange={(e) => setEditingClinic({
                        ...editingClinic,
                        metadata: { ...editingClinic.metadata, short_description: e.target.value }
                      })}
                      rows={3}
                      className="w-full text-sm p-3 border border-border bg-background rounded-lg outline-none focus:border-primary focus:ring-1 focus:ring-primary text-foreground"
                      placeholder="A short summary of the clinic's focus..."
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-muted-foreground block mb-1">About (Full Description)</span>
                    <textarea
                      value={editingClinic.description || ""}
                      onChange={(e) => setEditingClinic({ ...editingClinic, description: e.target.value })}
                      rows={8}
                      className="w-full text-sm p-3 border border-border bg-background rounded-lg outline-none focus:border-primary focus:ring-1 focus:ring-primary text-foreground"
                      placeholder="Provide full description paragraphs describing the facility, background, and cultural expertise..."
                    />
                  </label>
                </div>
              )}

              {activeTab === "highlights" && (
                <div className="space-y-3">
                  <span className="text-xs font-semibold text-muted-foreground block mb-1">Clinic Highlights</span>
                  <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                    {((editingClinic.metadata?.highlights || []) as any[]).map((highlight, index) => (
                      <div key={index} className="flex gap-2 items-center bg-muted/20 border border-border p-3 rounded-lg">
                        <div className="flex-1 grid grid-cols-2 gap-2">
                          <Input
                            placeholder="Highlight Title"
                            value={highlight.title || ""}
                            onChange={(e) => {
                              const newHighlights = [...(editingClinic.metadata?.highlights || [])]
                              newHighlights[index] = { ...newHighlights[index], title: e.target.value }
                              setEditingClinic({
                                ...editingClinic,
                                metadata: { ...editingClinic.metadata, highlights: newHighlights }
                              })
                            }}
                            className="bg-background border-border"
                          />
                          <Input
                            placeholder="Detail (e.g. Speaks Vietnamese)"
                            value={highlight.detail || ""}
                            onChange={(e) => {
                              const newHighlights = [...(editingClinic.metadata?.highlights || [])]
                              newHighlights[index] = { ...newHighlights[index], detail: e.target.value }
                              setEditingClinic({
                                ...editingClinic,
                                metadata: { ...editingClinic.metadata, highlights: newHighlights }
                              })
                            }}
                            className="bg-background border-border"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const newHighlights = (editingClinic.metadata?.highlights || []).filter((_: any, i: number) => i !== index)
                            setEditingClinic({
                              ...editingClinic,
                              metadata: { ...editingClinic.metadata, highlights: newHighlights }
                            })
                          }}
                          className="text-destructive hover:text-destructive/85 p-1 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      const newHighlights = [...(editingClinic.metadata?.highlights || []), { title: "", detail: "" }]
                      setEditingClinic({
                        ...editingClinic,
                        metadata: { ...editingClinic.metadata, highlights: newHighlights }
                      })
                    }}
                    className="w-full bg-background border-dashed border-2 hover:bg-muted/30"
                  >
                    <Plus className="mr-2 h-4 w-4" /> Add Highlight
                  </Button>
                </div>
              )}

              {activeTab === "hours_contact" && (
                <div className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block">
                      <span className="text-xs font-semibold text-muted-foreground block mb-1">Website URL</span>
                      <Input
                        value={editingClinic.metadata?.website || ""}
                        onChange={(e) => setEditingClinic({
                          ...editingClinic,
                          metadata: { ...editingClinic.metadata, website: e.target.value }
                        })}
                        className="bg-background border-border"
                      />
                    </label>

                    <label className="block">
                      <span className="text-xs font-semibold text-muted-foreground block mb-1">Appointment / Call URL</span>
                      <Input
                        value={editingClinic.metadata?.appointment_url || ""}
                        onChange={(e) => setEditingClinic({
                          ...editingClinic,
                          metadata: { ...editingClinic.metadata, appointment_url: e.target.value }
                        })}
                        className="bg-background border-border"
                      />
                    </label>

                    <label className="block">
                      <span className="text-xs font-semibold text-muted-foreground block mb-1">Email Address</span>
                      <Input
                        value={editingClinic.metadata?.email || ""}
                        onChange={(e) => setEditingClinic({
                          ...editingClinic,
                          metadata: { ...editingClinic.metadata, email: e.target.value }
                        })}
                        className="bg-background border-border"
                      />
                    </label>

                    <label className="block">
                      <span className="text-xs font-semibold text-muted-foreground block mb-1">Fax Number</span>
                      <Input
                        value={editingClinic.metadata?.fax || ""}
                        onChange={(e) => setEditingClinic({
                          ...editingClinic,
                          metadata: { ...editingClinic.metadata, fax: e.target.value }
                        })}
                        className="bg-background border-border"
                      />
                    </label>

                    <label className="block sm:col-span-2">
                      <span className="text-xs font-semibold text-muted-foreground block mb-1">Google Maps URL</span>
                      <Input
                        value={editingClinic.metadata?.google_maps_url || ""}
                        onChange={(e) => setEditingClinic({
                          ...editingClinic,
                          metadata: { ...editingClinic.metadata, google_maps_url: e.target.value }
                        })}
                        className="bg-background border-border"
                      />
                    </label>
                  </div>

                  <div className="border-t border-border pt-4">
                    <span className="text-xs font-semibold text-muted-foreground block mb-3">Working Hours</span>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map((day) => (
                        <label key={day} className="flex items-center gap-2">
                          <span className="text-xs font-medium text-foreground capitalize w-24 shrink-0">{day}:</span>
                          <Input
                            placeholder="e.g. 8:00 AM - 5:00 PM"
                            value={editingClinic.metadata?.working_hours?.[day] || ""}
                            onChange={(e) => setEditingClinic({
                              ...editingClinic,
                              metadata: {
                                ...editingClinic.metadata,
                                working_hours: {
                                  ...editingClinic.metadata.working_hours,
                                  [day]: e.target.value
                                }
                              }
                            })}
                            className="bg-background border-border h-9"
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "services" && (
                <div className="space-y-3">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-semibold text-muted-foreground">Structured Services Offered</span>
                  </div>
                  <div className="space-y-4 max-h-[350px] overflow-y-auto pr-1">
                    {((editingClinic.metadata?.services_offered || []) as any[]).map((service, index) => (
                      <div key={index} className="bg-muted/20 border border-border p-4 rounded-lg relative space-y-3">
                        <button
                          type="button"
                          onClick={() => {
                            const newServices = (editingClinic.metadata?.services_offered || []).filter((_: any, i: number) => i !== index)
                            setEditingClinic({
                              ...editingClinic,
                              metadata: { ...editingClinic.metadata, services_offered: newServices }
                            })
                          }}
                          className="absolute top-2 right-2 text-destructive hover:text-destructive/85 p-1 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                        <div className="grid gap-3 sm:grid-cols-2 pt-2">
                          <label className="block">
                            <span className="text-[11px] font-semibold text-muted-foreground block mb-1">Service Name *</span>
                            <Input
                              required
                              value={service.name || ""}
                              onChange={(e) => {
                                const newServices = [...(editingClinic.metadata?.services_offered || [])]
                                newServices[index] = { ...newServices[index], name: e.target.value }
                                setEditingClinic({
                                  ...editingClinic,
                                  metadata: { ...editingClinic.metadata, services_offered: newServices }
                                })
                              }}
                              className="bg-background border-border h-8 text-xs"
                            />
                          </label>
                          <label className="block">
                            <span className="text-[11px] font-semibold text-muted-foreground block mb-1">Category</span>
                            <Input
                              value={service.category || ""}
                              onChange={(e) => {
                                const newServices = [...(editingClinic.metadata?.services_offered || [])]
                                newServices[index] = { ...newServices[index], category: e.target.value }
                                setEditingClinic({
                                  ...editingClinic,
                                  metadata: { ...editingClinic.metadata, services_offered: newServices }
                                })
                              }}
                              className="bg-background border-border h-8 text-xs"
                            />
                          </label>
                          <label className="block sm:col-span-2">
                            <span className="text-[11px] font-semibold text-muted-foreground block mb-1">Description</span>
                            <textarea
                              value={service.description || ""}
                              onChange={(e) => {
                                const newServices = [...(editingClinic.metadata?.services_offered || [])]
                                newServices[index] = { ...newServices[index], description: e.target.value }
                                setEditingClinic({
                                  ...editingClinic,
                                  metadata: { ...editingClinic.metadata, services_offered: newServices }
                                })
                              }}
                              rows={2}
                              className="w-full text-xs p-2 border border-border bg-background rounded-lg outline-none focus:border-primary focus:ring-1 focus:ring-primary text-foreground font-sans"
                            />
                          </label>
                          <label className="block sm:col-span-2">
                            <span className="text-[11px] font-semibold text-muted-foreground block mb-1">Ideal For / Patient Fit</span>
                            <Input
                              value={service.patient_fit || ""}
                              onChange={(e) => {
                                const newServices = [...(editingClinic.metadata?.services_offered || [])]
                                newServices[index] = { ...newServices[index], patient_fit: e.target.value }
                                setEditingClinic({
                                  ...editingClinic,
                                  metadata: { ...editingClinic.metadata, services_offered: newServices }
                                })
                              }}
                              className="bg-background border-border h-8 text-xs"
                            />
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      const newServices = [...(editingClinic.metadata?.services_offered || []), { name: "", category: "", description: "", patient_fit: "" }]
                      setEditingClinic({
                        ...editingClinic,
                        metadata: { ...editingClinic.metadata, services_offered: newServices }
                      })
                    }}
                    className="w-full bg-background border-dashed border-2 hover:bg-muted/30"
                  >
                    <Plus className="mr-2 h-4 w-4" /> Add Structured Service
                  </Button>
                </div>
              )}

              {activeTab === "team" && (
                <div className="space-y-3">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-semibold text-muted-foreground">Team Members</span>
                  </div>
                  <div className="space-y-4 max-h-[350px] overflow-y-auto pr-1">
                    {((editingClinic.metadata?.team_members || []) as any[]).map((member, index) => (
                      <div key={index} className="bg-muted/20 border border-border p-4 rounded-lg relative space-y-3">
                        <button
                          type="button"
                          onClick={() => {
                            const newTeam = (editingClinic.metadata?.team_members || []).filter((_: any, i: number) => i !== index)
                            setEditingClinic({
                              ...editingClinic,
                              metadata: { ...editingClinic.metadata, team_members: newTeam }
                            })
                          }}
                          className="absolute top-2 right-2 text-destructive hover:text-destructive/85 p-1 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                        <div className="grid gap-3 sm:grid-cols-2 pt-2">
                          <label className="block">
                            <span className="text-[11px] font-semibold text-muted-foreground block mb-1">Full Name *</span>
                            <Input
                              required
                              value={member.name || ""}
                              onChange={(e) => {
                                const newTeam = [...(editingClinic.metadata?.team_members || [])]
                                newTeam[index] = { ...newTeam[index], name: e.target.value }
                                setEditingClinic({
                                  ...editingClinic,
                                  metadata: { ...editingClinic.metadata, team_members: newTeam }
                                })
                              }}
                              className="bg-background border-border h-8 text-xs"
                            />
                          </label>
                          <label className="block">
                            <span className="text-[11px] font-semibold text-muted-foreground block mb-1">Role</span>
                            <Input
                              value={member.role || ""}
                              onChange={(e) => {
                                const newTeam = [...(editingClinic.metadata?.team_members || [])]
                                newTeam[index] = { ...newTeam[index], role: e.target.value }
                                setEditingClinic({
                                  ...editingClinic,
                                  metadata: { ...editingClinic.metadata, team_members: newTeam }
                                })
                              }}
                              className="bg-background border-border h-8 text-xs"
                            />
                          </label>
                          <label className="block sm:col-span-2">
                            <span className="text-[11px] font-semibold text-muted-foreground block mb-1">Bio</span>
                            <textarea
                              value={member.bio || ""}
                              onChange={(e) => {
                                const newTeam = [...(editingClinic.metadata?.team_members || [])]
                                newTeam[index] = { ...newTeam[index], bio: e.target.value }
                                setEditingClinic({
                                  ...editingClinic,
                                  metadata: { ...editingClinic.metadata, team_members: newTeam }
                                })
                              }}
                              rows={2}
                              className="w-full text-xs p-2 border border-border bg-background rounded-lg outline-none focus:border-primary focus:ring-1 focus:ring-primary text-foreground font-sans"
                            />
                          </label>
                          <label className="block sm:col-span-2">
                            <span className="text-[11px] font-semibold text-muted-foreground block mb-1">Image URL</span>
                            <Input
                              value={member.image || ""}
                              onChange={(e) => {
                                const newTeam = [...(editingClinic.metadata?.team_members || [])]
                                newTeam[index] = { ...newTeam[index], image: e.target.value }
                                setEditingClinic({
                                  ...editingClinic,
                                  metadata: { ...editingClinic.metadata, team_members: newTeam }
                                })
                              }}
                              className="bg-background border-border h-8 text-xs"
                            />
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      const newTeam = [...(editingClinic.metadata?.team_members || []), { name: "", role: "", bio: "", image: "" }]
                      setEditingClinic({
                        ...editingClinic,
                        metadata: { ...editingClinic.metadata, team_members: newTeam }
                      })
                    }}
                    className="w-full bg-background border-dashed border-2 hover:bg-muted/30"
                  >
                    <Plus className="mr-2 h-4 w-4" /> Add Team Member
                  </Button>
                </div>
              )}

              {activeTab === "pricing" && (
                <div className="space-y-3">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-semibold text-muted-foreground">Service Pricing</span>
                  </div>
                  <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
                    {((editingClinic.metadata?.pricing || []) as any[]).map((priceItem, index) => (
                      <div key={index} className="flex gap-2 items-center bg-muted/20 border border-border p-3 rounded-lg">
                        <div className="flex-1 grid grid-cols-3 gap-2">
                          <label className="block col-span-2">
                            <span className="text-[10px] font-semibold text-muted-foreground block mb-0.5">Service Name *</span>
                            <Input
                              placeholder="Service Name"
                              value={priceItem.service_name || ""}
                              onChange={(e) => {
                                const newPricing = [...(editingClinic.metadata?.pricing || [])]
                                newPricing[index] = { ...newPricing[index], service_name: e.target.value }
                                setEditingClinic({
                                  ...editingClinic,
                                  metadata: { ...editingClinic.metadata, pricing: newPricing }
                                })
                              }}
                              className="bg-background border-border h-8 text-xs"
                            />
                          </label>
                          <label className="block">
                            <span className="text-[10px] font-semibold text-muted-foreground block mb-0.5">Price *</span>
                            <Input
                              placeholder="Price (e.g. $120)"
                              value={priceItem.price || ""}
                              onChange={(e) => {
                                const newPricing = [...(editingClinic.metadata?.pricing || [])]
                                newPricing[index] = { ...newPricing[index], price: e.target.value }
                                setEditingClinic({
                                  ...editingClinic,
                                  metadata: { ...editingClinic.metadata, pricing: newPricing }
                                })
                              }}
                              className="bg-background border-border h-8 text-xs"
                            />
                          </label>
                          <label className="block col-span-3">
                            <span className="text-[10px] font-semibold text-muted-foreground block mb-0.5">Note</span>
                            <Input
                              placeholder="e.g. Free consultation, sliding scale"
                              value={priceItem.note || ""}
                              onChange={(e) => {
                                const newPricing = [...(editingClinic.metadata?.pricing || [])]
                                newPricing[index] = { ...newPricing[index], note: e.target.value }
                                setEditingClinic({
                                  ...editingClinic,
                                  metadata: { ...editingClinic.metadata, pricing: newPricing }
                                })
                              }}
                              className="bg-background border-border h-8 text-xs"
                            />
                          </label>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const newPricing = (editingClinic.metadata?.pricing || []).filter((_: any, i: number) => i !== index)
                            setEditingClinic({
                              ...editingClinic,
                              metadata: { ...editingClinic.metadata, pricing: newPricing }
                            })
                          }}
                          className="text-destructive hover:text-destructive/85 p-1 self-center transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      const newPricing = [...(editingClinic.metadata?.pricing || []), { service_name: "", price: "", note: "" }]
                      setEditingClinic({
                        ...editingClinic,
                        metadata: { ...editingClinic.metadata, pricing: newPricing }
                      })
                    }}
                    className="w-full bg-background border-dashed border-2 hover:bg-muted/30"
                  >
                    <Plus className="mr-2 h-4 w-4" /> Add Pricing Item
                  </Button>
                </div>
              )}

              {activeTab === "images" && (
                <div className="space-y-3">
                  <span className="text-xs font-semibold text-muted-foreground block mb-1">Clinic Images (URLs)</span>
                  <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
                    {((editingClinic.metadata?.images || []) as string[]).map((image, index) => {
                      const isValid = image && (image.startsWith("http://") || image.startsWith("https://") || image.startsWith("/"));
                      return (
                        <div key={index} className="flex flex-col sm:flex-row gap-4 items-start sm:items-center bg-muted/20 border border-border p-4 rounded-lg">
                          {/* Thumbnail Preview */}
                          <div className="w-24 h-24 rounded-lg bg-muted border border-border overflow-hidden flex items-center justify-center shrink-0">
                            {isValid ? (
                              <img
                                src={image}
                                alt={`Clinic Preview ${index + 1}`}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  (e.target as any).style.display = 'none';
                                }}
                              />
                            ) : (
                              <span className="text-[10px] text-muted-foreground text-center px-1">No image</span>
                            )}
                          </div>

                          <div className="flex-1 w-full space-y-2">
                            <div className="flex items-center gap-2">
                              <Input
                                placeholder="https://example.com/image.jpg"
                                value={image}
                                onChange={(e) => {
                                  const newImages = [...(editingClinic.metadata?.images || [])]
                                  newImages[index] = e.target.value
                                  setEditingClinic({
                                    ...editingClinic,
                                    metadata: { ...editingClinic.metadata, images: newImages }
                                  })
                                }}
                                className="bg-background border-border flex-1 h-9 text-xs"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const newImages = (editingClinic.metadata?.images || []).filter((_: any, i: number) => i !== index)
                                  setEditingClinic({
                                    ...editingClinic,
                                    metadata: { ...editingClinic.metadata, images: newImages }
                                  })
                                }}
                                className="text-destructive hover:text-destructive/85 p-1 transition-colors shrink-0"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>

                            <div className="flex items-center gap-2">
                              {index === 0 ? (
                                <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary font-sans">
                                  ★ Featured Image
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const newImages = [...(editingClinic.metadata?.images || [])]
                                    const [selected] = newImages.splice(index, 1);
                                    newImages.unshift(selected);
                                    setEditingClinic({
                                      ...editingClinic,
                                      metadata: { ...editingClinic.metadata, images: newImages }
                                    })
                                  }}
                                  className="text-xs font-semibold text-primary hover:text-primary/80 transition-colors font-sans"
                                >
                                  Set as Featured
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      const newImages = [...(editingClinic.metadata?.images || []), ""]
                      setEditingClinic({
                        ...editingClinic,
                        metadata: { ...editingClinic.metadata, images: newImages }
                      })
                    }}
                    className="w-full bg-background border-dashed border-2 hover:bg-muted/30"
                  >
                    <Plus className="mr-2 h-4 w-4" /> Add Image URL
                  </Button>
                </div>
              )}

              {activeTab === "insurance" && (
                <div className="space-y-4">
                  <label className="block">
                    <span className="text-xs font-semibold text-muted-foreground block mb-1">Insurance Accepted (comma separated)</span>
                    <textarea
                      value={editingClinic.metadata?.insurance_accepted || ""}
                      onChange={(e) => setEditingClinic({
                        ...editingClinic,
                        metadata: { ...editingClinic.metadata, insurance_accepted: e.target.value }
                      })}
                      rows={6}
                      className="w-full text-sm p-3 border border-border bg-background rounded-lg outline-none focus:border-primary focus:ring-1 focus:ring-primary text-foreground"
                      placeholder="e.g. Medi-Cal, Delta Dental, Aetna, Cigna"
                    />
                  </label>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-border mt-6">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setEditingClinic(null)}
                  disabled={isSaving}
                  className="bg-background border-border"
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={isSaving}
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Changes
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
