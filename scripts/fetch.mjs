// X API で @orsay_annai の新しいポストを取得 → 混雑ポストだけ parse → data/posts.json に追記
//
// 環境変数
//   X_BEARER_TOKEN  必須（Secrets）
//   X_USER_ID       必須（リポジトリ変数。lookup-user.mjs で調べた値）
//   START_TIME      任意。since_id が未保存のときの取得開始（ISO8601）。省略時は当日 0:00 JST
//   MOCK_FILE       任意。API を呼ばず、このJSON（レスポンス1件 or 配列）を使う（ローカル検証用）
import { readFile } from 'node:fs/promises';
import { parse, isCrowdPost } from '../js/parse.js';
import { PATHS, PRICE, USER_ID, readJSON, writeJSON, writePosts, merge, jstNow, usd, summary } from './lib.mjs';

const API = 'https://api.x.com/2';
const token = process.env.X_BEARER_TOKEN;
const mock = process.env.MOCK_FILE;

if (!mock && !token) fail('X_BEARER_TOKEN が設定されていません');
if (!mock && !/^\d+$/.test(USER_ID)) fail('X_USER_ID が設定されていません（scripts/lookup-user.mjs で調べてください）');

const state = await readJSON(PATHS.state, {});
const posts = await readJSON(PATHS.posts, []);

function todayStartJST() {
  const j = new Date(Date.now() + 9 * 3600e3);
  return new Date(Date.UTC(j.getUTCFullYear(), j.getUTCMonth(), j.getUTCDate()) - 9 * 3600e3).toISOString();
}

function fail(msg) { console.error('ERROR: ' + msg); process.exit(1); }

// docs.x.com の仕様では post.fields。旧名 tweet.fields しか通らない場合に備えて1回だけ切り替える
let fieldsParam = 'post.fields';

async function getPage(paginationToken) {
  const q = new URLSearchParams({ max_results: '100', exclude: 'retweets,replies', [fieldsParam]: 'created_at' });
  if (state.since_id) q.set('since_id', state.since_id);
  else q.set('start_time', process.env.START_TIME || todayStartJST());
  if (paginationToken) q.set('pagination_token', paginationToken);

  const res = await fetch(`${API}/users/${USER_ID}/tweets?${q}`, { headers: { Authorization: `Bearer ${token}` } });
  const body = await res.json().catch(() => ({}));
  const remain = res.headers.get('x-rate-limit-remaining');
  if (res.status === 400 && fieldsParam === 'post.fields' && JSON.stringify(body).includes('post.fields')) {
    console.log('post.fields が受け付けられなかったため tweet.fields で再試行します');
    fieldsParam = 'tweet.fields';
    return getPage(paginationToken);
  }
  if (!res.ok) fail(`HTTP ${res.status} ${JSON.stringify(body)}${remain ? ` (rate-limit remaining ${remain})` : ''}`);
  return body;
}

// ---- 取得 ----
const pages = [];
if (mock) {
  const m = JSON.parse(await readFile(mock, 'utf8'));
  pages.push(...(Array.isArray(m) ? m : [m]));
} else {
  let next;
  do {
    const page = await getPage(next);
    pages.push(page);
    next = page.meta?.next_token;
  } while (next && pages.length < 20);
}

const fetched = pages.flatMap(p => p.data || []);
const crowd = fetched.filter(t => isCrowdPost(t.text));
const records = [], failures = [];
for (const t of crowd) {
  const rs = parse(t.text, t.created_at ? new Date(t.created_at) : new Date());
  if (!rs.length || rs.every(r => r.entry == null)) failures.push(t);
  for (const r of rs) records.push({ ...r, src: 'api', tid: t.id });
}

const { list, added, updated } = merge(posts, records);
await writePosts(list);

// ---- 状態とコスト ----
const ids = fetched.map(t => BigInt(t.id));
if (ids.length) state.since_id = ids.reduce((a, b) => (a > b ? a : b)).toString();
state.last_run = new Date().toISOString();
const month = jstNow().slice(0, 7);
state.usage ||= {};
const u = (state.usage[month] ||= { requests: 0, posts_read: 0, est_usd: 0 });
const cost = fetched.length * PRICE.postRead;
if (!mock) {
  u.requests += pages.length;
  u.posts_read += fetched.length;
  u.est_usd = +(u.est_usd + cost).toFixed(3);
}
await writeJSON(PATHS.state, state);

// ---- ログ ----
const lines = [
  `取得日時        ${jstNow()}${mock ? '（MOCK）' : ''}`,
  `リクエスト数    ${pages.length}`,
  `取得ポスト数    ${fetched.length}（うち混雑状況 ${crowd.length}、それ以外は破棄 ${fetched.length - crowd.length}）`,
  `レコード        新規 ${added} / 更新 ${updated} / 合計 ${list.length}`,
  `解析失敗        ${failures.length}`,
  `推定コスト      今回 ${usd(cost)}（${fetched.length}件 × ${usd(PRICE.postRead)}）`,
  `今月の累計      ${u.posts_read}件 ${usd(u.est_usd)}（同じUTC日に同じポストを再取得した分は実際には課金されないため上限値）`,
  `since_id        ${state.since_id || '-'}`,
];
console.log(lines.join('\n'));
for (const t of failures) console.log(`\n[解析失敗] ${t.id}\n${t.text}`);

await summary(['### X API 取得結果', '```', ...lines, '```',
  ...failures.map(t => `**解析失敗** ${t.id}\n\`\`\`\n${t.text}\n\`\`\``)].join('\n'));
