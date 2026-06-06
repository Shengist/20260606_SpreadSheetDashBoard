# 設備請修 BI 面板

這是一個適合部署到 Cloudflare Pages 的單頁 dashboard。前端放在 `public/`，資料 API 放在 `functions/`，使用 Cloudflare Pages Functions 在按下「更新資料」時讀取 Google Sheet 發布 CSV。

## Cloudflare Pages 部署設定

在 Cloudflare Pages 專案中使用：

- Framework preset：`None`
- Build command：留空
- Build output directory：`public`
- Functions directory：`functions`

專案也包含 [wrangler.toml](./wrangler.toml)，其中已設定：

```toml
pages_build_output_dir = "public"
```

如果 Cloudflare 顯示 `Could not detect a directory containing static files`，通常是 Pages 的 build output directory 沒設成 `public`，或 deploy command 沒有明確指向 `public`。

也可以用 Wrangler：

```bash
npm run pages:dev
npm run pages:deploy
```

## 環境變數

正式環境請在 Cloudflare Pages 的環境變數頁面設定：

- `SHEET_CSV_URL`：Google Sheet 發布 CSV 網址。Cloudflare Pages Functions 必須設定這個值。
- `REPAIR_FORM_URL`：按下「我要申請報修」時要開啟的問卷表單網址。

本機 Cloudflare Pages Functions 開發可複製：

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
