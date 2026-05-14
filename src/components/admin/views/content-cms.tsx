"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import {
  CheckCircle2,
  Edit3,
  ExternalLink,
  FileText,
  Plus,
  Search,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import type { AdminArticleRow } from "@/services/admin-service"

type ArticleTab = "all" | "draft" | "published" | "archived"

const tabs: Array<{ value: ArticleTab; label: string }> = [
  { value: "all", label: "All" },
  { value: "draft", label: "Drafts (AI Generated)" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
]

function statusDot(status: AdminArticleRow["status"]) {
  if (status === "published") return "bg-green-500"
  if (status === "archived") return "bg-gray-400"
  return "bg-blue-500"
}

function statusBadgeClass(status: AdminArticleRow["status"]) {
  if (status === "published") return "bg-green-50 text-green-700"
  if (status === "archived") return "bg-gray-100 text-gray-700"
  return "bg-orange-50 text-orange-700"
}

function relativeTime(value: string) {
  const diffMs = Date.now() - new Date(value).getTime()
  const minutes = Math.max(0, Math.floor(diffMs / 60000))
  if (minutes < 1) return "Just now"
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`
  const days = Math.floor(hours / 24)
  if (days < 14) return `${days} day${days === 1 ? "" : "s"} ago`
  const weeks = Math.floor(days / 7)
  return `${weeks} week${weeks === 1 ? "" : "s"} ago`
}

function cleanMarkdownPreview(content: string) {
  return content
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/\[[^\]]+\]\([^)]+\)/g, (match) => match.replace(/\]\([^)]+\)/, "").replace("[", ""))
    .replace(/[#>*_`|~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function ContentCMS({
  articles,
  counts,
}: {
  articles: AdminArticleRow[]
  counts: Record<"draft" | "published" | "archived", number>
}) {
  const [activeTab, setActiveTab] = useState<ArticleTab>("all")
  const [query, setQuery] = useState("")
  const [selectedId, setSelectedId] = useState(articles[0]?.id ?? "")

  const filteredArticles = useMemo(() => {
    return articles.filter((article) => {
      const matchesTab = activeTab === "all" || article.status === activeTab
      const normalizedQuery = query.trim().toLowerCase()
      const matchesQuery =
        !normalizedQuery ||
        article.title.toLowerCase().includes(normalizedQuery) ||
        article.category.toLowerCase().includes(normalizedQuery)

      return matchesTab && matchesQuery
    })
  }, [activeTab, articles, query])

  const selectedArticle =
    articles.find((article) => article.id === selectedId) ??
    filteredArticles[0] ??
    articles[0]

  const previewText = selectedArticle
    ? cleanMarkdownPreview(selectedArticle.content || selectedArticle.excerpt)
    : ""
  const metaTitleCount = selectedArticle?.title.length ?? 0
  const metaDescriptionCount = selectedArticle?.seoDescription.length ?? 0
  const totalCount = articles.length

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex h-16 items-center justify-between gap-4 border-b border-border px-5">
        <div className="flex h-full items-center gap-6">
          {tabs.map((tab) => {
            const count =
              tab.value === "all"
                ? totalCount
                : tab.value === "draft"
                  ? counts.draft
                  : tab.value === "published"
                    ? counts.published
                    : counts.archived
            const active = activeTab === tab.value

            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => setActiveTab(tab.value)}
                className={cn(
                  "relative flex h-full items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
                  active && "text-foreground"
                )}
              >
                {tab.label}
                {tab.value === "draft" && count > 0 && (
                  <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-semibold text-white">
                    {count}
                  </span>
                )}
                {tab.value !== "draft" && tab.value !== "all" && count > 0 && (
                  <span className="text-xs text-muted-foreground">{count}</span>
                )}
                {active && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-primary" />}
              </button>
            )
          })}
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-10 w-80 rounded-lg border-input bg-background pl-9"
              placeholder="Search articles by title"
            />
          </div>
          <Button className="h-10 gap-2 px-4">
            <Plus className="h-4 w-4" />
            New Article
          </Button>
        </div>
      </div>

      <div
        className="grid h-[calc(100%-4rem)]"
        style={{ gridTemplateColumns: "320px minmax(0, 1fr) 360px" }}
      >
        <aside className="border-r border-border bg-background/40">
          <div className="h-full overflow-y-auto">
            {filteredArticles.map((article) => {
              const active = selectedArticle?.id === article.id

              return (
                <button
                  key={article.id}
                  type="button"
                  onClick={() => setSelectedId(article.id)}
                  className={cn(
                    "block w-full border-b border-border px-5 py-4 text-left transition-colors hover:bg-muted/50",
                    active && "bg-blue-50/80 ring-1 ring-inset ring-blue-200"
                  )}
                >
                  <div className="line-clamp-2 text-sm font-semibold leading-6 text-foreground">
                    {article.title}
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5 capitalize">
                      <span className={cn("h-1.5 w-1.5 rounded-full", statusDot(article.status))} />
                      {article.status}
                    </span>
                    <span>{relativeTime(article.updatedAt)}</span>
                  </div>
                </button>
              )
            })}

            {filteredArticles.length === 0 && (
              <div className="px-5 py-10 text-center text-sm text-muted-foreground">
                No articles match this filter.
              </div>
            )}
          </div>
          <div className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
            Showing {filteredArticles.length} of {totalCount} articles
          </div>
        </aside>

        <main className="overflow-y-auto bg-card px-14 py-10">
          {selectedArticle ? (
            <article className="mx-auto max-w-3xl">
              <div className="mb-8 flex items-center gap-2">
                <Badge variant="outline" className="capitalize">
                  {selectedArticle.status}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {selectedArticle.readingMinutes} min read
                </span>
                <span className="text-sm text-muted-foreground">
                  {selectedArticle.wordCount.toLocaleString()} words
                </span>
              </div>

              <h1 className="text-4xl font-bold leading-tight tracking-tight text-foreground">
                {selectedArticle.title}
              </h1>
              <p className="mt-6 text-lg leading-8 text-muted-foreground">
                {selectedArticle.excerpt}
              </p>

              <div className="my-10 rounded-xl border border-blue-200 bg-blue-50/50 p-5">
                <div className="flex items-start gap-3">
                  <FileText className="mt-1 h-5 w-5 shrink-0 text-primary" />
                  <div>
                    <h2 className="font-semibold text-foreground">Editorial preview</h2>
                    <p className="mt-2 leading-7 text-muted-foreground">
                      {previewText.slice(0, 720)}
                      {previewText.length > 720 ? "..." : ""}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-6 text-base leading-8 text-foreground">
                <h2 className="text-2xl font-bold">Content Quality Notes</h2>
                <p>
                  Use the dedicated editor to revise the full article body, tune SEO
                  metadata, and publish changes. This CMS view is optimized for scanning
                  article status, reviewing a clean content preview, and checking publish
                  readiness without leaving the article queue.
                </p>

                <h3 className="text-xl font-semibold">Quick Checklist</h3>
                <ol className="list-decimal space-y-2 pl-6">
                  <li>Confirm the title is clear and search focused.</li>
                  <li>Review excerpt and SEO description length.</li>
                  <li>Check word count against the target content type.</li>
                  <li>Open the editor before publishing substantial changes.</li>
                </ol>
              </div>

              <div className="mt-10 flex items-center justify-end gap-2 text-sm text-muted-foreground">
                <span>{selectedArticle.wordCount.toLocaleString()} words</span>
                <span>•</span>
                <span>Saved {relativeTime(selectedArticle.updatedAt)}</span>
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              </div>
            </article>
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              Select an article to preview.
            </div>
          )}
        </main>

        <aside className="overflow-y-auto border-l border-border bg-background/40">
          {selectedArticle && (
            <div className="divide-y divide-border">
              <section className="space-y-4 p-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-foreground">Status</h2>
                  <Badge className={cn("capitalize", statusBadgeClass(selectedArticle.status))}>
                    {selectedArticle.status}
                  </Badge>
                </div>
                <select
                  value={selectedArticle.status}
                  disabled
                  className="h-9 w-full rounded-lg border border-input bg-card px-3 text-sm capitalize text-foreground outline-none"
                >
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                  <option value="archived">Archived</option>
                </select>
              </section>

              <section className="space-y-5 p-5">
                <h2 className="text-sm font-semibold text-foreground">SEO Metadata</h2>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">
                    Meta Title
                  </label>
                  <Input value={selectedArticle.title} readOnly className="bg-card" />
                  <div className="flex items-center gap-3">
                    <Progress value={Math.min(100, (metaTitleCount / 60) * 100)} className="h-1.5 flex-1" />
                    <span className="text-xs text-green-600">{metaTitleCount}/60</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">
                    Meta Description
                  </label>
                  <textarea
                    value={selectedArticle.seoDescription || selectedArticle.excerpt}
                    readOnly
                    rows={4}
                    className="w-full resize-none rounded-lg border border-input bg-card px-3 py-2 text-sm leading-6 outline-none"
                  />
                  <div className="flex items-center gap-3">
                    <Progress value={Math.min(100, (metaDescriptionCount / 160) * 100)} className="h-1.5 flex-1" />
                    <span className="text-xs text-green-600">{metaDescriptionCount}/160</span>
                  </div>
                </div>
              </section>

              <section className="space-y-4 p-5">
                <h2 className="text-sm font-semibold text-foreground">Taxonomy</h2>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">Category</label>
                  <select
                    value={selectedArticle.category}
                    disabled
                    className="h-9 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground outline-none"
                  >
                    <option>{selectedArticle.category}</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">Tags</label>
                  <div className="flex flex-wrap gap-2">
                    {selectedArticle.tags.length > 0 ? (
                      selectedArticle.tags.map((tag) => (
                        <Badge key={tag} variant="outline">
                          {tag}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-sm text-muted-foreground">No tags</span>
                    )}
                  </div>
                </div>
              </section>

              <section className="space-y-4 p-5">
                <h2 className="text-sm font-semibold text-foreground">Information</h2>
                <dl className="space-y-3 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Words</dt>
                    <dd className="font-medium text-foreground">{selectedArticle.wordCount.toLocaleString()}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Read time</dt>
                    <dd className="font-medium text-foreground">{selectedArticle.readingMinutes} min</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Updated</dt>
                    <dd className="font-medium text-foreground">{relativeTime(selectedArticle.updatedAt)}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Published</dt>
                    <dd className="font-medium text-foreground">
                      {selectedArticle.publishedAt ? relativeTime(selectedArticle.publishedAt) : "Not yet"}
                    </dd>
                  </div>
                </dl>
              </section>

              <section className="space-y-3 p-5">
                <h2 className="text-sm font-semibold text-foreground">Actions</h2>
                <Link
                  href={`/admin/articles/${selectedArticle.id}`}
                  className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  <Edit3 className="h-4 w-4" />
                  Open Editor
                </Link>
                {selectedArticle.status === "published" && (
                  <Link
                    href={`/insights/${selectedArticle.slug}`}
                    target="_blank"
                    className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                  >
                    <ExternalLink className="h-4 w-4" />
                    View Live
                  </Link>
                )}
              </section>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
