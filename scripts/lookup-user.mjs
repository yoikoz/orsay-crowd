// 一度だけ実行して @orsay_annai の user id を調べる（ユーザー読み取り1件 = $0.010）
//   X_BEARER_TOKEN=... node scripts/lookup-user.mjs [username]
import { PRICE, usd } from './lib.mjs';

const username = process.argv[2] || 'orsay_annai';
const token = process.env.X_BEARER_TOKEN;
if (!token) { console.error('ERROR: X_BEARER_TOKEN が設定されていません'); process.exit(1); }

const res = await fetch(`https://api.x.com/2/users/by/username/${encodeURIComponent(username)}`, {
  headers: { Authorization: `Bearer ${token}` },
});
const body = await res.json();
if (!res.ok || !body.data) { console.error(`ERROR: HTTP ${res.status} ${JSON.stringify(body)}`); process.exit(1); }
console.log(`@${body.data.username}  name=${body.data.name}  id=${body.data.id}`);
console.log(`推定コスト ${usd(PRICE.userRead)}`);
console.log(`→ GitHub のリポジトリ変数 X_USER_ID に ${body.data.id} を登録してください`);
