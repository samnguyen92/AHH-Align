import { notFound } from "next/navigation"
import { ArticleEditor } from "@/components/admin/articles/article-editor"
import { getAdminArticleById, getAdminArticles } from "@/services/admin-service"

export const dynamic = "force-dynamic"

interface AdminArticleEditorPageProps {
  params: Promise<{ id: string }>
}

export default async function AdminArticleEditorPage({
  params,
}: AdminArticleEditorPageProps) {
  const { id } = await params
  const [article, articlesData] = await Promise.all([
    getAdminArticleById(id),
    getAdminArticles(100),
  ])

  if (!article) {
    notFound()
  }

  return <ArticleEditor article={article} articles={articlesData.articles} />
}
