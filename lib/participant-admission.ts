import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { MONITOR_CLOSES_AT } from "@/lib/monitor-schedule";

export type ParticipantScope = "submissions" | "prize" | "print-code" | "preset";
type Cost = { reads: number; writes: number };
const reservations = new WeakMap<Request, { id: string; cost: Cost }>();
const PREFIX = "collage:2026:participant";
const BUDGET = `${PREFIX}:budget`;

// 判定と予約を1回のLua実行にまとめ、サーバーが増えても全体枠を共有する。
export const ADMISSION_SCRIPT = `
local now = tonumber(redis.call('TIME')[1])
if now >= tonumber(ARGV[1]) then return 2 end
local window = math.floor(now / 60)
local function count(key)
  if tonumber(redis.call('HGET', key, 'window')) ~= window then return 0 end
  return tonumber(redis.call('HGET', key, 'count') or '0')
end
local global = count(KEYS[1])
local user = count(KEYS[2])
local reads = tonumber(redis.call('HGET', KEYS[3], 'reads') or '0')
local writes = tonumber(redis.call('HGET', KEYS[3], 'writes') or '0')
local readCost = tonumber(ARGV[2])
local writeCost = tonumber(ARGV[3])
if global >= 1200 or user >= tonumber(ARGV[4]) then return 0 end
if reads + readCost > 40000 or writes + writeCost > 15000 then return 0 end
redis.call('HSET', KEYS[1], 'window', window, 'count', global + 1)
redis.call('HSET', KEYS[2], 'window', window, 'count', user + 1)
redis.call('EXPIREAT', KEYS[1], ARGV[1])
redis.call('EXPIREAT', KEYS[2], ARGV[1])
redis.call('HINCRBY', KEYS[3], 'reads', readCost)
redis.call('HINCRBY', KEYS[3], 'writes', writeCost)
redis.call('HSET', KEYS[3], ARGV[6], readCost .. ':' .. writeCost .. ':' .. ARGV[5])
return 1
`;

// 精算IDを消すので、通信の再送があっても同じ枠を二度返さない。
export const SETTLEMENT_SCRIPT = `
local reserved = redis.call('HGET', KEYS[1], ARGV[1])
if not reserved then return 0 end
local r, w, scope = string.match(reserved, '^(%d+):(%d+):([^:]+)$')
if not r then return redis.error_reply('Invalid reservation') end
local usedReads = tonumber(ARGV[2])
local usedWrites = tonumber(ARGV[3])
if usedReads < 0 or usedReads > tonumber(r) or usedWrites < 0 or usedWrites > tonumber(w) then return redis.error_reply('Invalid usage') end
redis.call('HDEL', KEYS[1], ARGV[1])
redis.call('HINCRBY', KEYS[1], 'reads', usedReads - tonumber(r))
redis.call('HINCRBY', KEYS[1], 'writes', usedWrites - tonumber(w))
return 1
`;

async function command(script: string, keys: string[], args: Array<string | number>): Promise<number> {
  const endpoint = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (process.env.PARTICIPANT_REDIS_READY !== "true" || !endpoint || !token) throw new Error("受付用Redisが未設定です。");
  const url = new URL(endpoint);
  if (url.protocol !== "https:" || !url.hostname.endsWith(".upstash.io") || url.username || url.password || url.search || url.pathname !== "/") throw new Error("受付用Redisの接続先が不正です。");
  const response = await fetch(url, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(["EVAL", script, keys.length, ...keys, ...args]),
    cache: "no-store", redirect: "error", signal: AbortSignal.timeout(3000),
  });
  if (!response.ok) throw new Error("受付用Redisへ接続できません。");
  const payload: unknown = await response.json();
  if (typeof payload !== "object" || payload === null || !("result" in payload) || typeof payload.result !== "number") throw new Error("受付用Redisの応答が不正です。");
  return payload.result;
}

export async function reserveParticipantRequest(request: Request, uid: string, scope: ParticipantScope): Promise<"accepted" | "limited" | "closed"> {
  const cost = scope === "submissions" ? { reads: 20, writes: 14 }
    : scope === "print-code" ? { reads: 30, writes: 2 }
    : scope === "preset" ? { reads: 1, writes: 0 }
    : { reads: 12, writes: request.method === "POST" ? 1 : 0 };
  const id = `reservation:${randomUUID()}`;
  const user = createHash("sha256").update(uid).digest("hex");
  const result = await command(ADMISSION_SCRIPT, [`${PREFIX}:${scope}:global`, `${PREFIX}:${scope}:${user}`, BUDGET], [
    MONITOR_CLOSES_AT / 1000, cost.reads, cost.writes, scope === "preset" ? 1200 : 30, scope, id,
  ]);
  if (result === 0) return "limited";
  if (result === 2) return "closed";
  if (result !== 1) throw new Error("受付用Redisの判定が不正です。");
  reservations.set(request, { id, cost });
  return "accepted";
}

/** 成功が確定した処理だけを精算する。失敗・タイムアウト時は予約を返さない。 */
export async function settleParticipantRequest(request: Request, used: Cost): Promise<void> {
  const reservation = reservations.get(request);
  if (!reservation) return;
  reservations.delete(request);
  if (!Number.isSafeInteger(used.reads) || !Number.isSafeInteger(used.writes) || used.reads < 0 || used.writes < 0 || used.reads > reservation.cost.reads || used.writes > reservation.cost.writes) return;
  try { await command(SETTLEMENT_SCRIPT, [BUDGET], [reservation.id, used.reads, used.writes]); }
  catch { /* 精算失敗は余裕枠を減らす方向に倒し、予約の再送はしない。 */ }
}
