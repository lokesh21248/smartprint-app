/**
 * loading.tsx — Skeleton shown while the order detail page fetches server-side.
 *
 * Next.js App Router automatically renders this while the async page.tsx
 * is resolving. Without this file, the user sees a blank white screen.
 */
export default function OrderDetailLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Back + title skeleton */}
      <div className="flex items-center gap-4">
        <div className="w-9 h-9 rounded-xl bg-slate-100" />
        <div className="space-y-2">
          <div className="h-6 w-48 bg-slate-100 rounded-lg" />
          <div className="h-3 w-32 bg-slate-100 rounded-lg" />
        </div>
        <div className="ml-auto h-7 w-24 bg-slate-100 rounded-full" />
      </div>

      {/* Status timeline skeleton */}
      <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-4">
        <div className="h-4 w-32 bg-slate-100 rounded-lg" />
        <div className="flex items-center gap-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex-1 flex items-center gap-1">
              <div className="w-8 h-8 rounded-full bg-slate-100 shrink-0" />
              {i < 5 && <div className="flex-1 h-0.5 bg-slate-100" />}
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left panel */}
        <div className="lg:col-span-2 space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-2xl border border-slate-100 p-5 space-y-3">
              <div className="h-4 w-24 bg-slate-100 rounded-lg" />
              <div className="h-10 w-full bg-slate-100 rounded-xl" />
              <div className="h-10 w-full bg-slate-100 rounded-xl" />
            </div>
          ))}
          {/* Action button skeleton */}
          <div className="h-12 w-full bg-slate-100 rounded-xl" />
        </div>

        {/* Right panel */}
        <div className="lg:col-span-3 space-y-4">
          <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-3">
            <div className="h-4 w-20 bg-slate-100 rounded-lg" />
            <div className="h-16 w-full bg-slate-100 rounded-xl" />
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex justify-between">
              <div className="h-4 w-32 bg-slate-100 rounded-lg" />
              <div className="h-8 w-24 bg-slate-100 rounded-lg" />
            </div>
            <div className="h-80 bg-slate-50" />
          </div>
        </div>
      </div>
    </div>
  );
}
