import React from 'react';
import { Skeleton, SkeletonText } from '../ui';

export function DashboardSkeleton({ isStaff = false }) {
  return (
    <div className="space-y-6 sm:space-y-8 animate-pulse motion-reduce:animate-none" aria-busy="true" aria-label="Memuat data dashboard...">
      {/* Top Header Skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-200/80">
        <div className="flex items-center gap-3">
          <Skeleton className="w-12 h-12 rounded-2xl" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-32 rounded-md" />
            <Skeleton className="h-6 w-48 rounded-md" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-28 rounded-xl" />
          <Skeleton className="h-9 w-9 rounded-xl" />
        </div>
      </div>

      {/* Hero Section Skeleton */}
      {isStaff ? (
        <div className="rounded-2xl border border-slate-200/80 bg-white p-6 space-y-5">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div className="space-y-2">
              <Skeleton className="h-3 w-32 rounded-md" />
              <Skeleton className="h-6 w-56 rounded-md" />
            </div>
            <Skeleton className="h-9 w-28 rounded-xl" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div key={idx} className="p-4 rounded-xl bg-slate-50 border border-slate-200/70 space-y-2">
                <Skeleton className="h-3 w-24 rounded-md" />
                <Skeleton className="h-7 w-32 rounded-md" />
                <Skeleton className="h-2.5 w-20 rounded-md" />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200/80 bg-white p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-2.5">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-28 rounded-md" />
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
              <Skeleton className="h-8 sm:h-10 w-44 rounded-md" />
              <Skeleton className="h-3.5 w-64 rounded-md" />
            </div>
            <Skeleton className="h-11 w-40 rounded-xl" />
          </div>
        </div>
      )}

      {/* Quick Actions Skeleton */}
      <div className="space-y-3">
        <Skeleton className="h-3 w-28 rounded-md" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, idx) => (
            <Skeleton key={idx} className="h-14 rounded-xl" />
          ))}
        </div>
      </div>

      {/* Secondary / Activity Skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
        <div className="space-y-3">
          <Skeleton className="h-3 w-32 rounded-md" />
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 space-y-3">
            <SkeletonText lines={3} />
          </div>
        </div>
        <div className="space-y-3">
          <Skeleton className="h-3 w-32 rounded-md" />
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 space-y-3">
            <SkeletonText lines={3} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default DashboardSkeleton;
