import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { ACTION_ICON } from "@/lib/dashboard";
import type { ActivityEntry } from "@/lib/dashboard";

interface ActivityFeedProps {
  entries: ActivityEntry[];
  emptyMessage?: string;
}

export function ActivityFeed({ entries, emptyMessage = "No activity yet." }: ActivityFeedProps) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-gray-400 text-center py-8">{emptyMessage}</p>
    );
  }

  return (
    <div className="divide-y divide-gray-50">
      {entries.map((entry) => {
        const icon = ACTION_ICON[entry.action] ?? "•";
        const age = formatDistanceToNow(entry.createdAt, { addSuffix: true });

        return (
          <div key={entry.id} className="flex items-start gap-3 px-6 py-3">
            <span className="text-base mt-0.5 shrink-0 select-none w-5 text-center">{icon}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-gray-700 leading-snug">
                {entry.requestId ? (
                  <Link
                    href={`/requests/${entry.requestId}`}
                    className="hover:underline"
                  >
                    {entry.label}
                  </Link>
                ) : (
                  entry.label
                )}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">{age}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
