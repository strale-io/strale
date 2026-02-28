import { Skeleton } from "@/components/skeleton";

export default function CapabilityDetailLoading() {
  return (
    <div className="mx-auto max-w-3xl px-8 py-16">
      <Skeleton className="h-4 w-32" />

      <div className="mt-6">
        <div className="flex flex-wrap items-center gap-3">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-5 w-24 rounded" />
        </div>
        <Skeleton className="mt-2 h-4 w-48" />
        <Skeleton className="mt-4 h-4 w-full" />
        <Skeleton className="mt-1 h-4 w-3/4" />
        <Skeleton className="mt-4 h-8 w-28" />
        <Skeleton className="mt-2 h-4 w-40" />
      </div>

      <div className="mt-12">
        <Skeleton className="h-6 w-32" />
        <div className="mt-4 overflow-hidden rounded-lg border border-border">
          <div className="border-b border-border bg-card px-4 py-3">
            <div className="flex gap-16">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-24" />
            </div>
          </div>
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="border-b border-border px-4 py-3 last:border-0">
              <div className="flex gap-16">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-4 w-8" />
                <Skeleton className="h-4 w-48" />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-12">
        <Skeleton className="h-6 w-40" />
        <div className="mt-4 overflow-hidden rounded-lg border border-border">
          <div className="flex border-b border-border">
            <Skeleton className="mx-2 my-2 h-6 w-12" />
            <Skeleton className="mx-2 my-2 h-6 w-20" />
            <Skeleton className="mx-2 my-2 h-6 w-14" />
          </div>
          <div className="p-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="mt-2 h-3 w-full first:mt-0" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
