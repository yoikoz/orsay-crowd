// @orsay_annai の混雑状況ポストを解析する（ブラウザ・Node 共用、依存なし）
//
// 出力レコード: { id, date, time, dow, hol, entry, shop }
//   id    "20261123-1140"（日付＋時刻。重複排除・上書きのキー）
//   dow   0=日〜6=土   hol  祝日フラグ
//   entry 入場待ち（分） shop ショップ会計待ち（分）。読めなければ null
//
// 年はポストに書かれていないので、基準日時 ref（API取得なら投稿日時、手動なら現在）の
// 年として扱い、基準日より7日以上未来になる場合は前年とする。日付計算はすべて JST 固定。

const JST = 9 * 3600e3;
const DAY = 864e5;

export function norm(s) {
  // NFKC で全角数字・全角コロン・全角括弧・全角スペースを半角に
  return String(s).normalize('NFKC').replace(/[〜～]/g, '~').replace(/\r/g, '');
}

export function toMin(t) {
  if (!t) return null;
  const h = t.match(/(\d+)\s*時間/), m = t.match(/(\d+)\s*分/);
  if (h || m) return (h ? +h[1] * 60 : 0) + (m ? +m[1] : 0);
  if (/なし|無し|ありません|ございません|スムーズ|すぐ/.test(t)) return 0;
  return null;
}

// 日時： 11月23日 (月・祝) 11:40 / 11月23日(月)11時40分 など
const DT = /(\d{1,2})月\s*(\d{1,2})日\s*(?:\(([^)]*)\))?\s*(\d{1,2})\s*(?::|時)\s*(\d{2})/g;

function pick(sentences, kw, except) {
  for (const s of sentences) {
    if (!kw.test(s) || (except && except.test(s))) continue;
    const v = toMin(s);
    if (v != null) return v;
  }
  return null;
}

export function parse(text, ref = new Date()) {
  const s = norm(text);
  const ms = [...s.matchAll(DT)];
  const refJ = new Date(ref.getTime() + JST);
  const refDay = Date.UTC(refJ.getUTCFullYear(), refJ.getUTCMonth(), refJ.getUTCDate());
  return ms.map((m, i) => {
    const seg = s.slice(m.index + m[0].length, i + 1 < ms.length ? ms[i + 1].index : s.length);
    const mo = +m[1], da = +m[2], hh = +m[4], mi = m[5];
    let y = refJ.getUTCFullYear();
    if (Date.UTC(y, mo - 1, da) - refDay >= 7 * DAY) y--;
    const d = new Date(Date.UTC(y, mo - 1, da));
    // 文に区切る。改行が消えた貼り付けでも入場とショップが分かれるよう、ショップ／会計の前でも切る
    const sentences = seg
      .replace(/(ショップ|(?<!ショップの)お?会計)/g, '\n$1')
      .split(/[。\n]/).map(x => x.trim()).filter(Boolean);
    const p2 = n => String(n).padStart(2, '0');
    const date = `${y}-${p2(mo)}-${p2(da)}`;
    return {
      id: `${y}${p2(mo)}${p2(da)}-${p2(hh)}${mi}`,
      date,
      time: `${p2(hh)}:${mi}`,
      dow: d.getUTCDay(),
      hol: /祝/.test(m[3] || ''),
      // 「入場」が無くても「待ち時間はございません」のような文は入場待ちとみなす
      entry: pick(sentences, /入場|入館/, /ショップ|会計/) ?? pick(sentences, /待ち/, /ショップ|会計/),
      shop: pick(sentences, /ショップ|会計/),
    };
  });
}

// 混雑状況ポストかどうか（API取得時の振り分け用）
export const isCrowdPost = text => /混雑状況/.test(norm(text));
