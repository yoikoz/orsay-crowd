# オルセー展 混雑ログ

@orsay_annai が投稿する「オルセー美術館所蔵 いまを生きる歓び展（東京都美術館）」の会場混雑状況ポストを、
1日1回 X API で取得して `data/posts.json` に蓄積し、GitHub Pages で混雑傾向を表示します。

```
index.html / js/app.js   表示（posts.json を読み込むだけの静的ページ）
js/parse.js              ポスト本文の解析（ブラウザと Node で共用）
scripts/fetch.mjs        X API 取得 → parse → posts.json に追記（毎日 JST 21:00）
scripts/add-manual.mjs   手動追加・削除（Actions の manual-add から実行）
scripts/lookup-user.mjs  user id を一度だけ調べる
data/posts.json          蓄積データ（1ポスト1レコード、id で重複排除・上書き）
data/state.json          since_id・最終取得日時・月ごとの取得件数と推定コスト
```

## セットアップ

1. **GitHub に public リポジトリを作って push**
2. **X Developer Console**（https://console.x.com）でクレジットを購入し、App の Bearer Token を控える
3. **Secrets と変数を登録**（Settings → Secrets and variables → Actions）
   - Secrets：`X_BEARER_TOKEN` = Bearer Token
   - Variables：`X_USER_ID` = 次の手順で調べた id
4. **user id を一度だけ調べる**（$0.010）
   ```sh
   gh workflow run lookup-user   # Actions 上で実行（トークンは Secrets から読む）。ログに id が出る
   # ローカルで実行する場合: X_BEARER_TOKEN=xxxx node scripts/lookup-user.mjs
   ```
   トークンはコマンドに直接書かず、`.env` を使うかシェルの履歴に残らない方法で渡してください（`.env` は .gitignore 済み）
5. **Pages を有効化**：Settings → Pages → Source を「GitHub Actions」にする
6. **動作確認**：Actions → fetch → Run workflow
   - 初回は `start_time` に会期の開始日などを入れると、過去分をまとめて取得できます（取得したポスト1件ごとに $0.005）
   - 空のまま実行すると、当日 0時（JST）以降の分だけを取得します

## 運用

- 毎日 JST 21:00 ごろに自動取得します。2回目以降は `since_id` を使い、前回以降の分だけを取ります
- 実行ログと Actions のサマリーに「取得件数・混雑ポスト件数・解析失敗の本文・推定コスト・今月の累計」が出ます
  - 推定コストは「取得件数 × $0.005」の上限値です（同じ UTC 日に同じポストを再取得した分は、実際には課金されません）
  - 正確な残高は Developer Console で確認してください
- **解析失敗が出たら**：ログに出た本文を `test/parse.test.mjs` にテストとして追加し、`js/parse.js` を直します
- **手動追加**：サイトの「ポストを手動で追加」に本文を貼り付けて「Actions用にコピー」を押し、Actions → manual-add の `text` 欄に貼って実行します
- **誤ったレコードの削除**：Actions → manual-add の `delete_ids` 欄に id（例：`20261123-1140`）を入れて実行します

## ローカルで確認

```sh
npm test                    # parse とモック取得のテスト（Node 20 以上）
python3 -m http.server 8000 # http://localhost:8000 で表示（ファイルを直接開くとデータを読めません）
```
