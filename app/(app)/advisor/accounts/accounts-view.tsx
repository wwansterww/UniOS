"use client";

import { useState, useTransition } from "react";
import { Ban, Check, Copy, KeyRound, LockOpen, Plus, Search, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Card, Field, Input, Select, cn } from "@/components/ui";
import { useT } from "@/components/i18n";
import { formatDateTime } from "@/lib/time";
import { createAccount, resetPassword, setBlocked, setStudentGroup, type TempResult } from "../actions";

export type AccountRow = {
  id: string;
  full_name: string;
  email: string;
  role: "student" | "teacher" | "advisor";
  blocked: boolean;
  must_change_password: boolean;
  group_id: string | null;
  last_login: Date | string | null;
};

type Filter = "all" | "teacher" | "student";

const initials = (name: string) =>
  name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("");

/** Everyone who can sign in, with the advisor's tools: add, reset a password, block, move a student. */
export function AccountsView({ accounts, groups, me, domain }: { accounts: AccountRow[]; groups: { id: string; name: string }[]; me: string; domain: string }) {
  const { t, locale } = useT();
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [temp, setTemp] = useState<{ name: string; password: string } | null>(null);
  const [pending, start] = useTransition();
  const roleLabel = { student: t.profile.student, teacher: t.profile.teacher, advisor: t.profile.advisor };

  const list = accounts.filter(
    (a) => (filter === "all" || a.role === filter) && (a.full_name + " " + a.email).toLowerCase().includes(q.trim().toLowerCase()),
  );

  /** Runs an action; a returned temporary password opens the one-time dialog. */
  const act = (fn: () => Promise<TempResult>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(r.message ?? t.common.error);
      if (r.password) setTemp({ name: r.name ?? "", password: r.password });
      else if (r.message) toast.success(r.message);
      after?.();
    });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">{t.admin.hint}</p>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-xl bg-surface-2 p-1">
          {(["all", "teacher", "student"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              className={cn("rounded-lg px-3 py-1.5 text-sm font-medium transition", filter === f ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg")}
            >
              {f === "all" ? t.admin.all : f === "teacher" ? t.admin.teachers : t.admin.students}
            </button>
          ))}
        </div>
        <label className="relative min-w-48 flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.admin.search} aria-label={t.admin.search} className="h-10 pl-9" />
        </label>
        {!adding && (
          <Button onClick={() => setAdding(true)}>
            <UserPlus size={16} /> {t.admin.add}
          </Button>
        )}
      </div>

      {adding && <AddForm groups={groups} domain={domain} pending={pending} onCancel={() => setAdding(false)} onSubmit={(fd) => act(() => createAccount(fd), () => setAdding(false))} />}

      <Card className="overflow-hidden p-0 sm:p-0">
        <ul>
          {list.map((a) => {
            const self = a.id === me;
            return (
              <li key={a.id} className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-4 py-3 last:border-b-0 sm:px-5", a.blocked && "bg-surface-2/60")}>
                <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-semibold", a.blocked ? "bg-border text-muted" : "bg-surface-2")}>
                  {initials(a.full_name)}
                </span>
                <div className="min-w-0 flex-1 basis-56">
                  <p className={cn("truncate font-medium", a.blocked && "text-muted line-through")}>
                    {a.full_name} {self && <span className="font-normal text-muted">· {t.admin.you}</span>}
                  </p>
                  <p className="truncate text-[13px] text-muted">
                    {a.email} · {a.last_login ? `${t.admin.lastLogin}: ${formatDateTime(new Date(a.last_login), locale)}` : t.admin.never}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={a.role === "student" ? "neutral" : "lavender"}>{roleLabel[a.role]}</Badge>
                  {a.blocked && <Badge tone="red">{t.admin.blocked}</Badge>}
                  {a.role === "student" && (
                    <Select
                      aria-label={t.admin.group}
                      value={a.group_id ?? ""}
                      disabled={pending}
                      onChange={(e) => act(() => setStudentGroup(a.id, e.target.value))}
                      className="h-8 w-auto rounded-lg py-0 pr-8 text-[13px]"
                    >
                      <option value="">{t.admin.noGroup}</option>
                      {groups.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </Select>
                  )}
                  {!self && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={pending}
                        title={t.admin.resetPassword}
                        onClick={() => confirm(t.admin.resetConfirm(a.full_name)) && act(() => resetPassword(a.id))}
                      >
                        <KeyRound size={14} /> <span className="hidden md:inline">{t.admin.resetPassword}</span>
                      </Button>
                      <Button
                        variant={a.blocked ? "ghost" : "danger"}
                        size="sm"
                        disabled={pending}
                        title={a.blocked ? t.admin.unblock : t.admin.block}
                        onClick={() => (a.blocked || confirm(t.admin.blockConfirm(a.full_name))) && act(() => setBlocked(a.id, !a.blocked))}
                      >
                        {a.blocked ? <LockOpen size={14} /> : <Ban size={14} />} <span className="hidden md:inline">{a.blocked ? t.admin.unblock : t.admin.block}</span>
                      </Button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      {temp && <TempPassword name={temp.name} password={temp.password} onClose={() => setTemp(null)} />}
    </div>
  );
}

function AddForm({
  groups,
  domain,
  pending,
  onCancel,
  onSubmit,
}: {
  groups: { id: string; name: string }[];
  domain: string;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (fd: FormData) => void;
}) {
  const { t } = useT();
  // Controlled, so a rejected attempt (a taken or foreign email) keeps what was typed.
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("student");
  return (
    <Card>
      <form action={onSubmit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.3fr_1.3fr_0.8fr_0.8fr_auto] lg:items-end">
        <Field label={t.admin.name}>
          <Input name="name" required minLength={3} maxLength={120} autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t.admin.email}>
          <Input name="email" type="email" required placeholder={`name@${domain}`} value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label={t.admin.role}>
          <Select name="role" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="student">{t.profile.student}</option>
            <option value="teacher">{t.profile.teacher}</option>
          </Select>
        </Field>
        <Field label={t.admin.group}>
          <Select name="group_id" disabled={role !== "student"} defaultValue={groups[0]?.id ?? ""}>
            <option value="">{t.admin.noGroup}</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex gap-2">
          <Button type="submit" disabled={pending} className="flex-1">
            <Plus size={16} /> {t.admin.create}
          </Button>
          <Button type="button" variant="ghost" size="icon" onClick={onCancel} aria-label={t.common.cancel}>
            <X size={16} />
          </Button>
        </div>
      </form>
    </Card>
  );
}

/** The temporary password, shown once with a copy button. */
function TempPassword({ name, password, onClose }: { name: string; password: string; onClose: () => void }) {
  const { t } = useT();
  const [copied, setCopied] = useState(false);
  return (
    <div role="dialog" aria-modal="true" aria-label={t.admin.tempTitle} className="fixed inset-0 z-50 grid place-items-center bg-bg/80 px-5 backdrop-blur-md">
      <div className="w-full max-w-sm rounded-[1.75rem] border border-border bg-surface p-6 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.5)] sm:p-7">
        <span className="grid h-11 w-11 place-items-center rounded-full bg-accent-soft text-accent">
          <KeyRound size={20} />
        </span>
        <h2 className="mt-4 text-xl font-semibold">{t.admin.tempTitle}</h2>
        <p className="mt-1 text-sm text-muted">{t.admin.tempHint(name)}</p>
        <p className="mt-5 select-all rounded-2xl bg-surface-2 px-4 py-4 text-center font-mono text-2xl font-semibold tracking-wider">{password}</p>
        <div className="mt-5 flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={async () => {
              await navigator.clipboard.writeText(password);
              setCopied(true);
            }}
          >
            {copied ? <Check size={16} /> : <Copy size={16} />} {t.admin.copy}
          </Button>
          <Button className="flex-1" onClick={onClose}>
            {t.admin.done}
          </Button>
        </div>
      </div>
    </div>
  );
}
