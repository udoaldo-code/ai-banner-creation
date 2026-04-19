import Link from "next/link";
import { twMerge } from "tailwind-merge";

const VALUE_COLORS = {
  default: "text-gray-900",
  yellow: "text-yellow-600",
  green: "text-green-600",
  red: "text-red-600",
  blue: "text-blue-600",
  purple: "text-purple-600",
} as const;

interface StatCardProps {
  label: string;
  value: number | string;
  sub?: string;
  color?: keyof typeof VALUE_COLORS;
  href?: string;
}

export function StatCard({ label, value, sub, color = "default", href }: StatCardProps) {
  const inner = (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm px-5 py-4">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={twMerge("text-3xl font-bold mt-1 tabular-nums", VALUE_COLORS[color])}>
        {value === null || value === undefined ? "—" : value}
      </p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block hover:shadow-md transition-shadow rounded-xl">
        {inner}
      </Link>
    );
  }

  return inner;
}
