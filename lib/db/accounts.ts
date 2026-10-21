// The people of UniOS. There is no self sign-up: only these accounts exist.
// Passwords are generated once, per account, into accounts.local.json (never committed);
// ACCOUNTS.local.md next to it lists every login for handing out.
import fs from "node:fs";
import path from "node:path";
import { randomInt } from "node:crypto";

export type Role = "student" | "teacher" | "advisor";
export type Account = { email: string; name: string; role: Role; group?: "IS" | "FIN" };

export const TEACHERS: Account[] = [
  { email: "a.saparova@narxoz.kz", name: "Айгерим Сапарова", role: "teacher" },
  { email: "b.omarov@narxoz.kz", name: "Бауыржан Омаров", role: "teacher" },
  { email: "d.zhaksybekov@narxoz.kz", name: "Даурен Жаксыбеков", role: "teacher" },
  { email: "g.ibraeva@narxoz.kz", name: "Гаухар Ибраева", role: "teacher" },
  { email: "e.musabekov@narxoz.kz", name: "Ержан Мусабеков", role: "teacher" },
];

export const ADVISOR: Account = { email: "g.seitova@narxoz.kz", name: "Гульнара Сейтова", role: "advisor" };

export const STUDENTS: Account[] = [
  { email: "a.nurlanov@narxoz.kz", name: "Алибек Нурланов", role: "student", group: "IS" },
  { email: "a.serikova@narxoz.kz", name: "Айдана Серікова", role: "student", group: "IS" },
  { email: "e.kasymov@narxoz.kz", name: "Ерлан Касымов", role: "student", group: "IS" },
  { email: "t.bekzhanov@narxoz.kz", name: "Тимур Бекжанов", role: "student", group: "IS" },
  { email: "m.ospanova@narxoz.kz", name: "Мадина Оспанова", role: "student", group: "IS" },
  { email: "a.tleubaev@narxoz.kz", name: "Арман Тлеубаев", role: "student", group: "IS" },
  { email: "k.abdrakhmanova@narxoz.kz", name: "Камила Абдрахманова", role: "student", group: "FIN" },
  { email: "s.kim@narxoz.kz", name: "Сабина Ким", role: "student", group: "FIN" },
  { email: "o.kenzhebaev@narxoz.kz", name: "Олжас Кенжебаев", role: "student", group: "FIN" },
  { email: "m.zhanibekova@narxoz.kz", name: "Меруерт Жанибекова", role: "student", group: "FIN" },
];

export const ACCOUNTS: Account[] = [...TEACHERS, ADVISOR, ...STUDENTS];

/** The student whose data tells the fullest story (an absence near the limit, certificates, comments). */
export const MAIN_STUDENT = STUDENTS[0].email;
/** The teacher of «Интернет вещей» and «Основы разработки игр». */
export const MAIN_TEACHER = TEACHERS[0].email;

// turbopackIgnore: a runtime path, so the build doesn't trace (and ship) the whole project with the server.
const FILE = () => path.join(/*turbopackIgnore: true*/ process.cwd(), process.env.ACCOUNTS_FILE || "accounts.local.json");

/** "Nx-kfra-4821": easy to read out and type, ~37 bits. Also used for temporary passwords. */
export function newPassword() {
  const letters = "abcdefghjkmnpqrstuvwxyz";
  const word = Array.from({ length: 4 }, () => letters[randomInt(letters.length)]).join("");
  return `Nx-${word}-${String(randomInt(10000)).padStart(4, "0")}`;
}

/**
 * Password of every account: read from accounts.local.json, creating it (and the readable list) the first time.
 * Accounts added to the list later get a password too; existing ones never change.
 */
export function accountPasswords(): Record<string, string> {
  const file = FILE();
  let saved: Record<string, string> = {};
  try {
    saved = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {}
  let changed = false;
  for (const a of ACCOUNTS)
    if (!saved[a.email]) {
      saved[a.email] = newPassword();
      changed = true;
    }
  if (changed) {
    fs.writeFileSync(file, JSON.stringify(saved, null, 2) + "\n", { mode: 0o600 });
    writeList(saved);
  }
  return saved;
}

const ROLE: Record<Role, string> = { teacher: "Преподаватель", advisor: "Эдвайзер", student: "Студент" };

function writeList(passwords: Record<string, string>) {
  const rows = ACCOUNTS.map(
    (a) => `| ${ROLE[a.role]} | ${a.name} | ${a.group === "IS" ? "ИС-23-1" : a.group === "FIN" ? "ФИН-23-2" : ""} | \`${a.email}\` | \`${passwords[a.email]}\` |`,
  );
  const md = [
    "# Аккаунты UniOS",
    "",
    "Не публикуйте этот файл: в нём пароли. Он не попадает в git (см. .gitignore).",
    "Пароли берутся из `accounts.local.json`; при пересоздании базы (`npm run db:reset`) они остаются прежними.",
    "",
    "| Роль | Имя | Группа | Почта | Пароль |",
    "| --- | --- | --- | --- | --- |",
    ...rows,
    "",
  ].join("\n");
  fs.writeFileSync(path.join(/*turbopackIgnore: true*/ path.dirname(FILE()), "ACCOUNTS.local.md"), md, { mode: 0o600 });
}
