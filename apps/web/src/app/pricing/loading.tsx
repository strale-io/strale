import { Skeleton } from "@/components/skeleton";

export default function PricingLoading() {
  return (
    <div className="mx-auto max-w-4xl px-8 py-20">
      <Skeleton className="h-12 w-full max-w-xl" />
      <Skeleton className="mt-2 h-12 w-80" />
      <Skeleton className="mt-4 h-5 w-96" />

      <div className="mt-16 grid gap-6 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border bg-card p-6">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="mt-3 h-8 w-36" />
            <Skeleton className="mt-3 h-3 w-full" />
          </div>
        ))}
      </div>

      <div className="mt-16">
        <Skeleton className="h-6 w-36" />
        <div className="mt-8 overflow-hidden rounded-lg border border-border">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between border-b border-border px-4 py-3 last:border-0">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
