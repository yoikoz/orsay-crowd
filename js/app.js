import { parse } from './parse.js';

const DOW = ['日', '月', '火', '水', '木', '金', '土'];
const LS_KEY = 'orsay-local';
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let server = [];   // data/posts.json（Actions が蓄積）
let local = {};    // この端末だけの追加分
let meta = {};     // data/state.json

/* ---------- データ ---------- */
function loadLocal() { try { local = JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {}; } catch { local = {}; } }
function saveLocal() { try { localStorage.setItem(LS_KEY, JSON.stringify(local)); } catch {} }

async function getJSON(path) {
  const r = await fetch(path, { cache: 'no-store' });
  if (!r.ok) throw new Error(path + ' ' + r.status);
  return r.json();
}

function all() {
  const map = new Map();
  for (const p of Object.values(local)) map.set(p.id, { ...p, src: 'local' });
  for (const p of server) map.set(p.id, p); // サーバー側を優先
  return [...map.values()].filter(p => p && p.date).sort((a, b) => (a.id < b.id ? -1 : 1));
}

/* ---------- 集計 ---------- */
const slotOf = t => { const [h, m] = t.split(':').map(Number); return h * 2 + (m >= 30 ? 1 : 0); };
const slotLabel = s => `${Math.floor(s / 2)}:${s % 2 ? '30' : '00'}`;
const avg = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const isWeekend = p => p.hol || p.dow === 0 || p.dow === 6;
const dowLabel = p => (p.hol ? DOW[p.dow] + '・祝' : DOW[p.dow]);
const md = d => d.slice(5).replace('-', '/').replace(/^0/, '').replace('/0', '/');
const withEntry = list => list.filter(p => p.entry != null);

function bySlot(list, f) {
  const by = {};
  withEntry(list).filter(f).forEach(p => (by[slotOf(p.time)] ||= []).push(p.entry));
  return Object.keys(by).map(Number).sort((a, b) => a - b).map(s => ({ s, v: avg(by[s]), n: by[s].length }));
}

function slotRange(list) {
  const ss = withEntry(list).map(p => slotOf(p.time));
  return [Math.min(19, ...ss), Math.max(34, ...ss)]; // 開館 9:30 〜 17:00 台を最低限表示
}

const BINS = [15, 30, 45, 60, 90]; // 0-14 / 15-29 / 30-44 / 45-59 / 60-89 / 90+
const binOf = v => BINS.findIndex(b => v < b) === -1 ? 5 : BINS.findIndex(b => v < b);

/* ---------- ツールチップ ---------- */
const tip = $('tip');
function showTip(html, x, y) {
  tip.innerHTML = html; tip.classList.add('on');
  const r = tip.getBoundingClientRect(), pad = 12;
  let left = x + pad, top = y + pad;
  if (left + r.width > innerWidth - 8) left = x - r.width - pad;
  if (top + r.height > innerHeight - 8) top = y - r.height - pad;
  tip.style.left = Math.max(8, left) + 'px'; tip.style.top = Math.max(8, top) + 'px';
}
const hideTip = () => tip.classList.remove('on');

/* ---------- 描画：最新・統計 ---------- */
function drawNow(list) {
  const last = list[list.length - 1];
  $('hero').innerHTML = last && last.entry != null ? `${last.entry}<small>分</small>` : '—';
  $('heroAt').textContent = last ? `${md(last.date)}（${dowLabel(last)}）${last.time} 時点` : 'まだ記録がありません';
  const ent = withEntry(list);
  const max = ent.reduce((m, p) => (!m || p.entry > m.entry ? p : m), null);
  const days = new Set(list.map(p => p.date)).size;
  const items = [
    [last && last.shop != null ? last.shop + '分' : '—', 'ショップ会計待ち（最新）'],
    [ent.length ? Math.round(avg(ent.map(p => p.entry))) + '分' : '—', '全期間の平均'],
    [max ? max.entry + '分' : '—', max ? `最長　${md(max.date)}（${dowLabel(max)}）${max.time}` : '最長'],
    [list.length + '件', `記録数（${days}日分）`],
  ];
  $('stats').innerHTML = items.map(([b, s]) => `<div class="stat"><b>${esc(b)}</b><span>${esc(s)}</span></div>`).join('');
}

