export default function RequestDetailLoading() {
  return (
    <div className="animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="space-y-1.5">
          <div className="h-6 w-64 bg-gray-200 rounded" />
          <div className="h-4 w-40 bg-gray-100 rounded" />
        </div>
        <div className="flex gap-2">
          <div className="h-8 w-20 bg-gray-100 rounded-md" />
          <div className="h-8 w-36 bg-gray-200 rounded-md" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Left column */}
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
              <div className="h-4 w-24 bg-gray-200 rounded" />
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="space-y-1">
                  <div className="h-3 w-16 bg-gray-100 rounded" />
                  <div className="h-4 w-full bg-gray-100 rounded" />
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Right column */}
        <div className="col-span-2 space-y-6">
          {/* Banner grid */}
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="h-5 w-32 bg-gray-200 rounded mb-4" />
            <div className="grid grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-36 bg-gray-100 rounded-xl" />
              ))}
            </div>
          </div>

          {/* Attachments + comments */}
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
              <div className="h-4 w-28 bg-gray-200 rounded" />
              <div className="h-16 bg-gray-50 rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
