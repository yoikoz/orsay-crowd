// オルセー展 混雑ログ ─「最新を取得」ボタンの中継用 Cloudflare Worker
//
// サイト（GitHub Pages）から呼ばれ、GitHub Actions の fetch ワークフローを起動する。
// GitHub のトークンはこの Worker の Secret（GH_TOKEN）にだけ置き、ブラウザには渡さない。
//
//   GET  /status   直近の fetch 実行の状態と、次に押せる時刻を返す
//   POST /refresh  直近60分以内に fetch が実行されていなければ起動する（1時間に1回まで）
//
// 必要な Secret
//   GH_TOKEN  fine-grained personal access token
//             対象リポジトリ：yoikoz/orsay-crowd のみ ／ 権限：Actions = Read and write のみ
//
// 管理画面にこのファイルをそのまま貼り付けて使える（下の CONFIG 以外に設定は不要）

const CONFIG = {
  repo: 'yoikoz/orsay-crowd',
  workflow: 'fetch.yml',
  ref: 'main',
  allowedOrigins: ['https://yoikoz.github.io'],
  cooldownMinutes: 60,
};

const GH = 'https://api.github.com';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const allowed = CONFIG.allowedOrigins.includes(origin);
    const cors = {
      'Access-Control-Allow-Origin': allowed ? origin : CONFIG.allowedOrigins[0],
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    };
    const json = (body, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (!env.GH_TOKEN) return json({ error: 'not_configured' }, 500);

    try {
      if (url.pathname === '/status' && request.method === 'GET') {
        return json(await status(env));
      }
      if (url.pathname === '/refresh' && request.method === 'POST') {
        // ブラウザ以外（Origin なし）や他サイトからの起動は受け付けない
        if (!allowed) return json({ error: 'forbidden_origin' }, 403);
        const s = await status(env);
        if (!s.available) return json({ ok: false, reason: s.running ? 'running' : 'cooldown', ...s }, 429);
        await gh(env, `/repos/${CONFIG.repo}/actions/workflows/${CONFIG.workflow}/dispatches`, {
          method: 'POST',
          body: JSON.stringify({ ref: CONFIG.ref }),
        });
        const now = new Date();
        return json({ ok: true, started_at: now.toISOString(), next_available_at: addMin(now, CONFIG.cooldownMinutes).toISOString() }, 202);
      }
      return json({ error: 'not_found' }, 404);
    } catch (e) {
      return json({ error: 'upstream', message: String(e.message || e) }, 502);
    }
  },
};

// 直近の fetch 実行（手動・ボタン・どの起動方法でも）から、次に押せる時刻を決める
async function status(env) {
  const r = await gh(env, `/repos/${CONFIG.repo}/actions/workflows/${CONFIG.workflow}/runs?per_page=1`);
  const run = (await r.json()).workflow_runs?.[0];
  if (!run) return { available: true, running: false, last_run: null, next_available_at: null };
  const created = new Date(run.created_at);
  const next = addMin(created, CONFIG.cooldownMinutes);
  const running = run.status !== 'completed';
  return {
    available: !running && Date.now() >= next.getTime(),
    running,
    last_run: { created_at: run.created_at, status: run.status, conclusion: run.conclusion },
    next_available_at: next.toISOString(),
  };
}

async function gh(env, path, init = {}) {
  const res = await fetch(GH + path, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.GH_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'orsay-crowd-refresh',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  return res;
}

const addMin = (d, m) => new Date(d.getTime() + m * 60e3);
