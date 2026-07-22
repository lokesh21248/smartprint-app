import { Loader2 } from "lucide-react";

export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      {/* User Info Card Skeleton */}
      <div className="bg-white rounded-2xl p-6 border border-[#E5E7EB] shadow-sm flex flex-wrap gap-6 items-center">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gray-100 animate-pulse" />
            <div className="space-y-2">
              <div className="h-2 w-12 bg-gray-100 rounded animate-pulse" />
              <div className="h-4 w-24 bg-gray-100 rounded animate-pulse" />
            </div>
          </div>
        ))}
      </div>

      {/* Pending Orders Banner Skeleton */}
      <div className="h-16 w-full bg-gray-100 rounded-xl animate-pulse" />

      {/* Stats Section Skeleton */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 bg-white rounded-2xl border border-[#E5E7EB] shadow-sm p-4 flex flex-col justify-between">
            <div className="h-4 w-20 bg-gray-100 rounded animate-pulse" />
            <div className="h-6 w-16 bg-gray-100 rounded animate-pulse mt-2" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          {/* New Orders Feed Skeleton */}
          <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-sm p-6 space-y-4">
            <div className="h-6 w-32 bg-gray-100 rounded animate-pulse mb-4" />
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 w-full bg-gray-50 rounded-xl animate-pulse" />
            ))}
          </div>
        </div>
        <div>
          {/* Quick Actions Skeleton */}
          <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-sm p-6 space-y-4">
            <div className="h-6 w-32 bg-gray-100 rounded animate-pulse mb-4" />
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 w-full bg-gray-50 rounded-xl animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
