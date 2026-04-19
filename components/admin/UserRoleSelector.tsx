"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ROLE_LABELS } from "@/types";
import type { Role } from "@/types";

const ROLES: Role[] = ["ADMIN", "CREATIVE_HEAD", "DESIGNER", "APPROVER", "REQUESTER"];

interface Props {
  userId: string;
  currentRole: Role;
  isSelf: boolean;
}

export function UserRoleSelector({ userId, currentRole, isSelf }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newRole = e.target.value as Role;
    if (newRole === currentRole) return;
    setError(null);

    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to update role");
      // Reset select to previous value
      e.target.value = currentRole;
      return;
    }

    startTransition(() => router.refresh());
  }

  if (isSelf) {
    return (
      <span className="text-xs text-gray-400 italic">
        {ROLE_LABELS[currentRole]}
      </span>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <select
        defaultValue={currentRole}
        onChange={handleChange}
        disabled={isPending}
        className="text-xs rounded border border-gray-200 bg-white px-2 py-1 text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABELS[r]}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