/* ---------- 描画：狙い目 ---------- */
function drawBest(list) {
  const groups = [['平日（月〜金）', p => !isWeekend(p)], ['土日祝', isWeekend]];
  $('best').innerHTML = groups.map(([name, f]) => {
    const sr = bySlot(list, f);
    if (!sr.length) return `<div class="card"><h3>${name}</h3><p>まだデータがありません</p></div>`;
    const lo = [...sr].sort((a, b) => a.v - b.v || a.s - b.s), pk = lo[lo.length - 1];
    const n = withEntry(list).filter(f).length;
    return `<div class="card"><h3>${name}</h3>
      <div class="t">${slotLabel(lo[0].s)}〜<small>平均 ${Math.round(lo[0].v)}分</small></div>
      ${lo[1] ? `<p>次に空いている：${slotLabel(lo[1].s)}〜（${Math.round(lo[1].v)}分）</p>` : ''}
      <p>いちばん混む：${slotLabel(pk.s)}〜（${Math.round(pk.v)}分）</p>
      <p>もとにした記録 ${n}件${n < 10 ? '　※まだ少ないので参考程度に' : ''}</p></div>`;
  }).join('');
}

/* ---------- 描画：ヒートマップ ---------- */
function drawHeat(list) {
  const ent = withEntry(list), [lo, hi] = slotRange(list);
  const cols = []; for (let s = lo; s <= hi; s++) cols.push(s);
  const rows = [[1, '月'], [2, '火'], [3, '水'], [4, '木'], [5, '金'], [6, '土'], [0, '日'], [7, '祝']];
  let h = '<div role="row" style="display:contents"><div></div>' +
    cols.map(s => `<div class="h" role="columnheader">${s % 2 ? '' : slotLabel(s)}</div>`).join('') + '</div>';
  for (const [r, name] of rows) {
    h += `<div role="row" style="display:contents"><div class="r" role="rowheader">${name}</div>`;
    for (const s of cols) {
      const vs = ent.filter(p => (p.hol ? 7 : p.dow) === r && slotOf(p.time) === s).map(p => p.entry);
      const v = avg(vs);
      h += v == null
        ? `<div class="c" role="gridcell" aria-label="${name} ${slotLabel(s)} データなし"></div>`
        : `<div class="c b${binOf(v)}" role="gridcell" tabindex="0" data-v="${name === '祝' ? '祝日' : name + '曜'} ${slotLabel(s)}〜|${Math.round(v)}|${vs.length}" aria-label="${name} ${slotLabel(s)} 平均${Math.round(v)}分 ${vs.length}件">${Math.round(v)}</div>`;
    }
    h += '</div>';
  }
  const el = $('heat');
  el.style.gridTemplateColumns = `28px repeat(${cols.length}, minmax(32px, 1fr))`;
  el.style.minWidth = 28 + cols.length * 34 + 'px';
  el.innerHTML = h;
  const labels = ['〜14分', '15〜29', '30〜44', '45〜59', '60〜89', '90分〜'];
  $('scale').innerHTML = labels.map((l, i) => `<span><i class="b${i}"></i>${l}</span>`).join('') + '<span><i style="background:var(--plane)"></i>データなし</span>';
}
function heatTip(e) {
  const c = e.target.closest('.c[data-v]');
  if (!c) return hideTip();
  const [k, v, n] = c.dataset.v.split('|');
  const r = c.getBoundingClientRect();
  const x = e.clientX ?? r.right, y = e.clientY ?? r.bottom;
  showTip(`${esc(k)}<br><b>平均 ${v}分</b>（${n}件）`, x || r.right, y || r.bottom);
}
$('heat').addEventListener('pointermove', heatTip);
$('heat').addEventListener('pointerleave', hideTip);
$('heat').addEventListener('focusin', e => { const r = e.target.getBoundingClientRect(); heatTip({ target: e.target, clientX: r.right, clientY: r.bottom }); });
$('heat').addEventListener('focusout', hideTip);

