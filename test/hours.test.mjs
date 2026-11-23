import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isClosedDay, entrySlots, allEntrySlots, afterLastEntry, statusAt, specialSchedule, specialOn } from '../js/hours.js';

test('特別日程', () => {
  const [student, family] = specialSchedule();
  assert.deepEqual(student.days, ['2026-12-08', '2026-12-09', '2026-12-10', '2026-12-11', '2026-12-15', '2026-12-16', '2026-12-17', '2026-12-18']);
  assert.deepEqual(family.days, ['2026-11-21', '2026-11-22', '2026-12-19', '2026-12-20', '2027-01-16', '2027-01-17', '2027-02-20', '2027-02-21', '2027-03-20', '2027-03-21']);
  assert.deepEqual(specialOn('2026-11-21'), ['家族ふれあいの日']);
  assert.deepEqual(specialOn('2026-11-25'), []);
});

test('休室日', () => {
  assert.equal(isClosedDay('2026-11-16'), true);  // 月曜
  assert.equal(isClosedDay('2026-11-23'), false); // 月・祝は開室
  assert.equal(isClosedDay('2026-11-24'), true);  // 振替休室
  assert.equal(isClosedDay('2026-12-25'), true);  // 年末年始
  assert.equal(isClosedDay('2027-01-04'), false); // 月曜だが開室
  assert.equal(isClosedDay('2026-11-13'), true);  // 会期前
  assert.equal(isClosedDay('2026-11-14'), false);
});

test('入室できる30分枠', () => {
  assert.deepEqual(entrySlots(2), [19, 33]); // 9:30〜16:30台（入室 17:00 まで）
  assert.deepEqual(entrySlots(5), [19, 38]); // 金曜 〜19:00台（入室 19:30 まで）
  assert.deepEqual(allEntrySlots(), [19, 38]);
  assert.equal(afterLastEntry(6, '17:00'), true);
  assert.equal(afterLastEntry(5, '17:00'), false);
});

test('開室状況', () => {
  assert.match(statusAt(new Date('2026-11-24T03:00:00Z')).text, /休室日/);
  assert.match(statusAt(new Date('2026-11-25T03:00:00Z')).text, /開室中/);            // 水 12:00
  assert.match(statusAt(new Date('2026-11-25T08:10:00Z')).text, /入室受付は終了/);    // 水 17:10
  assert.match(statusAt(new Date('2026-11-27T10:00:00Z')).text, /開室中\s+20:00 閉室/); // 金 19:00
});
