// 手動追加・削除（GitHub Actions の manual-add ワークフローから実行）
//   TEXT        ポスト本文（複数件まとめても可。1行に潰れていても可）
//   DELETE_IDS  削除する id をカンマ・空白区切りで（例: 20261123-1140）
import { parse } from '../js/parse.js';
import { PATHS, readJSON, writePosts, merge, summary } from './lib.mjs';

const text = process.env.TEXT || '';
const del = (process.env.DELETE_IDS || '').split(/[\s,]+/).filter(Boolean);

const records = text.trim() ? parse(text).map(r => ({ ...r, src: 'manual' })) : [];
if (text.trim() && !records.length) {
  console.error('ERROR: 日時（例：11月23日 (月・祝) 11:40）が見つかりませんでした');
  process.exit(1);
}

const posts = await readJSON(PATHS.posts, []);
const { list, added, updated } = merge(posts, records);
const kept = list.filter(p => !del.includes(p.id));
const removed = list.length - kept.length;
await writePosts(kept);

const lines = [
  ...records.map(r => `${r.date} ${r.time} 入場 ${r.entry ?? '読み取れず'}分 / 会計 ${r.shop ?? '-'}分`),
  `新規 ${added} / 更新 ${updated} / 削除 ${removed}（指定 ${del.length}） / 合計 ${kept.length}`,
];
console.log(lines.join('\n'));
await summary(['### 手動追加', '```', ...lines, '```'].join('\n'));
