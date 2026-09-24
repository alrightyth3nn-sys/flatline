// Flatline leaderboard API (Cloudflare Worker + D1).
//   GET  /scores?limit=10            -> { top: [{ rank, name, score, secs }] }
//   POST /scores { name, score, secs } -> { rank, top }
// Scores come from the browser, so this can only reject implausible ones; it can't prove a run was real.

const MAX_TOP = 50;
const NAME_RE = /^[\p{L}\p{N} _.\-]{1,16}$/u;
const SUBMIT_GAP_MS = 8000;      // one submission per IP every 8 s
const SUBMITS_PER_HOUR = 40;

// each name's best run, ranked: more kills first, then the faster run, then whoever got there first
const BEST = `SELECT name, score, secs, created, name_key FROM (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY name_key ORDER BY score DESC, secs ASC, created ASC) AS rn FROM scores
) WHERE rn = 1`;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cors },
});

async function top(db, limit) {
  const { results } = await db.prepare(`${BEST} ORDER BY score DESC, secs ASC, created ASC LIMIT ?`).bind(limit).all();
  return results.map((r, i) => ({ rank: i + 1, name: r.name, score: r.score, secs: r.secs }));
}

async function hashIp(ip, salt) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}|${ip}`));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function submit(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const name = String(body?.name ?? '').normalize('NFC').trim().replace(/\s+/g, ' ');
  const score = Number(body?.score), secs = Number(body?.secs);
  if (!NAME_RE.test(name)) return json({ error: 'Names are 1 to 16 letters, numbers, spaces, dots, dashes or underscores.' }, 400);
  if (!Number.isInteger(score) || score < 1 || score > 100000) return json({ error: 'Invalid score' }, 400);
  if (!Number.isInteger(secs) || secs < 1 || secs > 36000) return json({ error: 'Invalid time' }, 400);
  // the spawner can't produce zombies faster than this, so a higher kill rate isn't a real run
  if (score > 20 + secs * 30) return json({ error: 'Score not accepted' }, 400);

  const now = Date.now();
  const ip = await hashIp(request.headers.get('CF-Connecting-IP') || 'unknown', env.IP_SALT || '');
  const recent = await env.DB.prepare('SELECT COUNT(*) AS n, MAX(created) AS last FROM scores WHERE ip_hash = ? AND created > ?')
    .bind(ip, now - 3600e3).first();
  if (recent && (recent.n >= SUBMITS_PER_HOUR || (recent.last && now - recent.last < SUBMIT_GAP_MS)))
    return json({ error: 'Too many submissions, try again shortly.' }, 429);

  const key = name.toLowerCase();
  await env.DB.prepare('INSERT INTO scores (name, name_key, score, secs, created, ip_hash) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(name, key, score, secs, now, ip).run();
  // where this run places against every other name's best
  const ahead = await env.DB.prepare(`SELECT COUNT(*) AS n FROM (${BEST}) WHERE name_key != ? AND (score > ? OR (score = ? AND secs < ?))`)
    .bind(key, score, score, secs).first();
  return json({ rank: (ahead?.n ?? 0) + 1, top: await top(env.DB, 10) });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (url.pathname !== '/scores') return json({ error: 'Not found' }, 404);
    try {
      if (request.method === 'GET') {
        const limit = Math.min(MAX_TOP, Math.max(1, parseInt(url.searchParams.get('limit') || '10', 10) || 10));
        return json({ top: await top(env.DB, limit) });
      }
      if (request.method === 'POST') return await submit(request, env);
      return json({ error: 'Method not allowed' }, 405);
    } catch (e) {
      console.error(e);
      return json({ error: 'Server error' }, 500);
    }
  },
};
