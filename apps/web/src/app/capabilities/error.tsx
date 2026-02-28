"use client";

export default function CapabilitiesError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <p className="text-lg font-medium text-foreground">Something went wrong</p>
      <p className="mt-2 text-sm text-muted-foreground">
        We couldn&rsquo;t load the capabilities. Please try again.
      </p>
      <button
        onClick={reset}
        className="mt-4 inline-flex h-8 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Try again
      </button>
    </div>
  );
}
