import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { config, proxy } from "./proxy";

describe("モニターの認証", () => {
  beforeEach(() => {
    vi.stubEnv("ADMIN_USER", "staff");
    vi.stubEnv("ADMIN_PASSWORD", "test-password");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("モニターとその配下を認証対象にし、参加者画面は対象にしない", () => {
    for (const url of ["/monitor", "/monitor/nested", "/admin"]) {
      expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url })).toBe(true);
    }
    expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: "/" })).toBe(false);
  });

  it("未認証のモニターにはパスワード入力を要求する", () => {
    const response = proxy(new NextRequest("https://example.com/monitor"));
    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toContain("Basic");
  });

  it("管理画面と同じ認証情報でモニターを開ける", () => {
    const response = proxy(new NextRequest("https://example.com/monitor", {
      headers: { authorization: `Basic ${btoa("staff:test-password")}` },
    }));
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});
