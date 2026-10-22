import { afterEach, describe, expect, it, vi } from "vitest";
import { appSecret } from "../lib/secret";

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
