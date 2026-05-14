'use client';

import { useState } from 'react';
import { Loader2, ShieldCheck, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase/client';
import { persistAuthToken } from '@/lib/auth/session-cookie';
import type { AdminUserRole, AdminUserRow } from '@/services/admin-service';

const roleOptions: AdminUserRole[] = ['user', 'provider', 'admin', 'superadmin'];

interface UsersManagementProps {
  users: AdminUserRow[];
  currentUserId: string;
}

function formatDate(value: string | null) {
  if (!value) return 'Never';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}

function roleVariant(role: AdminUserRole) {
  if (role === 'superadmin') return 'default';
  if (role === 'admin') return 'secondary';
  if (role === 'provider') return 'outline';
  return 'ghost';
}

export function UsersManagement({ users, currentUserId }: UsersManagementProps) {
  const [rows, setRows] = useState(users);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function updateRole(userId: string, role: AdminUserRole) {
    setSavingUserId(userId);
    setMessage(null);

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) {
      setMessage('Please sign in again before changing roles.');
      setSavingUserId(null);
      return;
    }

    persistAuthToken(token);

    const response = await fetch(`/api/admin/users/${userId}/role`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ role }),
    });

    const result = await response.json();
    setSavingUserId(null);

    if (!response.ok) {
      setMessage(result.error ?? 'Unable to update user role.');
      return;
    }

    setRows((currentRows) =>
      currentRows.map((row) => (row.id === userId ? { ...row, role } : row))
    );
    setMessage('User role updated.');
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <h2 className="text-2xl font-bold tracking-tight">User Management</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage application roles. Only superadmins can access this page.
          </p>
        </div>
        <Badge className="gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5" />
          Superadmin only
        </Badge>
      </div>

      {message && (
        <div className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-foreground">
          {message}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="border-b border-border bg-muted/40 text-left">
              <tr>
                <th className="px-4 py-3 font-semibold">User</th>
                <th className="px-4 py-3 font-semibold">Role</th>
                <th className="px-4 py-3 font-semibold">Created</th>
                <th className="px-4 py-3 font-semibold">Last sign in</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((user) => (
                <tr key={user.id} className="hover:bg-muted/30">
                  <td className="px-4 py-4">
                    <div className="font-medium text-foreground">
                      {user.name || user.email}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">{user.email}</div>
                  </td>
                  <td className="px-4 py-4">
                    <Badge variant={roleVariant(user.role)} className="capitalize">
                      {user.role}
                    </Badge>
                  </td>
                  <td className="px-4 py-4 text-muted-foreground">
                    {formatDate(user.createdAt)}
                  </td>
                  <td className="px-4 py-4 text-muted-foreground">
                    {formatDate(user.lastSignInAt)}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center justify-end gap-2">
                      <select
                        value={user.role}
                        disabled={savingUserId === user.id}
                        onChange={(event) =>
                          updateRole(user.id, event.target.value as AdminUserRole)
                        }
                        className="h-8 rounded-lg border border-input bg-background px-2 text-sm capitalize outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
                      >
                        {roleOptions.map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </select>
                      {savingUserId === user.id && (
                        <Button disabled size="sm" variant="outline">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Saving
                        </Button>
                      )}
                      {user.id === currentUserId && (
                        <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                          You
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
