import { Redis } from "@upstash/redis";

/**
 * Tiny storage layer: Upstash Redis when configured (production on Vercel),
 * an in-process Map otherwise (local dev).
 */
const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

const redis = url && token ? new Redis({ url, token }) : null;

type Mem = { kv: Map<string, unknown>; lists: Map<string, unknown[]>; sets: Map<string, Set<string>> };
const g = globalThis as unknown as { __boloMem?: Mem };
const mem: Mem = (g.__boloMem ??= { kv: new Map(), lists: new Map(), sets: new Map() });

export const storeKind = redis ? "upstash-redis" : "memory";

export async function getJSON<T>(key: string): Promise<T | null> {
  if (redis) return ((await redis.get<T>(key)) ?? null) as T | null;
  return (mem.kv.get(key) as T) ?? null;
}

export async function setJSON(key: string, value: unknown, ttlSeconds?: number) {
  if (redis) {
    if (ttlSeconds) await redis.set(key, value, { ex: ttlSeconds });
    else await redis.set(key, value);
    return;
  }
  mem.kv.set(key, value);
}

export async function incr(key: string): Promise<number> {
  if (redis) return redis.incr(key);
  const n = ((mem.kv.get(key) as number) ?? 0) + 1;
  mem.kv.set(key, n);
  return n;
}

export async function lpush(key: string, value: unknown, max = 500) {
  if (redis) {
    await redis.lpush(key, value);
    await redis.ltrim(key, 0, max - 1);
    return;
  }
  const l = mem.lists.get(key) ?? [];
  l.unshift(value);
  mem.lists.set(key, l.slice(0, max));
}

export async function lrange<T>(key: string, start = 0, stop = -1): Promise<T[]> {
  if (redis) return (await redis.lrange<T>(key, start, stop)) as T[];
  const l = (mem.lists.get(key) ?? []) as T[];
  return l.slice(start, stop === -1 ? undefined : stop + 1);
}

export async function smembers(key: string): Promise<string[]> {
  if (redis) return (await redis.smembers(key)) as string[];
  return [...(mem.sets.get(key) ?? [])];
}

export async function sadd(key: string, ...members: string[]) {
  if (!members.length) return;
  if (redis) {
    await redis.sadd(key, members[0], ...members.slice(1));
    return;
  }
  const s = mem.sets.get(key) ?? new Set();
  members.forEach((m) => s.add(m));
  mem.sets.set(key, s);
}

export async function srem(key: string, ...members: string[]) {
  if (!members.length) return;
  if (redis) {
    await redis.srem(key, ...members);
    return;
  }
  const s = mem.sets.get(key);
  members.forEach((m) => s?.delete(m));
}
