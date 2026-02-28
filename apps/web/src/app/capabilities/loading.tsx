import { Skeleton } from "@/components/skeleton";

export default function CapabilitiesLoading() {
  return (
    <div className="mx-auto max-w-[1200px] px-8 py-16">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="mt-3 h-5 w-64" />

      <Skeleton className="mt-8 h-10 max-w-md" />

      <div className="mt-8 flex flex-wrap gap-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-24 rounded-md" />
        ))}
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-start justify-between">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-12" />
            </div>
            <Skeleton className="mt-2 h-3 w-40" />
            <Skeleton className="mt-3 h-3 w-full" />
            <Skeleton className="mt-1 h-3 w-3/4" />
            <Skeleton className="mt-3 h-5 w-20 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
