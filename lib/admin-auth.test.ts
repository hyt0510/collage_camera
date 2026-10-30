import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { requireAdmin, requireAdminPage } from "./admin-auth";

const basic = (user: string, pass: string) =>
  `Basic ${Buffer.from(`${user}:${pass}`, "utf8").toString("base64")}`;

function request(method: string, headers: Record<string, string> = {}) {
  return new Request("https://example.com/api/submissions", { method, headers });
}

describe("requireAdminPage", () => {
  beforeEach(() => {
    process.env.ADMIN_USER = "admin";
    process.env.ADMIN_PASSWORD = "p@ss:word:日本語";
  });
  afterEach(() => {
    delete process.env.ADMIN_USER;
    delete process.env.ADMIN_PASSWORD;
  });

  it("正しい認証情報なら通す（パスワードに : や日本語を含んでもよい）", () => {
    expect(requireAdminPage(basic("admin", "p@ss:word:日本語"))).toBeNull();
  });

  it("パスワード違い・ユーザー名違い・ヘッダーなしは 401 で再入力を促す", () => {
    for (const header of [basic("admin", "wrong"), basic("root", "p@ss:word:日本語"), null]) {
      const res = requireAdminPage(header);
      expect(res?.status).toBe(401);
      expect(res?.headers.get("WWW-Authenticate")).toContain("Basic");
    }
  });

  it("壊れたヘッダーでも例外を投げずに 401 を返す", () => {
    for (const header of ["Basic", "Basic !!!", "Bearer abc", `Basic ${btoa("no-colon")}`]) {
      expect(requireAdminPage(header)?.status).toBe(401);
    }
  });

  it("環境変数が未設定なら素通りさせず 503 を返す", () => {
    delete process.env.ADMIN_PASSWORD;
    expect(requireAdminPage(basic("admin", ""))?.status).toBe(503);
  });
});

describe("requireAdmin", () => {
  beforeEach(() => {
    process.env.ADMIN_USER = "admin";
    process.env.ADMIN_PASSWORD = "secret";
  });
  afterEach(() => {
    delete process.env.ADMIN_USER;
    delete process.env.ADMIN_PASSWORD;
  });

  it("同じサイトからの認証済みリクエストは通す", () => {
    const req = request("DELETE", {
      authorization: basic("admin", "secret"),
      origin: "https://example.com",
      host: "example.com",
    });
    expect(requireAdmin(req)).toBeNull();
  });

  it("別サイトからの書き込みは認証済みでも 403 で弾く", () => {
    const req = request("DELETE", {
      authorization: basic("admin", "secret"),
      origin: "https://evil.example",
      host: "example.com",
    });
    expect(requireAdmin(req)?.status).toBe(403);
  });

  it("認証なしの削除リクエストは 401 で弾く", () => {
    expect(requireAdmin(request("DELETE"))?.status).toBe(401);
  });
});
