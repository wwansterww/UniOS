"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui";

/** A form's submit button that stays disabled while the action runs. */
export function SubmitButton(props: React.ComponentProps<typeof Button>) {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending} {...props} />;
}
