import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse, toMin, isCrowdPost } from '../js/parse.js';

const REF = new Date('2026-11-23T12:00:00Z'); // JST 21:00

const SAMPLE = `【オルセー美術館所蔵　いまを生きる歓び展  会場混雑状況】
１１月２３日 (月・祝) １１：４０ 現在
只今、入場までの待ち時間は５０分です。
ショップのお会計待ち時間は約１０分です。
#オルセー美術館展
#東京都美術館`;

test('実例のポストを読める（全角数字・全角コロン・祝日）', () => {
  assert.deepEqual(parse(SAMPLE, REF), [
    { id: '20261123-1140', date: '2026-11-23', time: '11:40', dow: 1, hol: true, entry: 50, shop: 10 },
  ]);
});

test('改行が消えた1行の貼り付けでも入場と会計を分けて読む', () => {
  const r = parse(SAMPLE.replace(/\n/g, ''), REF)[0];
  assert.equal(r.entry, 50);
  assert.equal(r.shop, 10);
});

test('時間表記のゆれ', () => {
  assert.equal(toMin('入場までの待ち時間は1時間20分です'), 80);
  assert.equal(toMin('入場までの待ち時間は1時間です'), 60);
  assert.equal(toMin('待ち時間なし'), 0);
  assert.equal(toMin('入場待ちはございません'), 0);
  assert.equal(toMin('お待ちいただかずにご入場いただけます'), null);
});

test('待ち時間なし・ございません', () => {
  const r = parse(`会場混雑状況
11月24日 (火) 9:45 現在
只今、入場までの待ち時間はございません。
ショップのお会計待ち時間はなしです。`, REF)[0];
  assert.equal(r.entry, 0);
  assert.equal(r.shop, 0);
  assert.equal(r.hol, false);
  assert.equal(r.dow, 2);
});

test('会計の記載がなければ shop は null', () => {
  const r = parse('11月23日(月・祝)14:00現在 入場までの待ち時間は1時間10分です。', REF)[0];
  assert.equal(r.entry, 70);
  assert.equal(r.shop, null);
});

test('年の補正：基準日より7日以上未来なら前年', () => {
  const jan = new Date('2027-01-03T03:00:00Z');
  assert.equal(parse('12月28日 (月) 10:00 現在 入場までの待ち時間は10分です。', jan)[0].date, '2026-12-28');
  assert.equal(parse('1月5日 (火) 10:00 現在 入場までの待ち時間は10分です。', jan)[0].date, '2027-01-05');
});

test('複数ポストをまとめて貼っても分割して読む', () => {
  const r = parse(SAMPLE + '\n' + SAMPLE.replace('１１：４０', '１３：１０').replace('５０', '７０'), REF);
  assert.deepEqual(r.map(x => [x.id, x.entry]), [['20261123-1140', 50], ['20261123-1310', 70]]);
});

test('混雑状況ポストの判定', () => {
  assert.ok(isCrowdPost(SAMPLE));
  assert.ok(!isCrowdPost('本日は休館日です #オルセー美術館展'));
});
