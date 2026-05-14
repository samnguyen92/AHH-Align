import { UsersManagement } from '@/components/admin/views/users-management';
import { getAdminUsers } from '@/services/admin-service';
import { requireSuperAdminUser } from '@/services/auth-service';

export const dynamic = 'force-dynamic';

export default async function AdminUsersPage() {
  const user = await requireSuperAdminUser();
  const users = await getAdminUsers();

  return <UsersManagement users={users} currentUserId={user.id} />;
}
