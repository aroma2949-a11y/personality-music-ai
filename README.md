# PERSONALITY × MUSIC AI

## 仕組み
Browser → 自分のNode.jsサーバー → OpenAI API → Apple iTunes Search API → Browser

APIキーはブラウザに渡しません。

## 起動
1. Node.jsをインストール
2. このフォルダで `npm install`
3. `.env.example` を `.env` にコピー
4. `OPENAI_API_KEY` と `OPENAI_MODEL` を設定
5. `npm start`
6. `http://localhost:3000` を開く

## 本番公開
Vercel / Render / Railway / Cloud Run等にNodeサーバーとして配置し、環境変数を設定してください。
