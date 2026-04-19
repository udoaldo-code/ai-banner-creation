import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession, canAdmin } from "@/lib/auth";
import { isSlackConfigured } from "@/lib/slack";
import { db } from "@/lib/db";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UserRoleSelector } from "@/components/admin/UserRoleSelector";
import { canManageUsers } from "@/lib/permissions";
import { ROLE_COLORS, ROLE_LABELS, STATUS_LABELS, type Role } from "@/types";

export default async function AdminPage() {
  const session = await getSession();
  if (!session?.user) return null;
  if (!canAdmin(session.user.role as Role)) redirect("/");

  const isSuperAdmin = canManageUsers(session.user.role as Role);
  const slackConfigured = isSlackConfigured();

  const [users, requestStats] = await Promise.all([
    db.user.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { ownedRequests: true } },
      },
    }).catch(() => []),
    db.request.groupBy({
      by: ["status"],
      _count: { status: true },
    }).catch(() => []),
  ]);

  return (
    <div>
      <Header title="Admin" description="User management and platform overview" />

      {/* Quick links */}
      <div className="flex gap-3 mb-6">
        <Link
          href="/admin/slack"
          className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <span
            className={`h-2 w-2 rounded-full ${slackConfigured ? "bg-green-500" : "bg-gray-300"}`}
          />
          Slack Settings
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Request Status Overview */}
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-gray-900">Request Status Overview</h2>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {requestStats.map((stat) => (
                <div key={stat.status} className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">
                    {STATUS_LABELS[stat.status as keyof typeof STATUS_LABELS] ?? stat.status}
                  </span>
                  <span className="text-sm font-semibold text-gray-900">{stat._count.status}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Users */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">Users ({users.length})</h2>
              {isSuperAdmin && (
                <span className="text-xs text-gray-400">Click a role to change it</span>
              )}
            </div>
          </CardHeader>
          <div className="divide-y divide-gray-100 max-h-[28rem] overflow-y-auto">
            {users.map((user) => {
              const role = user.role as Role;
              const isSelf = user.id === session.user.id;
              return (
                <div key={user.id} className="flex items-center justify-between px-6 py-3">
                  <div className="min-w-0 flex-1 pr-3">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {user.name ?? "—"}
                      {isSelf && (
                        <span className="ml-1.5 text-xs text-gray-400">(you)</span>
                      )}
                    </p>
                    <p className="text-xs text-gray-500 truncate">{user.email}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {user._count.ownedRequests} request{user._count.ownedRequests !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {isSuperAdmin ? (
                      <UserRoleSelector
                        userId={user.id}
                        currentRole={role}
                        isSelf={isSelf}
                      />
                    ) : (
                      <Badge className={ROLE_COLORS[role]}>
                        {ROLE_LABELS[role]}
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}