/* ---------- 描画：推移グラフ ---------- */
let curve = null; // 直近の描画情報（ホバー用）
let cursor = null;

function fillDays(list) {
  const days = [...new Set(list.map(p => p.date))].sort().reverse(), cur = $('day').value;
  $('day').innerHTML = days.length
    ? days.map(d => { const p = list.find(x => x.date === d); return `<option value="${d}">${md(d)}（${dowLabel(p)}）</option>`; }).join('')
    : '<option value="">記録なし</option>';
  if (days.includes(cur)) $('day').value = cur;
}

function drawCurve() {
  const svg = $('curve'), W = svg.clientWidth, H = svg.clientHeight;
  if (!W) return;
  const list = all(), day = $('day').value;
  const dayP = list.find(p => p.date === day);
  $('selKey').textContent = dayP ? `${md(day)}（${dowLabel(dayP)}）` : '選んだ日';
  const wk = bySlot(list, p => !isWeekend(p)).map(d => ({ x: d.s, ...d }));
  const we = bySlot(list, isWeekend).map(d => ({ x: d.s, ...d }));
  const sel = withEntry(list).filter(p => p.date === day)
    .map(p => { const [h, m] = p.time.split(':').map(Number); return { x: h * 2 + m / 30, v: p.entry, t: p.time }; });
  if (!wk.length && !we.length && !sel.length) {
    svg.innerHTML = `<text x="${W / 2}" y="${H / 2}" text-anchor="middle" fill="var(--sub)" font-size="13">記録がたまるとグラフが表示されます</text>`;
    curve = null; return;
  }
  const narrow = W < 520;
  const L = 34, R = narrow ? 52 : 64, T = 26, B = 28;
  const [x0, x1] = slotRange(list);
  const vmax = Math.max(30, ...[...wk, ...we, ...sel].map(d => d.v));
  const step = vmax > 120 ? 60 : vmax > 60 ? 30 : 15;
  const yMax = Math.ceil(vmax / step) * step;
  const X = x => L + (x - x0) / (x1 - x0 || 1) * (W - L - R);
  const Y = v => T + (1 - v / yMax) * (H - T - B);

  let g = '';
  for (let v = 0; v <= yMax; v += step) {
    g += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="${v ? 'var(--grid)' : 'var(--axis)'}" stroke-width="1"/>`;
    g += `<text x="${L - 8}" y="${Y(v) + 4}" text-anchor="end" font-size="11" fill="var(--muted)" style="font-variant-numeric:tabular-nums">${v}</text>`;
  }
  g += `<text x="${L - 8}" y="${T - 14}" text-anchor="end" font-size="11" fill="var(--muted)">分</text>`;
  for (let h = Math.ceil(x0 / 2); h <= Math.floor(x1 / 2); h += narrow ? 2 : 1)
    g += `<text x="${X(h * 2)}" y="${H - 8}" text-anchor="middle" font-size="11" fill="var(--muted)">${h}時</text>`;

  const path = (a, c) => a.length > 1 ? `<polyline points="${a.map(d => X(d.x) + ',' + Y(d.v)).join(' ')}" fill="none" stroke="${c}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>` : '';
  const dots = (a, c, r) => a.map(d => `<circle cx="${X(d.x)}" cy="${Y(d.v)}" r="${r}" fill="${c}" stroke="var(--bg)" stroke-width="2"/>`).join('');
  g += path(wk, 'var(--s1)') + path(we, 'var(--s2)') + path(sel, 'var(--ink)');
  g += dots(wk.length === 1 ? wk : [], 'var(--s1)', 4) + dots(we.length === 1 ? we : [], 'var(--s2)', 4) + dots(sel, 'var(--ink)', 4);

  // 線の右端に系列名（重なったら上下にずらす）
  const ends = [[wk, '平日', 'var(--s1)'], [we, '土日祝', 'var(--s2)'], [sel, md(day || '') || '', 'var(--ink)']]
    .filter(([a]) => a.length).map(([a, name]) => ({ name, y: Y(a[a.length - 1].v), x: X(a[a.length - 1].x) }))
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 14) ends[i].y = ends[i - 1].y + 14;
  g += ends.map(e => `<text x="${e.x + 8}" y="${e.y + 4}" font-size="12" fill="var(--sub)">${esc(e.name)}</text>`).join('');

  g += `<line id="xh" y1="${T}" y2="${H - B}" stroke="var(--axis)" stroke-width="1" visibility="hidden"/>`;
  g += `<rect x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="transparent" id="hit"/>`;
  svg.innerHTML = g;
  curve = { wk, we, sel, X, x0, x1, L, R, W, day };
  if (cursor != null) moveCursor(cursor);
}

