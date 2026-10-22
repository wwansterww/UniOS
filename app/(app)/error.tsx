"use client"; // Error boundaries must be Client Components

import { ErrorView } from "@/components/error-view";

/** A page inside the app failed: the header and navigation stay, only the page area shows the error. */
export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  return <ErrorView error={error} retry={retry} />;
}
