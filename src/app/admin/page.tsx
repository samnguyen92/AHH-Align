import { DashboardHome } from "@/components/admin/views/dashboard-home"
import { getAdminOverviewData } from "@/services/admin-service"

export const dynamic = "force-dynamic"

export default async function AdminDashboardPage() {
  const data = await getAdminOverviewData()
  return <DashboardHome data={data} />
}
