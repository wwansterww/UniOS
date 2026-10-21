import { beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "../lib/db/core";
import { IP_MAX_FAILS, LOCK_MIN, MAX_FAILS, deviceName, loginGuard, passwordProblem, recordAttempt } from "../lib/security";
import { MIN } from "../lib/time";

let db: Db;
const T0 = new Date("2026-10-21T10:00:00Z");
const at = (min: number) => new Date(T0.getTime() + min * MIN);
const fail = (email: string, ip: string, min: number) => recordAttempt(db.q, { email, ip, userAgent: "", ok: false }, at(min));

beforeAll(async () => {
  db = await createDb(undefined, null);
});

describe("sign-in protection", () => {
  it(`locks an email after ${MAX_FAILS} wrong passwords for ${LOCK_MIN} minutes, then lets it try again`, async () => {
    const email = "a.nurlanov@narxoz.kz";
    for (let i = 0; i < MAX_FAILS - 1; i++) await fail(email, "1.1.1.1", i);
    expect(await loginGuard(db.q, email, "1.1.1.1", at(4))).toMatchObject({ locked: false, emailFails: MAX_FAILS - 1 });
    await fail(email, "2.2.2.2", 4); // another network doesn't help
    const g = await loginGuard(db.q, email, "3.3.3.3", at(5));
    expect(g.locked).toBe(true);
    expect(g.retryInMin).toBe(LOCK_MIN - 5);
    expect((await loginGuard(db.q, email, "3.3.3.3", at(LOCK_MIN + 1))).locked).toBe(false);
  });

  it("a successful sign-in clears the count", async () => {
    const email = "s.kim@narxoz.kz";
    for (let i = 0; i < 3; i++) await fail(email, "4.4.4.4", i);
    await recordAttempt(db.q, { email, ip: "4.4.4.4", userAgent: "", ok: true }, at(3));
    expect(await loginGuard(db.q, email, "4.4.4.4", at(4))).toMatchObject({ locked: false, emailFails: 0 });
  });

  it("locks an address that keeps guessing across many emails", async () => {
    for (let i = 0; i < IP_MAX_FAILS; i++) await fail(`guess${i}@narxoz.kz`, "6.6.6.6", i * 0.5);
    expect((await loginGuard(db.q, "someone@narxoz.kz", "6.6.6.6", at(11))).locked).toBe(true);
    expect((await loginGuard(db.q, "someone@narxoz.kz", "7.7.7.7", at(11))).locked).toBe(false);
  });
});

describe("passwords", () => {
  const who = { email: "a.nurlanov@narxoz.kz", full_name: "Алибек Нурланов" };
  it("needs 8+ characters with letters and digits, not built from the name or email", () => {
    expect(passwordProblem("abc12", who)).toBe("short");
    expect(passwordProblem("onlyletters", who)).toBe("weak");
    expect(passwordProblem("12345678", who)).toBe("weak");
    expect(passwordProblem("nurlanov2026", who)).toBe("personal");
    expect(passwordProblem("Алибек2026!", who)).toBe("personal");
    expect(passwordProblem("Ромашка-42-сад", who)).toBeNull();
  });

  it("names the device of a sign-in", () => {
    expect(deviceName("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36")).toBe("Chrome · macOS");
    expect(deviceName("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1")).toBe("Safari · iOS");
  });
});