function moveCursor(s, cx, cy) {
  if (!curve) return;
  s = Math.max(curve.x0, Math.min(curve.x1, s)); cursor = s;
  const xh = $('xh'), x = curve.X(s);
  xh.setAttribute('x1', x); xh.setAttribute('x2', x); xh.setAttribute('visibility', 'visible');
  const at = a => a.find(d => d.s === s);
  const w = at(curve.wk), e = at(curve.we);
  const d = curve.sel.filter(p => Math.floor(p.x) === s);
  const row = (c, name, v) => `<div><span class="k" style="background:${c}"></span>${name}　<b>${v}</b></div>`;
  const html = `<div>${slotLabel(s)}〜${slotLabel(s + 1)}</div>`
    + row('var(--s1)', '平日平均', w ? `${Math.round(w.v)}分（${w.n}件）` : '—')
    + row('var(--s2)', '土日祝平均', e ? `${Math.round(e.v)}分（${e.n}件）` : '—')
    + row('var(--ink)', esc(md(curve.day || '')) || '選んだ日', d.length ? d.map(p => `${p.t} ${p.v}分`).join('、') : '—');
  const r = $('curve').getBoundingClientRect();
  showTip(html, cx ?? r.left + x, cy ?? r.top + 40);
}
$('curve').addEventListener('pointermove', e => {
  if (!curve) return;
  const r = e.currentTarget.getBoundingClientRect(), px = e.clientX - r.left;
  if (px < curve.L - 10 || px > curve.W - curve.R + 10) return;
  const s = Math.round(curve.x0 + (px - curve.L) / (curve.W - curve.L - curve.R) * (curve.x1 - curve.x0));
  moveCursor(s, e.clientX, e.clientY);
});
const clearCursor = () => { cursor = null; hideTip(); const xh = $('xh'); if (xh) xh.setAttribute('visibility', 'hidden'); };
$('curve').addEventListener('pointerleave', clearCursor);
$('curve').addEventListener('blur', clearCursor);
$('curve').addEventListener('keydown', e => {
  if (!curve || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
  e.preventDefault();
  moveCursor((cursor ?? curve.x0 - 1) + (e.key === 'ArrowRight' ? 1 : -1));
});
$('day').addEventListener('change', drawCurve);
new ResizeObserver(() => drawCurve()).observe($('curve'));

/* ---------- 描画：記録一覧 ---------- */
const SRC = { api: '自動', manual: '手動', local: 'この端末' };
function drawRows(list) {
  $('recCount').textContent = `${list.length}件`;
  $('rows').innerHTML = list.length
    ? [...list].reverse().map(p => `<tr>
        <td>${esc(md(p.date))}（${dowLabel(p)}）</td><td class="n">${esc(p.time)}</td>
        <td class="n">${p.entry == null ? '—' : p.entry + '分'}</td><td class="n">${p.shop == null ? '—' : p.shop + '分'}</td>
        <td><span class="tag">${SRC[p.src] || '—'}</span></td>
        <td>${p.src === 'local' ? `<button data-del="${esc(p.id)}" aria-label="${esc(p.date + ' ' + p.time)} を削除">削除</button>` : ''}</td></tr>`).join('')
    : '<tr><td colspan="6" class="sub">まだ記録がありません</td></tr>';
}
$('rows').addEventListener('click', e => {
  const b = e.target.closest('[data-del]'); if (!b) return;
  delete local[b.dataset.del]; saveLocal(); render();
});
$('csv').addEventListener('click', () => {
  const csv = 'date,weekday,holiday,time,entry_wait_min,shop_wait_min,source\n'
    + all().map(p => [p.date, DOW[p.dow], p.hol ? 1 : 0, p.time, p.entry ?? '', p.shop ?? '', p.src || ''].join(',')).join('\n') + '\n';
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' })), download: 'orsay-crowd.csv',
  });
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

/* ---------- 手動追加 ---------- */
function showPreview() {
  const t = $('paste').value.trim();
  if (!t) { $('preview').innerHTML = ''; return []; }
  const r = parse(t), ids = new Set(all().map(p => p.id));
  $('preview').innerHTML = r.length
    ? r.map(p => `<div class="${p.entry == null ? 'ng' : 'ok'}">${esc(p.date)} ${esc(p.time)}（${dowLabel(p)}）　入場 ${p.entry == null ? '読み取れず' : p.entry + '分'}　会計 ${p.shop == null ? '—' : p.shop + '分'}${ids.has(p.id) ? '　※上書き' : ''}</div>`).join('')
    : '<div class="ng">日時（例：11月23日 (月・祝) 11:40）が見つかりません</div>';
  return r;
}
$('paste').addEventListener('input', showPreview);
$('saveLocal').addEventListener('click', () => {
  const r = showPreview(); if (!r.length) return;
  for (const p of r) local[p.id] = p;
  saveLocal(); render();
  $('paste').value = ''; $('preview').innerHTML = `<div class="ok">${r.length}件をこの端末に保存しました</div>`;
});
$('copyAct').addEventListener('click', async () => {
  const t = $('paste').value.trim();
  if (!t || !parse(t).length) { showPreview(); return; }
  // Actions の入力欄は1行なので、改行をスペースにして潰す（parse は1行でも読める）
  const one = t.split(/\n+/).map(s => s.trim()).filter(Boolean).join(' ');
  try { await navigator.clipboard.writeText(one); $('copyMsg').textContent = 'コピーしました'; }
  catch { $('copyMsg').textContent = 'コピーできませんでした'; }
});

// github.io で公開しているときは、Actions のページへのリンクを自動で作る
(() => {
  const m = location.hostname.match(/^([^.]+)\.github\.io$/);
  const a = $('actLink');
  if (!m) { a.removeAttribute('href'); return; }
  const repo = location.pathname.split('/').filter(Boolean)[0] || location.hostname;
  a.href = `https://github.com/${m[1]}/${repo}/actions/workflows/manual-add.yml`;
})();

/* ---------- 全体 ---------- */
function setStatus() {
  const nLocal = Object.keys(local).length;
  const last = meta.last_run ? new Date(meta.last_run) : null;
  const fmt = last ? last.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : null;
  $('status').textContent = (fmt ? `最終取得 ${fmt}` : '自動取得はまだ実行されていません') + (nLocal ? `・この端末の追加 ${nLocal}件` : '');
}

function render() {
  const list = all();
  drawNow(list); drawBest(list); drawHeat(list); fillDays(list); drawCurve(); drawRows(list); setStatus();
}

loadLocal();
render();
try {
  [server, meta] = await Promise.all([getJSON('data/posts.json'), getJSON('data/state.json').catch(() => ({}))]);
  // サーバーに取り込まれた端末分は消す
  const ids = new Set(server.map(p => p.id));
  let pruned = false;
  for (const id of Object.keys(local)) if (ids.has(id)) { delete local[id]; pruned = true; }
  if (pruned) saveLocal();
  render();
} catch (e) {
  $('status').textContent = location.protocol === 'file:'
    ? 'ファイルを直接開くとデータを読み込めません。python3 -m http.server で開いてください'
    : 'データを読み込めませんでした（' + e.message + '）';
}
