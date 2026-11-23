// 開室時間・休室日（出典：https://www.tobikan.jp/exhibition/2026_orsay.html 2026-11-23 確認）
//   会期     2026年11月14日(土)〜2027年3月28日(日)
//   開室時間 9:30〜17:30、金曜日は20:00まで（入室は閉室の30分前まで）
//   休室日   月曜日、11月24日(火)、12月22日(火)〜2027年1月3日(日)、1月12日(火)、3月23日(火)
//            ※11月23日(月・祝)、1月4日(月)、1月11日(月・祝)、3月22日(月・休)は開室
// 会期や時間が変わったら、ここだけを直す

export const HOURS = {
  start: '2026-11-14',
  end: '2027-03-28',
  open: '09:30',
  close: '17:30',
  closeByDow: { 5: '20:00' },      // 金曜
  lastEntryBefore: 30,             // 入室は閉室の何分前まで
  closedDow: [1],                  // 月曜
  closedDates: ['2026-11-24', ['2026-12-22', '2027-01-03'], '2027-01-12', '2027-03-23'],
  openDates: ['2026-11-23', '2027-01-04', '2027-01-11', '2027-03-22'],
  source: 'https://www.tobikan.jp/exhibition/2026_orsay.html',
};

const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const fmt = m => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
const dowOf = date => new Date(date + 'T00:00:00Z').getUTCDay();

export function isClosedDay(date) {
  if (date < HOURS.start || date > HOURS.end) return true;
  if (HOURS.openDates.includes(date)) return false;
  if (HOURS.closedDates.some(d => (Array.isArray(d) ? date >= d[0] && date <= d[1] : date === d))) return true;
  return HOURS.closedDow.includes(dowOf(date));
}

// 曜日ごとの { open, close, lastEntry }（分）
export function hoursFor(dow) {
  const open = toMin(HOURS.open), close = toMin(HOURS.closeByDow[dow] || HOURS.close);
  return { open, close, lastEntry: close - HOURS.lastEntryBefore };
}

// 入室できる30分枠の範囲 [最初, 最後]（slot = 時*2 + (30分以降なら1)）
export function entrySlots(dow) {
  const h = hoursFor(dow);
  return [Math.floor(h.open / 30), Math.ceil(h.lastEntry / 30) - 1];
}

// 全曜日を通した最大範囲（ヒートマップの列）
export function allEntrySlots() {
  const r = [0, 1, 2, 3, 4, 5, 6].map(entrySlots);
  return [Math.min(...r.map(x => x[0])), Math.max(...r.map(x => x[1]))];
}

// その時刻が入室受付時間外か
export function afterLastEntry(dow, time) {
  return toMin(time) >= hoursFor(dow).lastEntry;
}

// いまの開室状況（JST）
export function statusAt(now = new Date()) {
  const j = new Date(now.getTime() + 9 * 3600e3);
  const date = j.toISOString().slice(0, 10), min = j.getUTCHours() * 60 + j.getUTCMinutes();
  const h = hoursFor(j.getUTCDay());
  if (date < HOURS.start) return { open: false, text: `会期は ${HOURS.start.slice(5).replace('-', '/')} から` };
  if (date > HOURS.end) return { open: false, text: '会期は終了しました' };
  if (isClosedDay(date)) return { open: false, text: '本日は休室日です' };
  if (min < h.open) return { open: false, text: `本日は ${fmt(h.open)} 開室（入室は ${fmt(h.lastEntry)} まで）` };
  if (min >= h.close) return { open: false, text: '本日の開室時間は終了しました' };
  if (min >= h.lastEntry) return { open: true, text: `本日の入室受付は終了しました（${fmt(h.close)} 閉室）` };
  return { open: true, text: `開室中　${fmt(h.close)} 閉室（入室は ${fmt(h.lastEntry)} まで）` };
}

/* ---------- 会期中の特別日程（混雑に影響しそうなもの） ---------- */
// 出典は同じ展覧会ページ。追加・変更があればここに足す
//   dates: 'YYYY-MM-DD' か [開始, 終了]。weekdaysOnly: 平日（月〜金、休室日を除く）だけ
const SPECIAL = [
  { label: '学生無料', detail: '大学・専門学校生は無料（平日のみ）', dates: [['2026-12-08', '2026-12-18']], weekdaysOnly: true },
];
// 家族ふれあいの日：毎月第3土曜日と翌日曜日。18歳未満の子を同伴する保護者（都内在住、2名まで）は一般料金の半額
function familyDays() {
  const out = [];
  for (let y = +HOURS.start.slice(0, 4), m = +HOURS.start.slice(5, 7) - 1; ; m++) {
    const first = new Date(Date.UTC(y, m, 1));
    if (first.toISOString().slice(0, 10) > HOURS.end) break;
    const sat = 1 + ((6 - first.getUTCDay() + 7) % 7) + 14; // 第3土曜
    for (const d of [sat, sat + 1]) {
      const iso = new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);
      if (iso >= HOURS.start && iso <= HOURS.end && !isClosedDay(iso)) out.push(iso);
    }
  }
  return out;
}

function expand(e) {
  const days = [];
  for (const d of e.dates) {
    const [a, b] = Array.isArray(d) ? d : [d, d];
    for (let t = Date.parse(a + 'T00:00:00Z'); t <= Date.parse(b + 'T00:00:00Z'); t += 864e5) {
      const iso = new Date(t).toISOString().slice(0, 10), dow = new Date(t).getUTCDay();
      if (e.weekdaysOnly && (dow === 0 || dow === 6)) continue;
      if (!isClosedDay(iso)) days.push(iso);
    }
  }
  return days;
}

// 特別日程の一覧：[{ label, detail, days: [...] }]
export function specialSchedule() {
  return [
    ...SPECIAL.map(e => ({ label: e.label, detail: e.detail, days: expand(e) })),
    { label: '家族ふれあいの日', detail: '18歳未満の子と一緒の保護者（都内在住、2名まで）は一般料金の半額', days: familyDays() },
  ];
}

// その日に当たる特別日程のラベル
export function specialOn(date) {
  return specialSchedule().filter(e => e.days.includes(date)).map(e => e.label);
}

export const hoursText = () =>
  `${HOURS.open.replace(/^0/, '')}〜${HOURS.close}（金曜は${HOURS.closeByDow[5]}まで）・入室は閉室の${HOURS.lastEntryBefore}分前まで・月曜休室（祝日は開室）`;
