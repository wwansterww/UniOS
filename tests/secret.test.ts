import { afterEach, describe, expect, it, vi } from "vitest";
import { appSecret, safeEqual, tokenHash } from "../lib/secret";

afterEach(() => vi.unstubAllEnvs());

describe("appSecret", () => {
  it("uses AUTH_SECRET when it is set", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_SECRET", "a-real-random-secret-from-openssl");
    expect(appSecret()).toBe("a-real-random-secret-from-openssl");
  });

  it("refuses to run in production without AUTH_SECRET (the fallback is public)", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_SECRET", "");
    expect(() => appSecret()).toThrow(/AUTH_SECRET/);
  });

  it("refuses the public development secret in production even if someone copies it", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_SECRET", "uni-dev-secret-change-me-please-32chars");
    expect(() => appSecret()).toThrow(/AUTH_SECRET/);
  });

  it("falls back to the development secret outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("AUTH_SECRET", "");
    expect(appSecret()).toBe("uni-dev-secret-change-me-please-32chars");
  });
});

describe("safeEqual and tokenHash", () => {
  it("matches only the exact secret", () => {
    expect(safeEqual("s3cret-value", "s3cret-value")).toBe(true);
    expect(safeEqual("s3cret-valuE", "s3cret-value")).toBe(false);
    expect(safeEqual("s3cret", "s3cret-value")).toBe(false);
  });

  it("never matches when either side is missing", () => {
    expect(safeEqual(null, "x")).toBe(false);
    expect(safeEqual("x", undefined)).toBe(false);
    expect(safeEqual("", "")).toBe(false);
  });

  it("stores tokens one-way: same input, same hash, no token inside", () => {
    const token = "abcDEF123_-xyz";
    expect(tokenHash(token)).toBe(tokenHash(token));
    expect(tokenHash(token)).not.toContain(token);
    expect(tokenHash(token)).not.toBe(tokenHash(token + "1"));
  });
});
