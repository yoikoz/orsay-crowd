// API を呼ばずにモックのレスポンスで fetch.mjs を通しで動かす
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('モックで取得 → 混雑ポストだけ追記、重複は上書き、state を更新', () => {
  const dir = mkdtempSync(join(tmpdir(), 'orsay-'));
  writeFileSync(join(dir, 'posts.json'), JSON.stringify([
    { id: '20261123-1140', date: '2026-11-23', time: '11:40', dow: 1, hol: true, entry: 45, shop: null, src: 'manual' },
  ]));
  writeFileSync(join(dir, 'state.json'), '{}');
  const run = () => execFileSync(process.execPath, ['scripts/fetch.mjs'], {
    env: { ...process.env, DATA_DIR: dir, MOCK_FILE: 'test/fixtures/timeline.json', GITHUB_STEP_SUMMARY: '' },
    encoding: 'utf8',
  });
  const log = run();
  assert.match(log, /取得ポスト数\s+3（うち混雑状況 2、それ以外は破棄 1）/);
  assert.match(log, /新規 1 \/ 更新 1 \/ 合計 2/);
  assert.match(log, /\$0\.015/);

  const posts = JSON.parse(readFileSync(join(dir, 'posts.json'), 'utf8'));
  assert.deepEqual(posts.map(p => [p.id, p.entry, p.shop]), [['20261123-1140', 50, 10], ['20261123-1340', 80, 15]]);
  const state = JSON.parse(readFileSync(join(dir, 'state.json'), 'utf8'));
  assert.equal(state.since_id, '1992600000000000003');

  assert.match(run(), /新規 0 \/ 更新 0 \/ 合計 2/); // 2回目は変化なし
});
