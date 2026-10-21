"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { Button, Field, Input, cn } from "@/components/ui";
import { useT } from "@/components/i18n";
import { LOCALES } from "@/lib/i18n";
import { sendMagicLink, signIn } from "./actions";

/**
 * Language for guests. The cookie is set right here in the browser (no server round trip), so switching works
 * even in a tab opened before the site was rebuilt; then the page re-renders in the new language.
 */
export function LocaleSwitch() {
  const { locale } = useT();
  const router = useRouter();
  const [, start] = useTransition();
  return (
    <div className="flex gap-0.5 text-[13px]">
      {LOCALES.map((l) => (
        <button
          key={l.code}
          type="button"
          onClick={() => {
            document.cookie = `locale=${l.code}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
            start(() => router.refresh());
          }}
          aria-pressed={l.code === locale}
          className={cn("rounded-md px-2 py-1 transition-colors", l.code === locale ? "font-medium text-fg" : "text-muted hover:text-fg")}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}

function PasswordInput(props: React.ComponentProps<"input">) {
  const { t } = useT();
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={show ? "text" : "password"} className="pr-11" />
      <button
        type="button"
        onClick={() => setShow(!show)}
        aria-label={t.auth.showPassword}
        aria-pressed={show}
        className="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted hover:text-fg"
      >
        {show ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
    </div>
  );
}

export function LoginForm({ expired, magic, next }: { expired: boolean; magic: boolean; next?: string }) {
  const { t } = useT();
  const [inState, inAction, inPending] = useActionState(signIn, undefined);
  const [mlState, mlAction, mlPending] = useActionState(sendMagicLink, undefined);
  const state = mlState?.info || mlState?.error ? mlState : inState;

  return (
    <div className="w-full">
      <h2 className="text-[1.75rem] font-semibold">{t.auth.signIn}</h2>
      <p className="mb-7 mt-1.5 text-sm text-muted">{t.auth.welcomeHint}</p>

      {expired && <p className="mb-4 rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn">{t.auth.linkExpired}</p>}
      {state?.error && (
        <p className="mb-4 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger" role="alert">
          {state.error}
        </p>
      )}
      {state?.info && <p className="mb-4 rounded-xl bg-ok-soft px-4 py-3 text-sm text-ok">{state.info}</p>}

      <form action={inAction} className="space-y-4">
        {next && <input type="hidden" name="next" value={next} />}
        <Field label={t.auth.email}>
          <Input name="email" type="email" required autoComplete="username" placeholder="name@narxoz.kz" defaultValue={state?.email} key={state?.email} />
        </Field>
        <Field label={t.auth.password}>
          <PasswordInput name="password" required autoComplete="current-password" />
        </Field>
        <Button type="submit" variant="accent" size="lg" className="w-full shadow-[0_10px_24px_-12px_rgba(196,18,51,0.8)]" disabled={inPending}>
          {t.auth.signIn}
        </Button>
        {magic && (
          <button type="submit" formAction={mlAction} formNoValidate disabled={mlPending} className="w-full text-center text-[13px] text-muted hover:text-fg">
            {t.auth.magic}
          </button>
        )}
      </form>

      <p className="mt-8 border-t border-border pt-5 text-center text-[13px] leading-relaxed text-muted">{t.auth.noSignup}</p>
    </div>
  );
}
