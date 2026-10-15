import { describe, expect, it } from "vitest";
import { PRIZE_TICKET_DURATION_MS, formatRemaining, getTicketRemainingMs, parsePrizeCode } from "./prize";

describe("parsePrizeCode", () => {
  it("URL の prize パラメータの値を返す", () => {
    expect(parsePrizeCode("https://example.com/?prize=abc123")).toBe("abc123");
  });

  it("解除用の QR（unlock）なら null を返す", () => {
    expect(parsePrizeCode("https://example.com/?unlock=a_1")).toBeNull();
  });

  it("prize の値が空なら null を返す", () => {
    expect(parsePrizeCode("https://example.com/?prize=")).toBeNull();
  });

  it("URL でない文字列なら null を返す", () => {
    expect(parsePrizeCode("abc123")).toBeNull();
  });
});

describe("getTicketRemainingMs", () => {
  const redeemedAt = "2026-10-15T01:00:00.000Z";
  const at = Date.parse(redeemedAt);

  it("交換した直後は10分を返す", () => {
    expect(getTicketRemainingMs(redeemedAt, at)).toBe(PRIZE_TICKET_DURATION_MS);
  });

  it("3分たったら残り7分を返す", () => {
    expect(getTicketRemainingMs(redeemedAt, at + 3 * 60_000)).toBe(7 * 60_000);
  });

  it("10分ちょうどで0を返す", () => {
    expect(getTicketRemainingMs(redeemedAt, at + PRIZE_TICKET_DURATION_MS)).toBe(0);
  });

  it("10分を過ぎても負の値にはしない", () => {
    expect(getTicketRemainingMs(redeemedAt, at + 60 * 60_000)).toBe(0);
  });

  it("交換時刻が未来でも10分を超えない", () => {
    expect(getTicketRemainingMs(redeemedAt, at - 60_000)).toBe(PRIZE_TICKET_DURATION_MS);
  });

  it("日時として読めなければ0を返す", () => {
    expect(getTicketRemainingMs("broken", at)).toBe(0);
  });
});

describe("formatRemaining", () => {
  it("分と2桁の秒で返す", () => {
    expect(formatRemaining(9 * 60_000 + 5_000)).toBe("9:05");
  });

  it("1秒未満の端数は切り上げる", () => {
    expect(formatRemaining(59_001)).toBe("1:00");
  });

  it("0以下なら 0:00 を返す", () => {
    expect(formatRemaining(-1)).toBe("0:00");
  });
});
