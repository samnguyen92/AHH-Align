"use client"

import { ChangeEvent, FormEvent, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import MDEditor from "@uiw/react-md-editor"
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  Library,
  Plus,
  Save,
  Search,
  Send,
  Upload,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { supabase } from "@/services/supabase-client"
import { persistAuthToken } from "@/lib/auth/session-cookie"
import { cn } from "@/lib/utils"
import type { AdminArticleRow } from "@/services/admin-service"
import type { Article } from "@/types/database"

interface ArticleEditorProps {
  article: Article
  articles: AdminArticleRow[]
}

interface MediaItem {
  name: string
  path: string
  url: string
  size: number | null
  created_at: string | null
}

function statusDot(status: Article["status"]) {
  if (status === "published") return "bg-green-500"
  if (status === "archived") return "bg-gray-400"
  return "bg-blue-500"
}

function statusBadgeClass(status: Article["status"]) {
  if (status === "published") return "bg-green-50 text-green-700"
  if (status === "archived") return "bg-gray-100 text-gray-700"
  return "bg-orange-50 text-orange-700"
}

function relativeTime(value: string | null) {
  if (!value) return "Not yet"
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

function countWords(value: string) {
  return value
    .replace(/[#>*_`|~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean).length
}

function uniqueValues(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))
  )
}

function uniqueImageUrls(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value?.trim()))))
}

