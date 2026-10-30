import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requireAdmin, requireAdminPage } from "@/lib/admin-auth";
import { requirePrint } from "@/lib/print-auth";

const basic = (user: string, password: string) =>
  `Basic ${Buffer.from(`${user}:${password}`, "utf8").toString("base64")}`;

describe("印刷専用認証", () => {
  beforeEach(() => {
    vi.stubEnv("PRINT_PASSWORD", "print:日本語-password");
    vi.stubEnv("ADMIN_USER", "staff");
    vi.stubEnv("ADMIN_PASSWORD", "admin-password");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("print と専用パスワードで認証し、管理者の設定には依存しない", () => {
    vi.stubEnv("ADMIN_USER", "");
    vi.stubEnv("ADMIN_PASSWORD", "");
    expect(requirePrint(basic("print", "print:日本語-password"))).toBeNull();
  });

  it.each([
    null,
    basic("print", "wrong"),
    basic("staff", "print:日本語-password"),
    basic("staff", "admin-password"),
    "Basic",
    "Basic !!!",
    "Bearer abc",
    `Basic ${btoa("no-colon")}`,
  ])("未認証や不正な認証情報は印刷専用の再入力を要求する（%s）", (header) => {
    const response = requirePrint(header);
    expect(response?.status).toBe(401);
    expect(response?.headers.get("WWW-Authenticate")).toContain('realm="Collage Print"');
    expect(response?.headers.get("Cache-Control")).toContain("no-store");
  });

  it("印刷用パスワードが未設定ならアクセスを停止する", () => {
    vi.stubEnv("PRINT_PASSWORD", "");
    expect(requirePrint(basic("print", ""))?.status).toBe(503);
  });

  it("印刷担当の認証では管理画面と削除APIにアクセスできない", () => {
    const authorization = basic("print", "print:日本語-password");
    expect(requireAdminPage(authorization)?.status).toBe(401);
    expect(requireAdmin(new Request("https://example.com/api/submissions/work-1", {
      method: "DELETE", headers: { authorization },
    }))?.status).toBe(401);
  });
});
