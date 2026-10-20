import Link from "next/link";
import { CourseDot, cn } from "./ui";

type Pair = { course: { id: string; title: string; color: string }; group: { id: string; name: string } };

/** Course × group switcher used by the teacher's gradebook and attendance summary. */
export function CourseGroupChips({ pairs, selected, href }: { pairs: Pair[]; selected: Pair; href: (p: Pair) => string }) {
  if (pairs.length < 2) return null;
  return (
    <div className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
      {pairs.map((p) => {
        const on = p.course.id === selected.course.id && p.group.id === selected.group.id;
        return (
          <Link
            key={p.course.id + p.group.id}
            href={href(p)}
            aria-current={on ? "true" : undefined}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold transition",
              on ? "border-primary bg-primary text-primary-fg" : "border-border bg-surface text-muted hover:text-fg",
            )}
          >
            <CourseDot color={p.course.color} /> {p.course.title} · {p.group.name}
          </Link>
        );
      })}
    </div>
  );
}

/** All course × group pairs of a teacher, and the one picked by ?course=&group= (or the first). */
export function pickPair<C extends { id: string; groups: { id: string }[] }>(courses: C[], course: unknown, group: unknown) {
  const pairs = courses.flatMap((c) => c.groups.map((g) => ({ course: c, group: g as C["groups"][number] })));
  return { pairs, selected: pairs.find((p) => p.course.id === course && p.group.id === group) ?? pairs[0] };
}
