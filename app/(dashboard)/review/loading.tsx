export default function ReviewQueueLoading() {
  return (
    <div className="animate-pulse space-y-4">
      {/* Header */}
      <div className="space-y-1.5">
        <div className="h-6 w-40 bg-gray-200 rounded" />
        <div className="h-4 w-56 bg-gray-100 rounded" />
      </div>

      {/* Section label */}
      <div className="h-4 w-36 bg-gray-200 rounded mt-2" />

      {/* Queue cards */}
      <div className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-6 py-4">
            <div className="h-3 w-3 rounded-full bg-gray-200 shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-4 w-1/2 bg-gray-200 rounded" />
              <div className="h-3 w-1/3 bg-gray-100 rounded" />
            </div>
            <div className="h-8 w-28 bg-gray-100 rounded-md shrink-0" />
          </div>
        ))}
      </div>

      {/* Recent decisions */}
      <div className="h-4 w-40 bg-gray-200 rounded mt-4" />
      <div className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-6 py-3">
            <div className="flex-1 space-y-1">
              <div className="h-4 w-1/3 bg-gray-200 rounded" />
              <div className="h-3 w-1/4 bg-gray-100 rounded" />
            </div>
            <div className="h-6 w-20 bg-gray-100 rounded-full shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}
