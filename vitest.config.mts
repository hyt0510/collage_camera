import { defineConfig } from "vitest/config";

export default defineConfig({
  // tsconfig の paths（@/*）を解決する
  resolve: { tsconfigPaths: true },
  test: {
    // 純粋関数のテストのみなので node 環境。コンポーネントを試すときは jsdom を追加する
    environment: "node",
    include: ["**/*.test.ts"],
    // .claude/worktrees に置かれる別の作業ツリー（とその node_modules）を拾わないようにする
    exclude: ["**/node_modules/**", ".next", ".claude/**"],
  },
});