export function ArticleEditor({ article, articles }: ArticleEditorProps) {
  const router = useRouter()
  const [title, setTitle] = useState(article.title)
  const [excerpt, setExcerpt] = useState(article.excerpt ?? "")
  const [content, setContent] = useState(article.content)
  const [category, setCategory] = useState(article.category ?? "")
  const [isAddingCategory, setIsAddingCategory] = useState(false)
  const [newCategory, setNewCategory] = useState("")
  const [tags, setTags] = useState<string[]>(article.tags ?? [])
  const [tagInput, setTagInput] = useState("")
  const initialSeoMeta = article.seo_meta as Article["seo_meta"] & { meta_title?: string }
  const [articleImages, setArticleImages] = useState<string[]>(
    uniqueImageUrls([article.seo_meta.og_image, ...(article.seo_meta.images ?? [])])
  )
  const [metaTitle, setMetaTitle] = useState(
    typeof initialSeoMeta.meta_title === "string" ? initialSeoMeta.meta_title : article.title
  )
  const [metaDescription, setMetaDescription] = useState(
    article.seo_meta.description ?? article.excerpt ?? ""
  )
  const [status, setStatus] = useState(article.status)
  const [query, setQuery] = useState("")
  const [message, setMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isMediaOpen, setIsMediaOpen] = useState(false)
  const [mediaLibrary, setMediaLibrary] = useState<MediaItem[]>([])
  const [isLoadingMedia, setIsLoadingMedia] = useState(false)
  const [isUploadingImage, setIsUploadingImage] = useState(false)
  const [mediaMessage, setMediaMessage] = useState<string | null>(null)

  const filteredArticles = articles.filter((row) => {
    const normalizedQuery = query.trim().toLowerCase()
    return (
      !normalizedQuery ||
      row.title.toLowerCase().includes(normalizedQuery) ||
      row.category.toLowerCase().includes(normalizedQuery)
    )
  })

  async function submit(nextStatus?: Article["status"]) {
    setIsSaving(true)
    setMessage(null)

    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token

    if (!token) {
      router.push(`/auth/login?next=/admin/articles/${article.id}`)
      return
    }

    persistAuthToken(token)

    const requestedStatus = nextStatus ?? status
    const nextImages = articleImages.filter(Boolean)
    const response = await fetch(`/api/admin/articles/${article.id}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title,
        excerpt,
        content,
        category,
        tags,
        status: requestedStatus,
        seo_meta: {
          ...article.seo_meta,
          description: metaDescription,
          meta_title: metaTitle,
          og_image: nextImages[0],
          images: nextImages,
        },
      }),
    })

    const result = await response.json()
    setIsSaving(false)

    if (!response.ok) {
      setMessage(result.error ?? "Unable to save article.")
      return
    }

    setStatus(result.article.status)
    setMessage(requestedStatus === "published" ? "Article published." : "Article saved.")
    router.refresh()
  }

  function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    submit()
  }

  const wordCount = countWords(content)
  const readingMinutes = Math.max(1, Math.ceil(wordCount / 220))
  const categoryOptions = uniqueValues(["guide", "insight", article.category, ...articles.map((row) => row.category)])

  function addCategory() {
    const nextCategory = newCategory.trim()
    if (!nextCategory) return
    setCategory(nextCategory)
    setNewCategory("")
    setIsAddingCategory(false)
  }

  function addTag(rawTag = tagInput) {
    const nextTag = rawTag.trim()
    if (!nextTag || tags.some((tag) => tag.toLowerCase() === nextTag.toLowerCase())) return
    setTags((currentTags) => [...currentTags, nextTag])
    setTagInput("")
  }

  function removeTag(tagToRemove: string) {
    setTags((currentTags) => currentTags.filter((tag) => tag !== tagToRemove))
  }

  async function getAccessToken() {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (token) {
      persistAuthToken(token)
    }
    return token
  }

  async function loadMediaLibrary() {
    setIsMediaOpen(true)
    setIsLoadingMedia(true)
    setMediaMessage(null)

    const token = await getAccessToken()
    if (!token) {
      router.push(`/auth/login?next=/admin/articles/${article.id}`)
      return
    }

    const response = await fetch("/api/admin/media", {
      headers: { Authorization: `Bearer ${token}` },
    })
    const result = await response.json()
    setIsLoadingMedia(false)

    if (!response.ok) {
      setMediaMessage(result.error ?? "Unable to load media library.")
      return
    }

    setMediaLibrary(result.media ?? [])
  }

  async function uploadImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    setIsUploadingImage(true)
    setMediaMessage(null)

    const token = await getAccessToken()
    if (!token) {
      router.push(`/auth/login?next=/admin/articles/${article.id}`)
      return
    }

    const formData = new FormData()
    formData.append("file", file)

    const response = await fetch("/api/admin/media", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    })
    const result = await response.json()
    setIsUploadingImage(false)
    event.target.value = ""

    if (!response.ok) {
      setMediaMessage(result.error ?? "Unable to upload image.")
      return
    }

    const media = result.media as MediaItem
    setMediaLibrary((currentMedia) => [media, ...currentMedia])
    addImageToArticle(media.url)
    setMediaMessage("Image uploaded and attached to this article.")
  }

  function addImageToArticle(url: string, insertIntoContent = true) {
    setArticleImages((currentImages) => {
      if (currentImages.includes(url)) {
        return currentImages
      }
      return [...currentImages, url]
    })

    if (insertIntoContent && !content.includes(url)) {
      const altText = title || "Article image"
      setContent((currentContent) => `${currentContent.trim()}\n\n![${altText}](${url})\n`)
    }
  }

  function removeImageFromArticle(url: string) {
    setArticleImages((currentImages) => currentImages.filter((imageUrl) => imageUrl !== url))
  }

  return (
    <form
      id="article-editor-form"
      onSubmit={handleSave}
      className="min-h-[calc(100vh-6rem)] rounded-xl border border-border bg-card"
    >
      <div className="sticky top-16 z-20 flex h-16 items-center justify-between border-b border-border bg-card px-5">
        <Link
          href="/admin/articles"
          className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-input bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          <ArrowLeft className="h-4 w-4" />
          Articles
        </Link>

        <div className="flex items-center gap-3">
          {message && <span className="text-sm text-muted-foreground">{message}</span>}
          <Badge className={cn("capitalize", statusBadgeClass(status))}>{status}</Badge>
          <Button type="submit" variant="outline" disabled={isSaving} className="border-input">
            <Save className="mr-2 h-4 w-4" />
            Save Draft
          </Button>
          <Button
            type="button"
            disabled={isSaving}
            onClick={() => submit("published")}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Send className="mr-2 h-4 w-4" />
            Publish
          </Button>
        </div>
      </div>

      <div
        className="grid items-start"
        style={{ gridTemplateColumns: "320px minmax(0, 1fr) 360px" }}
      >
        <aside className="sticky top-32 max-h-[calc(100vh-8rem)] overflow-y-auto border-r border-border bg-background/40">
          <div className="border-b border-border p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="h-10 rounded-lg bg-card pl-9"
                placeholder="Search articles"
              />
            </div>
          </div>

          <div>
            {filteredArticles.map((row) => {
              const active = row.id === article.id

              return (
                <Link
                  key={row.id}
                  href={`/admin/articles/${row.id}`}
                  className={cn(
                    "block border-b border-border px-5 py-4 transition-colors hover:bg-muted/50",
                    active && "bg-blue-50/80 ring-1 ring-inset ring-blue-200"
                  )}
                >
                  <div className="line-clamp-2 text-sm font-semibold leading-6 text-foreground">
                    {row.title}
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5 capitalize">
                      <span className={cn("h-1.5 w-1.5 rounded-full", statusDot(row.status))} />
                      {row.status}
                    </span>
                    <span>{relativeTime(row.updatedAt)}</span>
                  </div>
                </Link>
              )
            })}
          </div>
        </aside>

        <main className="bg-card px-14 py-10">
          <div className="mx-auto max-w-3xl space-y-7">
            <div className="space-y-3">
              <label className="text-sm font-semibold text-muted-foreground">Title</label>
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="h-auto border-0 bg-transparent px-0 py-1 text-4xl font-bold leading-tight tracking-tight shadow-none focus-visible:ring-0"
              />
            </div>

            <div className="space-y-3">
              <label className="text-sm font-semibold text-muted-foreground">Excerpt</label>
              <Textarea
                value={excerpt}
                onChange={(event) => setExcerpt(event.target.value)}
                rows={4}
                className="resize-none rounded-xl border-border bg-background/60 text-base leading-7"
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <label className="text-sm font-semibold text-muted-foreground">Article Content</label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Rich markdown editor with formatting toolbar and live preview.
                  </p>
                </div>
                <span className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
                  Markdown saved automatically on submit
                </span>
              </div>

              <div data-color-mode="light" className="rounded-xl border border-border bg-background/60 p-2">
                <MDEditor
                  value={content}
                  onChange={(value) => setContent(value ?? "")}
                  height={900}
                  preview="live"
                  visibleDragbar
                  textareaProps={{
                    placeholder: "Write the article content here...",
                    "aria-label": "Article content editor",
                  }}
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 text-sm text-muted-foreground">
              <span>{wordCount.toLocaleString()} words</span>
              <span>•</span>
              <span>{readingMinutes} min read</span>
              <span>•</span>
              <span>Saved {relativeTime(article.updated_at)}</span>
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            </div>
          </div>
        </main>

        <aside className="sticky top-32 max-h-[calc(100vh-8rem)] overflow-y-auto border-l border-border bg-background/40">
          <div className="divide-y divide-border">
            <section className="space-y-4 p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-foreground">Status</h2>
                <Badge className={cn("capitalize", statusBadgeClass(status))}>{status}</Badge>
              </div>
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value as Article["status"])}
                className="h-9 w-full rounded-lg border border-input bg-card px-3 text-sm capitalize text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </select>
            </section>

            <section className="space-y-5 p-5">
              <h2 className="text-sm font-semibold text-foreground">SEO Metadata</h2>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Meta Title</label>
                <Input value={metaTitle} onChange={(event) => setMetaTitle(event.target.value)} className="bg-card" />
                <div className="flex items-center gap-3">
                  <Progress value={Math.min(100, (metaTitle.length / 60) * 100)} className="h-1.5 flex-1" />
                  <span className="text-xs text-green-600">{metaTitle.length}/60</span>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Meta Description</label>
                <Textarea
                  value={metaDescription}
                  onChange={(event) => setMetaDescription(event.target.value)}
                  rows={5}
                  className="resize-none bg-card text-sm leading-6"
                />
                <div className="flex items-center gap-3">
                  <Progress value={Math.min(100, (metaDescription.length / 160) * 100)} className="h-1.5 flex-1" />
                  <span className="text-xs text-green-600">{metaDescription.length}/160</span>
                </div>
              </div>
            </section>

            <section className="space-y-4 p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Images</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    First image is used as the article cover.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={loadMediaLibrary}
                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2 text-xs font-medium hover:bg-muted"
                >
                  <Library className="h-3.5 w-3.5" />
                  Media
                </button>
              </div>

              {articleImages.length > 0 ? (
                <div className="space-y-3">
                  {articleImages.map((imageUrl, index) => (
                    <div key={imageUrl} className="overflow-hidden rounded-xl border border-border bg-card">
                      <img
                        src={imageUrl}
                        alt={`${title} image ${index + 1}`}
                        className="aspect-video w-full object-cover"
                      />
                      <div className="flex items-center justify-between gap-2 p-2">
                        <Badge variant={index === 0 ? "default" : "outline"}>
                          {index === 0 ? "Cover" : `Image ${index + 1}`}
                        </Badge>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => addImageToArticle(imageUrl)}
                            className="rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-muted"
                          >
                            Insert
                          </button>
                          <button
                            type="button"
                            onClick={() => removeImageFromArticle(imageUrl)}
                            className="rounded-md px-2 py-1 text-xs font-medium text-destructive hover:bg-muted"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                  No images attached to this article.
                </div>
              )}

              <label className="flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium hover:bg-muted">
                <Upload className="h-4 w-4" />
                {isUploadingImage ? "Uploading..." : "Upload image"}
                <input
                  type="file"
                  accept="image/*"
                  onChange={uploadImage}
                  disabled={isUploadingImage}
                  className="sr-only"
                />
              </label>

              {isMediaOpen && (
                <div className="space-y-3 rounded-xl border border-border bg-card p-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Supabase Media Library</h3>
                    <button
                      type="button"
                      onClick={() => setIsMediaOpen(false)}
                      className="rounded-md p-1 hover:bg-muted"
                      aria-label="Close media library"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {mediaMessage && (
                    <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                      {mediaMessage}
                    </p>
                  )}

                  {isLoadingMedia ? (
                    <p className="text-sm text-muted-foreground">Loading media...</p>
                  ) : mediaLibrary.length > 0 ? (
                    <div className="grid max-h-80 grid-cols-2 gap-2 overflow-y-auto">
                      {mediaLibrary.map((media) => (
                        <button
                          key={media.path}
                          type="button"
                          onClick={() => addImageToArticle(media.url)}
                          className="group overflow-hidden rounded-lg border border-border bg-background text-left hover:border-primary"
                        >
                          <img
                            src={media.url}
                            alt={media.name}
                            className="aspect-video w-full object-cover"
                          />
                          <span className="block truncate px-2 py-1 text-xs text-muted-foreground group-hover:text-foreground">
                            {media.name}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No media found in Supabase Storage yet.
                    </p>
                  )}
                </div>
              )}
            </section>

            <section className="space-y-4 p-5">
              <h2 className="text-sm font-semibold text-foreground">Taxonomy</h2>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Category</label>
                <select
                  value={isAddingCategory ? "__add_new__" : category}
                  onChange={(event) => {
                    if (event.target.value === "__add_new__") {
                      setIsAddingCategory(true)
                      return
                    }
                    setIsAddingCategory(false)
                    setCategory(event.target.value)
                  }}
                  className="h-9 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
                >
                  {categoryOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                  <option value="__add_new__">+ Add new category</option>
                </select>
                {isAddingCategory && (
                  <div className="flex gap-2">
                    <Input
                      value={newCategory}
                      onChange={(event) => setNewCategory(event.target.value)}
                      className="bg-card"
                      placeholder="New category"
                    />
                    <Button type="button" size="sm" onClick={addCategory}>
                      Add
                    </Button>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">Tags</label>
                <div className="flex flex-wrap gap-2">
                  {tags.length > 0 ? (
                    tags.map((tag) => (
                      <Badge key={tag} variant="outline" className="gap-1 pr-1">
                        {tag}
                        <button
                          type="button"
                          onClick={() => removeTag(tag)}
                          className="rounded-full p-0.5 hover:bg-muted"
                          aria-label={`Remove ${tag}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))
                  ) : (
                    <span className="text-sm text-muted-foreground">No tags</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Input
                    value={tagInput}
                    onChange={(event) => setTagInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === ",") {
                        event.preventDefault()
                        addTag()
                      }
                    }}
                    className="bg-card"
                    placeholder="Add tag"
                  />
                  <Button type="button" size="sm" onClick={() => addTag()}>
                    <Plus className="h-4 w-4" />
                    Add
                  </Button>
                </div>
              </div>
            </section>

            <section className="space-y-4 p-5">
              <h2 className="text-sm font-semibold text-foreground">Information</h2>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Words</dt>
                  <dd className="font-medium text-foreground">{wordCount.toLocaleString()}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Read time</dt>
                  <dd className="font-medium text-foreground">{readingMinutes} min</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Updated</dt>
                  <dd className="font-medium text-foreground">{relativeTime(article.updated_at)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Published</dt>
                  <dd className="font-medium text-foreground">{relativeTime(article.published_at)}</dd>
                </div>
              </dl>
            </section>

            <section className="space-y-3 p-5">
              <h2 className="text-sm font-semibold text-foreground">Actions</h2>
              <Button type="submit" disabled={isSaving} className="h-10 w-full">
                <Save className="mr-2 h-4 w-4" />
                Save Changes
              </Button>
              <Button
                type="button"
                disabled={isSaving}
                onClick={() => submit("published")}
                className="h-10 w-full bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Send className="mr-2 h-4 w-4" />
                Publish Now
              </Button>
              {status === "published" && (
                <Link
                  href={`/insights/${article.slug}`}
                  target="_blank"
                  className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                >
                  <ExternalLink className="h-4 w-4" />
                  View Live
                </Link>
              )}
            </section>
          </div>
        </aside>
      </div>
    </form>
  )
}
