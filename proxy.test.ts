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

describe("印刷ページの認証", () => {
  beforeEach(() => {
    vi.stubEnv("PRINT_PASSWORD", "print-password");
    vi.stubEnv("ADMIN_USER", "staff");
    vi.stubEnv("ADMIN_PASSWORD", "admin-password");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("ID入力画面・印刷画面・画像取得を認証対象にする", () => {
    for (const url of ["/print", "/print/work-1", "/print/image/work-1"]) {
      expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url })).toBe(true);
      const response = proxy(new NextRequest(`https://example.com${url}`));
      expect(response.status).toBe(401);
      expect(response.headers.get("WWW-Authenticate")).toContain('realm="Collage Print"');
    }
  });

  it("印刷専用認証で印刷ページを開ける", () => {
    const response = proxy(new NextRequest("https://example.com/print", {
      headers: { authorization: `Basic ${btoa("print:print-password")}` },
    }));
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("管理者の認証情報では印刷ページを開けない", () => {
    const response = proxy(new NextRequest("https://example.com/print", {
      headers: { authorization: `Basic ${btoa("staff:admin-password")}` },
    }));
    expect(response.status).toBe(401);
  });

  it("印刷担当の認証情報では運営画面とモニターを開けない", () => {
    for (const path of ["/admin", "/monitor"]) {
      const response = proxy(new NextRequest(`https://example.com${path}`, {
        headers: { authorization: `Basic ${btoa("print:print-password")}` },
      }));
      expect(response.status).toBe(401);
    }
  });
});
