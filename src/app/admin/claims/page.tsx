import { ClaimRequests } from "@/components/admin/views/claim-requests"
import { getAdminClaims } from "@/services/admin-service"

export const dynamic = "force-dynamic"

export default async function AdminClaimsPage() {
  const claims = await getAdminClaims()
  return <ClaimRequests claims={claims} />
}
