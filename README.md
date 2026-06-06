# 設備請修 BI 面板

這是一個適合部署到 Cloudflare Workers Static Assets 的單頁 dashboard。前端放在 `public/`，Worker entry 放在 `src/index.js`，按下「更新資料」時由 Worker 讀取 Google Sheet 發布 CSV。

## Cloudflare Workers 部署設定

如果 Cloudflare 的 Build 設定像這樣：

- Deploy command：`npx wrangler deploy`
- Non-production branch deploy command：`npx wrangler versions upload`

那這份專案會走 Workers Static Assets。專案的 [wrangler.toml](./wrangler.toml) 已設定：

```toml
main = "src/index.js"

[assets]
directory = "public"
binding = "ASSETS"
```

本機測試 Cloudflare Worker：

```bash
npx wrangler dev
```

部署：

```bash
npx wrangler deploy
```

`functions/` 目錄目前保留作為 Cloudflare Pages Functions 版本的參考；如果你是用截圖中的 Workers Builds 設定，實際部署會使用 `src/index.js`。

## 環境變數

正式環境請在 Cloudflare Workers 的 Variables and Secrets 設定：

- `SHEET_CSV_URL`：Google Sheet 發布 CSV 網址。Worker 必須設定這個值。
- `REPAIR_FORM_URL`：按下「我要申請報修」時要開啟的問卷表單網址。

本機 Wrangler 開發可複製：

```bash
cp .dev.vars.example .dev.vars
```

傳統 Node 本機模式可複製：

```bash
cp .env.example .env
```

`server.mjs` 會在本機自動讀取 `.env`。如果沒有設定 `SHEET_CSV_URL`，更新資料 API 會回傳設定錯誤。
## 本機 Node 模式
保留 `server.mjs` 是為了本機或 Railway 類型環境快速測試：

```bash
npm start
```
 
如果 3000 已被占用：

```bash
PORT=3001 npm start
```
