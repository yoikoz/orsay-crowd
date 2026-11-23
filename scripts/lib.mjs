import { readFile, writeFile, appendFile } from 'node:fs/promises';

// DATA_DIR はローカル検証で本番データを汚さないための切り替え用
const DIR = process.env.DATA_DIR || 'data';
export const PATHS = { posts: `${DIR}/posts.json`, state: `${DIR}/state.json` };

// X API 単価（USD）。docs.x.com/x-api/getting-started/pricing（2026-11 確認）
export const PRICE = { postRead: 0.005, userRead: 0.010 };

// @orsay_annai の user id。scripts/lookup-user.mjs で一度だけ調べて、
// リポジトリ変数 X_USER_ID に入れるか、ここに書く
export const USER_ID = process.env.X_USER_ID || '';

export async function readJSON(path, fallback) {
  try { return JSON.parse(await readFile(path, 'utf8')); } catch (e) {
    if (e.code === 'ENOENT') return fallback;
    throw e;
  }
}

// 1レコード1行で書き出す（git の差分を読みやすくするため）
export async function writePosts(list) {
  list.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  await writeFile(PATHS.posts, '[\n' + list.map(p => '  ' + JSON.stringify(p)).join(',\n') + '\n]\n');
}

export async function writeJSON(path, v) {
  await writeFile(path, JSON.stringify(v, null, 2) + '\n');
}

// id で重複排除・上書き
export function merge(list, records) {
  const map = new Map(list.map(p => [p.id, p]));
  let added = 0, updated = 0;
  for (const r of records) {
    const prev = map.get(r.id);
    if (!prev) added++;
    else if (JSON.stringify(prev) !== JSON.stringify(r)) updated++;
    map.set(r.id, r);
  }
  return { list: [...map.values()], added, updated };
}

export const jstNow = () => new Date(Date.now() + 9 * 3600e3).toISOString().replace('T', ' ').slice(0, 16) + ' JST';
export const usd = n => '$' + n.toFixed(3);

// GitHub Actions の実行サマリーにも出す
export async function summary(md) {
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, md + '\n');
}
