import { ContentCMS } from "@/components/admin/views/content-cms"
import { getAdminArticles } from "@/services/admin-service"

export const dynamic = "force-dynamic"

export default async function AdminArticlesPage() {
  const data = await getAdminArticles()
  return <ContentCMS articles={data.articles} counts={data.counts} />
}
