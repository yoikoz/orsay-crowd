# オルセー展 混雑ログ

東京都美術館で開催中の「オルセー美術館所蔵 いまを生きる歓び展」の入場待ち時間を毎日記録し、**空いている曜日と時間帯**を調べられるようにしたサイトです。

**サイト：https://yoikoz.github.io/orsay-crowd/**

- いまの入場待ち時間と、ショップ会計の待ち時間
- 平日・土日祝それぞれの空いている時間帯と、いちばん混む時間帯
- 曜日×30分ごとの平均待ち時間（ヒートマップ）
- 時間帯ごとの変化と、日ごとの実測値

> 非公式の個人プロジェクトです。美術館・主催者とは関係ありません。
> 最新の状況は、公式アカウント [@orsay_annai](https://x.com/orsay_annai) で確認してください。
> 過去の傾向は、その日の混雑を保証するものではありません。

## データの出どころ

公式アカウント [@orsay_annai](https://x.com/orsay_annai) が投稿する「会場混雑状況」ポストがもとになっています。

- 毎日 21時ごろ（閉館後）に、X API でその日の新しいポストを取得します
- 混雑状況のポストから、**日時と待ち時間の数値だけ**を取り出して保存します。ポストの本文は保存しません
- 混雑状況以外のポストは、取得したあとすぐに捨てます
- 自動取得で漏れたポストは、手動で補完することがあります

## データを使う

蓄積したデータは [`data/posts.json`](data/posts.json) にあり、サイトの「記録一覧」から CSV でもダウンロードできます。
1件が混雑状況ポスト1件分です。

```json
{"id":"20261123-1140","date":"2026-11-23","time":"11:40","dow":1,"hol":true,"entry":50,"shop":10,"src":"api","tid":"2124695553519042931"}
```

| 項目 | 内容 |
|---|---|
| `id` | 日付と時刻（`YYYYMMDD-HHMM`） |
| `date` / `time` | ポストに書かれた日時（日本時間） |
| `dow` | 曜日（0=日〜6=土） |
| `hol` | 祝日なら `true` |
| `entry` | 入場までの待ち時間（分）。読み取れなかった場合は `null` |
| `shop` | ショップ会計の待ち時間（分）。記載がない場合は `null` |
| `src` | `api`（自動取得）または `manual`（手動補完） |
| `tid` | 元のポストの ID（自動取得分のみ） |

ポストに年は書かれていないため、投稿日時から年を補っています。

## しくみ

GitHub Actions と GitHub Pages だけで動いています。サーバーとデータベースは使っていません。

```
毎日 21:00 JST  GitHub Actions ─ X API でポスト取得 ─ 解析 ─ data/posts.json にコミット
                                                                  │
                                    GitHub Pages ← サイトを更新 ──┘
```

| ファイル | 役割 |
|---|---|
| `index.html`, `js/app.js` | サイト本体（`data/posts.json` を読み込んで集計・表示する静的ページ） |
| `js/parse.js` | ポスト本文の解析（ブラウザと Node.js で共用） |
| `scripts/fetch.mjs` | X API から取得して `data/posts.json` に追記 |
| `scripts/add-manual.mjs` | 手動での追加・削除 |
| `scripts/lookup-user.mjs` | アカウントの user id を調べる（初回のみ） |
| `.github/workflows/` | 定期取得（`fetch`）、手動追加（`manual-add`）、公開（`pages`）、id の確認（`lookup-user`） |

## 自分で動かす

このリポジトリを fork すれば、同じしくみで動かせます。X API は従量課金で、ポストの読み取り1件につき $0.005 かかります（1日10〜20件で月 $1.5〜3 程度）。最新の料金は [X API のドキュメント](https://docs.x.com/x-api/getting-started/pricing) で確認してください。

1. [X Developer Console](https://console.x.com) で App を作ってクレジットを購入し、Bearer Token を発行する
2. fork したリポジトリに Bearer Token を登録する
   ```sh
   gh secret set X_BEARER_TOKEN
   ```
3. Settings → Pages の Source を「GitHub Actions」にする
4. Actions → `lookup-user` を実行し、ログに出た id をリポジトリ変数に登録する（ユーザーの読み取り1件 $0.010）
   ```sh
   gh variable set X_USER_ID --body <id>
   ```
5. Actions → `fetch` を実行する。`start_time` に日時（例：`2026-11-01T00:00:00+09:00`）を入れると、その時点以降をまとめて取得できる

以降は毎日 JST 21:00 に自動で取得します。実行ログに取得件数と推定コストが出ます。

### ローカルで確認

```sh
npm test                     # テスト（Node.js 20 以上）
python3 -m http.server 8000  # http://localhost:8000 で表示
```

`index.html` をファイルとして直接開くと、データを読み込めません。上のようにローカルサーバー経由で開いてください。

## 不具合・ご意見

表示がおかしい、待ち時間の読み取りが間違っているなどは [Issues](https://github.com/yoikoz/orsay-crowd/issues) で知らせてください。
