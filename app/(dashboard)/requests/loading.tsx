export default function RequestsLoading() {
  return (
    <div className="animate-pulse space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          <div className="h-6 w-32 bg-gray-200 rounded" />
          <div className="h-4 w-24 bg-gray-100 rounded" />
        </div>
        <div className="h-8 w-28 bg-gray-200 rounded-md" />
      </div>

      {/* Filter row */}
      <div className="flex gap-2">
        <div className="h-9 w-64 bg-gray-100 rounded-md" />
        <div className="h-9 w-24 bg-gray-100 rounded-md" />
        <div className="h-9 w-20 bg-gray-100 rounded-md" />
      </div>

      {/* Status tabs */}
      <div className="flex gap-1">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="h-8 w-20 bg-gray-100 rounded-md" />
        ))}
      </div>

      {/* List rows */}
      <div className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-start gap-4 px-6 py-4">
            <div className="flex-1 space-y-2">
              <div className="h-4 w-2/3 bg-gray-200 rounded" />
              <div className="h-3 w-1/2 bg-gray-100 rounded" />
              <div className="flex gap-3">
                <div className="h-3 w-12 bg-gray-100 rounded" />
                <div className="h-3 w-16 bg-gray-100 rounded" />
              </div>
            </div>
            <div className="h-6 w-20 bg-gray-100 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
