import http from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");

function loadLocalEnv(filePath) {
  if (!existsSync(filePath)) return;

  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const index = trimmed.indexOf("=");
    if (index === -1) continue;

    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadLocalEnv(path.join(__dirname, ".env"));

const PORT = Number(process.env.PORT || 3000);
const SHEET_CSV_URL = process.env.SHEET_CSV_URL;
const REPAIR_FORM_URL = process.env.REPAIR_FORM_URL || "";

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

function sendJson(res, statusCode, body) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(payload);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }

  if (cell.length || row.length) {
    row.push(cell.replace(/\r$/, ""));
    rows.push(row);
  }

  return rows.filter((item) => item.some((value) => String(value).trim()));
}

function normalizeDate(value) {
  const match = String(value || "")
    .trim()
    .match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (!match) return "";
  const [, year, month, day] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function normalizeVendor(value) {
  return String(value || "").trim().toUpperCase() === "V" ? "已回報" : "未標示";
}

function toRecord(row, headers) {
  const get = (name) => row[headers.indexOf(name)] || "";
  return {
    timestamp: get("時間戳記"),
    equipment: get("欲請修設備").trim() || "(空白)",
    location: get("發生地點(快照機填無)").trim() || "(空白)",
    issue: get("遭遇問題").trim(),
    date: normalizeDate(get("發生日期")),
    vendorReported: normalizeVendor(get("是否回報廠商")),
  };
}

async function fetchRepairRequests() {
  if (!SHEET_CSV_URL) {
    throw new Error("SHEET_CSV_URL is not configured.");
  }

  const response = await fetch(SHEET_CSV_URL, {
    headers: {
      "user-agent": "repair-request-bi-dashboard/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`Google Sheet responded with ${response.status}`);
  }

  const text = await response.text();
  const rows = parseCsv(text);
  const headers = rows[0] || [];

  if (!headers.includes("欲請修設備") || !headers.includes("遭遇問題")) {
    throw new Error("Published sheet did not return the expected CSV columns.");
  }

  return rows.slice(1).map((row, index) => ({
    id: index + 1,
    ...toRecord(row, headers),
  }));
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const safePath = path.normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(publicDir, safePath);

  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const file = await readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, {
      "content-type": contentTypes[ext] || "application/octet-stream",
      "cache-control": "no-store",
    });
    res.end(file);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === "/api/repair-requests") {
    try {
      const records = await fetchRepairRequests();
      sendJson(res, 200, {
        source: "google-sheet-published-csv",
        refreshedAt: new Date().toISOString(),
        records,
      });
    } catch (error) {
      sendJson(res, 502, {
        error: "無法更新資料",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
    return;
  }

  if (url.pathname === "/api/config") {
    sendJson(res, 200, {
      repairFormUrl: REPAIR_FORM_URL,
    });
    return;
  }

  await serveStatic(req, res);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Repair dashboard listening on http://localhost:${PORT}`);
});
