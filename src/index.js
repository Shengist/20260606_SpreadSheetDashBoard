import { normalizeDate, normalizeVendor, parseCsv } from "../functions/_utils/csv.js";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function toRecord(row, headers, index) {
  const get = (name) => row[headers.indexOf(name)] || "";
  return {
    id: index + 1,
    timestamp: get("時間戳記"),
    equipment: get("欲請修設備").trim() || "(空白)",
    location: get("發生地點(快照機填無)").trim() || "(空白)",
    issue: get("遭遇問題").trim(),
    date: normalizeDate(get("發生日期")),
    vendorReported: normalizeVendor(get("是否回報廠商")),
  };
}

async function fetchRepairRequests(env) {
  if (!env.SHEET_CSV_URL) {
    throw new Error("SHEET_CSV_URL is not configured.");
  }

  const response = await fetch(env.SHEET_CSV_URL, {
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

  return rows.slice(1).map((row, index) => toRecord(row, headers, index));
}

async function handleApi(request, env) {
  const url = new URL(request.url);

  if (url.pathname === "/api/config") {
    return json({
      repairFormUrl: env.REPAIR_FORM_URL || "",
    });
  }

  if (url.pathname === "/api/repair-requests") {
    try {
      const records = await fetchRepairRequests(env);
      return json({
        source: "google-sheet-published-csv",
        refreshedAt: new Date().toISOString(),
        records,
      });
    } catch (error) {
      return json(
        {
          error: "無法更新資料",
          detail: error instanceof Error ? error.message : String(error),
        },
        502,
      );
    }
  }

  return null;
}

export default {
  async fetch(request, env) {
    const apiResponse = await handleApi(request, env);
    if (apiResponse) return apiResponse;

    return env.ASSETS.fetch(request);
  },
};
