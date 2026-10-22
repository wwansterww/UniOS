import { Skeleton } from "@/components/ui";

/** Shown instantly while a page's data loads: the shape of a header and a few cards. */
export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl" aria-busy="true" aria-live="polite">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="mt-3 h-11 w-72 max-w-full" />
      <Skeleton className="mt-3 h-4 w-56" />
      <div className="mt-10 grid grid-cols-3 gap-3">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
      <Skeleton className="mt-6 h-52 rounded-[1.75rem]" />
      <div className="mt-10 space-y-2">
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </div>
    </div>
  );
}
