import { ClinicsManagement } from "@/components/admin/views/clinics-management"
import { getAdminClinics } from "@/services/admin-service"

export const dynamic = "force-dynamic"

export default async function AdminClinicsPage() {
  const data = await getAdminClinics()
  return <ClinicsManagement clinics={data.clinics} total={data.total} />
}
