"use client"

import { useState } from "react"
import { Building2, X } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Progress } from "@/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

const linkedClinics = [
  { id: 1, name: "Pacific Medical Group", location: "San Francisco, CA" },
  { id: 2, name: "Golden Gate Health Center", location: "Oakland, CA" },
]

export function ContentCMS() {
  const [activeTab, setActiveTab] = useState("drafts")
  const [seoTitle, setSeoTitle] = useState("Complete Guide to the I-693 Immigration Medical Exam")

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-card border border-border">
          <TabsTrigger value="drafts" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Drafts (85)
          </TabsTrigger>
          <TabsTrigger value="published" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Published
          </TabsTrigger>
          <TabsTrigger value="archived" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Archived
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Split Layout */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Editor - Left Side */}
        <Card className="border-border bg-card lg:col-span-2">
          <CardContent className="p-6">
            {/* Title */}
            <h1 className="text-2xl font-bold text-foreground mb-6">
              The Complete Guide to the I-693 Exam
            </h1>

            {/* Rich Text Editor Placeholder */}
            <div className="space-y-4 rounded-lg border border-border bg-background p-6">
              <h2 className="text-lg font-semibold text-foreground">
                What is the I-693 Immigration Medical Exam?
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                The I-693 form, officially known as the Report of Medical Examination and Vaccination 
                Record, is a crucial document required by U.S. Citizenship and Immigration Services 
                (USCIS) for most green card applicants.
              </p>
              
              <h2 className="text-lg font-semibold text-foreground mt-6">
                Who Needs to Complete the I-693?
              </h2>
              <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                <li>Green card applicants (adjustment of status)</li>
                <li>Certain visa applicants at U.S. consulates</li>
                <li>Refugees applying for adjustment of status</li>
                <li>Some waiver applicants</li>
              </ul>

              <h2 className="text-lg font-semibold text-foreground mt-6">
                Finding a Civil Surgeon
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                Only USCIS-designated civil surgeons can perform the I-693 medical examination. 
                You can find a civil surgeon near you using our directory or the USCIS website. 
                Many of our listed providers offer multilingual services to better serve diverse communities.
              </p>

              <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
                <span className="font-medium">Word count:</span> 847
                <span className="mx-2">|</span>
                <span className="font-medium">Reading time:</span> 4 min
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Settings Panel - Right Side */}
        <Card className="border-border bg-card">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold text-foreground">
                Article Settings
              </CardTitle>
              <Badge variant="secondary" className="bg-warning/20 text-warning">
                Draft
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* SEO Meta Title */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                SEO Meta Title
              </label>
              <Input
                value={seoTitle}
                onChange={(e) => setSeoTitle(e.target.value)}
                className="bg-background border-input"
              />
              <div className="flex items-center justify-between">
                <Progress 
                  value={(seoTitle.length / 60) * 100} 
                  className="h-1.5 flex-1 mr-3"
                />
                <span className="text-xs text-muted-foreground">
                  {seoTitle.length}/60
                </span>
              </div>
            </div>

            {/* SEO Description */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                SEO Description
              </label>
              <Textarea
                placeholder="Enter meta description..."
                className="bg-background border-input resize-none"
                rows={3}
                defaultValue="Learn everything about the I-693 immigration medical exam, including requirements, costs, and how to find a civil surgeon near you."
              />
            </div>

            {/* Category */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Taxonomy / Category
              </label>
              <Select defaultValue="immigration">
                <SelectTrigger className="bg-background border-input">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="immigration">Immigration Health</SelectItem>
                  <SelectItem value="wellness">General Wellness</SelectItem>
                  <SelectItem value="preventive">Preventive Care</SelectItem>
                  <SelectItem value="mental">Mental Health</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Linked Clinics */}
            <div className="space-y-3">
              <label className="text-sm font-medium text-foreground">
                Linked Clinics
              </label>
              <div className="space-y-2">
                {linkedClinics.map((clinic) => (
                  <div
                    key={clinic.id}
                    className="flex items-center justify-between rounded-lg border border-border bg-background p-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                        <Building2 className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{clinic.name}</p>
                        <p className="text-xs text-muted-foreground">{clinic.location}</p>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" className="h-6 w-6">
                      <X className="h-3 w-3 text-muted-foreground" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4 border-t border-border">
              <Button variant="outline" className="flex-1 border-input">
                Save Draft
              </Button>
              <Button className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90">
                Publish Now
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
