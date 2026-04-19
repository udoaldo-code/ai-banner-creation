import Link from "next/link";
import { getSession } from "@/lib/auth";
import { canViewAllRequests } from "@/lib/permissions";
import { db } from "@/lib/db";
import { Header } from "@/components/layout/header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  STATUS_LABELS,
  STATUS_COLORS,
  PRIORITY_COLORS,
  PRIORITY_LABELS,
  type RequestStatus,
  type Role,
} from "@/types";
import { formatDistanceToNow } from "date-fns";

const STATUS_TABS: { value: RequestStatus | "ALL"; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "DRAFT", label: "Draft" },
  { value: "SUBMITTED", label: "Submitted" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "IN_REVIEW", label: "In Review" },
  { value: "REVISION_REQUESTED", label: "Revision" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "CANCELLED", label: "Cancelled" },
];

interface PageProps {
  searchParams: Promise<{ status?: string; q?: string; priority?: string }>;
}

export default async function RequestsPage({ searchParams }: PageProps) {
  const { status, q, priority } = await searchParams;
  const session = await getSession();
  if (!session?.user) return null;

  const isPrivileged = canViewAllRequests(session.user.role as Role);

  const requests = await db.request.findMany({
    where: {
      ...(isPrivileged ? {} : { requesterId: session.user.id }),
      ...(status && status !== "ALL" ? { status: status as never } : {}),
      ...(priority ? { priority: priority as never } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { campaignName: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
    include: {
      requester: { select: { name: true, email: true } },
      template: { select: { name: true, primaryColor: true } },
      _count: { select: { attachments: true, comments: true, generationRuns: true } },
    },
  }).catch(() => []);

  const activeStatus = status ?? "ALL";

  return (
    <div>
      <Header
        title={isPrivileged ? "All Requests" : "My Requests"}
        description={`${requests.length} ${requests.length === 1 ? "request" : "requests"}`}
        action={
          <Link href="/requests/new">
            <Button size="sm">New Request</Button>
          </Link>
        }
      />

      {/* Filters row */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        {/* Search */}
        <form method="GET" className="flex-1">
          {/* Preserve other params */}
          {status && <input type="hidden" name="status" value={status} />}
          {priority && <input type="hidden" name="priority" value={priority} />}
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search by title or campaign…"
            className="w-full max-w-xs rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </form>

        {/* Priority filter */}
        <div className="flex gap-1.5">
          {[
            { value: "", label: "Any Priority" },
            { value: "URGENT", label: "Urgent" },
            { value: "HIGH", label: "High" },
            { value: "NORMAL", label: "Normal" },
          ].map((p) => (
            <Link
              key={p.value}
              href={buildUrl({ status, q, priority: p.value || undefined })}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                (priority ?? "") === p.value
                  ? "bg-gray-800 text-white"
                  : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              {p.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Status tabs */}
      <div className="mb-4 flex gap-1 overflow-x-auto pb-1">
        {STATUS_TABS.map((tab) => (
          <Link
            key={tab.value}
            href={buildUrl({ status: tab.value === "ALL" ? undefined : tab.value, q, priority })}
            className={`shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              activeStatus === tab.value
                ? "bg-blue-600 text-white"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {/* Table */}
      {requests.length === 0 ? (
        <Card>
          <div className="px-6 py-12 text-center">
            <p className="text-gray-500">
              {q ? `No requests matching "${q}"` : "No requests yet."}
            </p>
            <Link href="/requests/new">
              <Button className="mt-4">Create your first request</Button>
            </Link>
          </div>
        </Card>
      ) : (
        <Card>
          <div className="divide-y divide-gray-100">
            {requests.map((req) => (
              <Link
                key={req.id}
                href={`/requests/${req.id}`}
                className="flex items-start gap-4 px-6 py-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-gray-900 truncate">{req.title}</p>
                    {req.priority !== "NORMAL" && (
                      <span
                        className={`text-xs rounded-full px-2 py-0.5 font-medium ${PRIORITY_COLORS[req.priority]}`}
                      >
                        {PRIORITY_LABELS[req.priority]}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5 truncate">
                    {req.campaignName}
                    {isPrivileged && ` · ${req.requester.name ?? req.requester.email}`}
                    {" · "}
                    {req.platforms.join(", ")}
                    {req.deadline
                      ? ` · Due ${new Date(req.deadline).toLocaleDateString()}`
                      : ""}
                  </p>
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400">
                    {req._count.generationRuns > 0 && (
                      <span>{req._count.generationRuns} run{req._count.generationRuns !== 1 ? "s" : ""}</span>
                    )}
                    {req._count.attachments > 0 && (
                      <span>{req._count.attachments} file{req._count.attachments !== 1 ? "s" : ""}</span>
                    )}
                    {req._count.comments > 0 && (
                      <span>{req._count.comments} comment{req._count.comments !== 1 ? "s" : ""}</span>
                    )}
                    <span>{formatDistanceToNow(req.updatedAt, { addSuffix: true })}</span>
                  </div>
                </div>
                <div className="shrink-0 flex items-center gap-2 mt-0.5">
                  {req.template && (
                    <div
                      className="h-4 w-4 rounded-full border border-gray-200"
                      style={{ backgroundColor: req.template.primaryColor }}
                      title={req.template.name}
                    />
                  )}
                  <Badge className={STATUS_COLORS[req.status as RequestStatus]}>
                    {STATUS_LABELS[req.status as RequestStatus]}
                  </Badge>
                </div>
              </Link>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function buildUrl(params: { status?: string; q?: string; priority?: string }) {
  const sp = new URLSearchParams();
  if (params.status) sp.set("status", params.status);
  if (params.q) sp.set("q", params.q);
  if (params.priority) sp.set("priority", params.priority);
  const qs = sp.toString();
  return qs ? `/requests?${qs}` : "/requests";
}
