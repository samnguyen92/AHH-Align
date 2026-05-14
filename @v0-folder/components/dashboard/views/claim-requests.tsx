"use client"

import { useState } from "react"
import { Search, Check, X, Mail, FileText, Globe, Image } from "lucide-react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

const claims = [
  {
    id: 1,
    doctorName: "Dr. Kevin Nguyen",
    clinicName: "Pacific Medical Group",
    npi: "1234567890",
    proofs: [
      { type: "domain", label: "Domain Match", verified: true },
      { type: "document", label: "License Upload", verified: true },
    ],
    notes: "Requested expedited review for clinic opening next week.",
    submittedAt: "2 hours ago",
  },
  {
    id: 2,
    doctorName: "Dr. Sarah Chen",
    clinicName: "Golden Gate Health Center",
    npi: "0987654321",
    proofs: [
      { type: "document", label: "NPI Letter", verified: true },
    ],
    notes: "New practice, documents look valid.",
    submittedAt: "5 hours ago",
  },
  {
    id: 3,
    doctorName: "Dr. Michael Park",
    clinicName: "Bay Area Family Clinic",
    npi: "1122334455",
    proofs: [
      { type: "domain", label: "Domain Match", verified: true },
      { type: "document", label: "Business License", verified: true },
      { type: "photo", label: "Office Photo", verified: false },
    ],
    notes: "Pending photo verification.",
    submittedAt: "1 day ago",
  },
  {
    id: 4,
    doctorName: "Dr. Lisa Tran",
    clinicName: "Sunset Medical Associates",
    npi: "5566778899",
    proofs: [
      { type: "document", label: "Medical License", verified: true },
    ],
    notes: "",
    submittedAt: "2 days ago",
  },
]

export function ClaimRequests() {
  const [activeTab, setActiveTab] = useState("pending")

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-card border border-border">
            <TabsTrigger value="pending" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              Pending (42)
            </TabsTrigger>
            <TabsTrigger value="approved" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              Approved
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-3">
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search claims..."
              className="pl-9 bg-card border-input"
            />
          </div>
          <Select>
            <SelectTrigger className="w-[160px] bg-card border-input">
              <SelectValue placeholder="Proof Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="domain">Domain Match</SelectItem>
              <SelectItem value="document">Document Upload</SelectItem>
              <SelectItem value="photo">Photo Verification</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Claims Grid */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {claims.map((claim) => (
          <Card key={claim.id} className="border-border bg-card">
            <CardHeader className="pb-3">
              <div className="space-y-1">
                <h3 className="text-lg font-semibold text-foreground">{claim.doctorName}</h3>
                <p className="text-sm text-muted-foreground">{claim.clinicName}</p>
                <p className="font-mono text-xs text-muted-foreground">NPI: {claim.npi}</p>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Verification Proofs */}
              <div className="flex flex-wrap gap-2">
                {claim.proofs.map((proof, idx) => (
                  <Badge
                    key={idx}
                    variant={proof.verified ? "default" : "secondary"}
                    className={`flex items-center gap-1.5 ${
                      proof.verified
                        ? "bg-success/20 text-success hover:bg-success/30"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {proof.type === "domain" && <Globe className="h-3 w-3" />}
                    {proof.type === "document" && <FileText className="h-3 w-3" />}
                    {proof.type === "photo" && <Image className="h-3 w-3" />}
                    {proof.label}
                  </Badge>
                ))}
              </div>

              {/* Document Thumbnail Placeholder */}
              <div className="flex h-16 items-center justify-center rounded-lg border border-dashed border-border bg-muted/50">
                <span className="text-xs text-muted-foreground">Document Preview</span>
              </div>

              {/* Notes */}
              {claim.notes && (
                <div className="rounded-lg bg-muted/50 p-3">
                  <p className="text-xs text-muted-foreground">{claim.notes}</p>
                </div>
              )}

              {/* Timestamp */}
              <p className="text-xs text-muted-foreground">Submitted {claim.submittedAt}</p>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-2 border-t border-border">
                <Button 
                  size="sm" 
                  className="flex-1 bg-success text-white hover:bg-success/90"
                >
                  <Check className="mr-1.5 h-4 w-4" />
                  Approve
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="flex-1 border-destructive text-destructive hover:bg-destructive/10"
                >
                  <X className="mr-1.5 h-4 w-4" />
                  Reject
                </Button>
                <Button variant="outline" size="icon" className="h-8 w-8 border-input">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
