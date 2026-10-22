"use client"; // Error boundaries must be Client Components

import { ErrorView } from "@/components/error-view";

/** Errors outside the app shell (sign-in, check-in). */
export default function RootError({ error, retry }: { error: unknown; retry: () => void }) {
  return <ErrorView error={error} retry={retry} />;
}
