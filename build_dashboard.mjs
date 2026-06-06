import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const inputCsv = "published_sheet.csv";
const outputDir = path.join(process.cwd(), "outputs", "repair-dashboard");
const outputPath = path.join(outputDir, "repair_request_dashboard.xlsx");

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
  return rows.filter((r) => r.some((v) => String(v).trim() !== ""));
}

function parseDate(value) {
  const match = String(value || "").trim().match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function excelDate(date) {
  return date ? new Date(date.getFullYear(), date.getMonth(), date.getDate()) : null;
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function countBy(rows, index, normalizer = (v) => String(v || "").trim() || "(空白)") {
  const counts = new Map();
  for (const row of rows) {
    const key = normalizer(row[index]);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-Hant"));
}

function topWithOther(counts, limit) {
  const top = counts.slice(0, limit);
  const other = counts.slice(limit).reduce((sum, [, count]) => sum + count, 0);
  return other > 0 ? [...top, ["其他", other]] : top;
}

function colLetter(n) {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function setBlock(sheet, address, values) {
  sheet.getRange(address).values = values;
}

function styleHeader(range) {
  range.format = {
    fill: "#24495E",
    font: { color: "#FFFFFF", bold: true },
    horizontalAlignment: "center",
    verticalAlignment: "center",
    wrapText: true,
    borders: { preset: "all", style: "thin", color: "#D6DEE4" },
  };
}

function styleTable(range) {
  range.format = {
    fill: "#FFFFFF",
    font: { color: "#25313A", size: 10 },
    borders: { preset: "all", style: "thin", color: "#DFE7EC" },
    verticalAlignment: "center",
  };
}

const csv = await fs.readFile(inputCsv, "utf8");
const parsed = parseCsv(csv);
const headers = parsed[0];
const body = parsed.slice(1);
const dateIndex = headers.indexOf("發生日期");
const equipmentIndex = headers.indexOf("欲請修設備");
const locationIndex = headers.indexOf("發生地點(快照機填無)");
const vendorIndex = headers.indexOf("是否回報廠商");

const rawRows = body.map((row) => {
  const date = parseDate(row[dateIndex]);
  return [
    row[0],
    row[1],
    row[2],
    row[3],
    excelDate(date),
    row[5],
    row[6],
    date ? monthKey(date) : "",
    String(row[vendorIndex] || "").trim().toUpperCase() === "V" ? "已回報" : "未標示",
  ];
});

const parsedDates = rawRows.map((r) => r[4]).filter(Boolean);
const equipmentCounts = countBy(body, equipmentIndex);
const locationCounts = countBy(body, locationIndex).slice(0, 15);
const vendorCounts = countBy(body, vendorIndex, (v) =>
  String(v || "").trim().toUpperCase() === "V" ? "已回報" : "未標示",
);
const monthCountsMap = new Map();
for (const date of parsedDates) {
  const key = monthKey(date);
  monthCountsMap.set(key, (monthCountsMap.get(key) || 0) + 1);
}
const monthCounts = [...monthCountsMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));
const recentMonths = monthCounts.slice(-12);

const workbook = Workbook.create();
const dashboard = workbook.worksheets.add("Dashboard");
const summary = workbook.worksheets.add("Summary");
const raw = workbook.worksheets.add("Raw Data");

const rawHeaders = [...headers, "月份", "回報廠商(標準化)"];
setBlock(raw, `A1:${colLetter(rawHeaders.length)}${rawRows.length + 1}`, [rawHeaders, ...rawRows]);
raw.getRange("A1:I1").format.fill = "#24495E";
raw.getRange("A1:I1").format.font = { color: "#FFFFFF", bold: true };
raw.getRange(`A1:I${rawRows.length + 1}`).format.borders = { preset: "all", style: "thin", color: "#D6DEE4" };
raw.getRange(`E2:E${rawRows.length + 1}`).format.numberFormat = "yyyy-mm-dd";
raw.getRange("A:A").format.columnWidthPx = 175;
raw.getRange("B:B").format.columnWidthPx = 110;
raw.getRange("C:C").format.columnWidthPx = 135;
raw.getRange("D:D").format.columnWidthPx = 360;
raw.getRange("E:E").format.columnWidthPx = 100;
raw.getRange("F:F").format.columnWidthPx = 135;
raw.getRange("G:I").format.columnWidthPx = 110;
raw.getRange(`D2:D${rawRows.length + 1}`).format.wrapText = true;
raw.freezePanes.freezeRows(1);

setBlock(summary, "A1:B1", [["設備", "案件數"]]);
setBlock(summary, `A2:B${equipmentCounts.length + 1}`, equipmentCounts);
styleHeader(summary.getRange("A1:B1"));
styleTable(summary.getRange(`A2:B${equipmentCounts.length + 1}`));

setBlock(summary, "D1:E1", [["地點", "案件數"]]);
setBlock(summary, `D2:E${locationCounts.length + 1}`, locationCounts);
styleHeader(summary.getRange("D1:E1"));
styleTable(summary.getRange(`D2:E${locationCounts.length + 1}`));

setBlock(summary, "G1:H1", [["月份", "案件數"]]);
setBlock(summary, `G2:H${monthCounts.length + 1}`, monthCounts);
styleHeader(summary.getRange("G1:H1"));
styleTable(summary.getRange(`G2:H${monthCounts.length + 1}`));

setBlock(summary, "J1:K1", [["回報廠商", "案件數"]]);
setBlock(summary, `J2:K${vendorCounts.length + 1}`, vendorCounts);
styleHeader(summary.getRange("J1:K1"));
styleTable(summary.getRange(`J2:K${vendorCounts.length + 1}`));

summary.getRange("A:K").format.font = { name: "Aptos", size: 10 };
summary.getRange("A:A").format.columnWidthPx = 130;
summary.getRange("B:B").format.columnWidthPx = 80;
summary.getRange("D:D").format.columnWidthPx = 140;
summary.getRange("E:E").format.columnWidthPx = 80;
summary.getRange("G:G").format.columnWidthPx = 90;
summary.getRange("H:H").format.columnWidthPx = 80;
summary.getRange("J:J").format.columnWidthPx = 110;
summary.getRange("K:K").format.columnWidthPx = 80;
summary.freezePanes.freezeRows(1);

dashboard.getRange("A1:N38").format.fill = "#F5F8FA";
dashboard.getRange("A1:N38").format.font = { name: "Aptos", color: "#25313A" };
setBlock(dashboard, "A1:N1", [["設備請修回報 Dashboard", "", "", "", "", "", "", "", "", "", "", "", "", ""]]);
dashboard.getRange("A1:N1").format = {
  fill: "#24495E",
  font: { color: "#FFFFFF", bold: true, size: 18 },
  horizontalAlignment: "left",
  verticalAlignment: "center",
};
dashboard.getRange("A1:N1").format.rowHeightPx = 38;
setBlock(dashboard, "A2:N2", [[`資料來源：Google Sheet 發布 CSV；更新時間：${new Date().toISOString().slice(0, 10)}`, "", "", "", "", "", "", "", "", "", "", "", "", ""]]);
dashboard.getRange("A2:N2").format.font = { color: "#60717D", size: 10 };

setBlock(dashboard, "A4:B6", [["總案件數", rawRows.length], ["日期範圍", `${monthKey(new Date(Math.min(...parsedDates)))} 至 ${monthKey(new Date(Math.max(...parsedDates)))}`], ["設備種類", equipmentCounts.length]]);
setBlock(dashboard, "D4:E6", [["最高設備", equipmentCounts[0][0]], ["最高地點", locationCounts[0][0]], ["已回報廠商", vendorCounts.find((v) => v[0] === "已回報")?.[1] || 0]]);
setBlock(dashboard, "G4:H6", [["近 12 月案件", recentMonths.reduce((sum, [, v]) => sum + v, 0)], ["最新月份", recentMonths.at(-1)?.[0] || ""], ["最新月案件", recentMonths.at(-1)?.[1] || 0]]);
for (const address of ["A4:B6", "D4:E6", "G4:H6"]) {
  const r = dashboard.getRange(address);
  r.format = {
    fill: "#FFFFFF",
    borders: { preset: "all", style: "thin", color: "#D6DEE4" },
    verticalAlignment: "center",
  };
}
dashboard.getRange("A4:A6").format.font = { bold: true, color: "#60717D" };
dashboard.getRange("D4:D6").format.font = { bold: true, color: "#60717D" };
dashboard.getRange("G4:G6").format.font = { bold: true, color: "#60717D" };
dashboard.getRange("B4:B6").format.font = { bold: true, size: 13, color: "#24495E" };
dashboard.getRange("E4:E6").format.font = { bold: true, size: 13, color: "#24495E" };
dashboard.getRange("H4:H6").format.font = { bold: true, size: 13, color: "#24495E" };

const topEquip = topWithOther(equipmentCounts, 5);
setBlock(dashboard, "A9:B9", [["設備 Top 5 + 其他", "案件數"]]);
setBlock(dashboard, `A10:B${topEquip.length + 9}`, topEquip);
styleHeader(dashboard.getRange("A9:B9"));
styleTable(dashboard.getRange(`A10:B${topEquip.length + 9}`));

const topLocations = locationCounts.slice(0, 10);
setBlock(dashboard, "D9:E9", [["地點 Top 10", "案件數"]]);
setBlock(dashboard, `D10:E${topLocations.length + 9}`, topLocations);
styleHeader(dashboard.getRange("D9:E9"));
styleTable(dashboard.getRange(`D10:E${topLocations.length + 9}`));

setBlock(dashboard, "A22:B22", [["月份", "案件數"]]);
setBlock(dashboard, `A23:B${recentMonths.length + 22}`, recentMonths);
styleHeader(dashboard.getRange("A22:B22"));
styleTable(dashboard.getRange(`A23:B${recentMonths.length + 22}`));

setBlock(dashboard, "D22:E22", [["回報廠商", "案件數"]]);
setBlock(dashboard, `D23:E${vendorCounts.length + 22}`, vendorCounts);
styleHeader(dashboard.getRange("D22:E22"));
styleTable(dashboard.getRange(`D23:E${vendorCounts.length + 22}`));

dashboard.getRange("A:N").format.columnWidthPx = 92;
dashboard.getRange("A:A").format.columnWidthPx = 135;
dashboard.getRange("B:B").format.columnWidthPx = 76;
dashboard.getRange("D:D").format.columnWidthPx = 150;
dashboard.getRange("E:E").format.columnWidthPx = 76;
dashboard.getRange("G:G").format.columnWidthPx = 120;
dashboard.getRange("H:H").format.columnWidthPx = 90;

const equipmentChart = dashboard.charts.add("ColumnClustered", dashboard.getRange(`A9:B${topEquip.length + 9}`), "Auto");
equipmentChart.title.text = "設備類型案件數";
equipmentChart.setPosition(dashboard.getRange("G9:N19"));
equipmentChart.width = 590;
equipmentChart.height = 285;
equipmentChart.hasLegend = false;
equipmentChart.yAxis = { title: { text: "案件數" }, majorGridlines: { fill: "#D6DEE4", style: "solid", width: 1 } };
equipmentChart.xAxis = { textStyle: { fontSize: 9 } };

const monthChart = dashboard.charts.add("line", {
  title: "近 12 個有資料月份趨勢",
  categories: recentMonths.map(([m]) => m),
  series: [{ name: "案件數", values: recentMonths.map(([, v]) => v) }],
  from: { row: 21, col: 6 },
  extent: { widthPx: 640, heightPx: 250 },
  hasLegend: false,
  lineOptions: { smooth: false },
  dataLabels: { showValue: false },
});
monthChart.yAxis = { title: { text: "案件數" }, majorGridlines: { fill: "#D6DEE4", style: "solid", width: 1 } };
monthChart.xAxis = { textStyle: { fontSize: 9 }, tickLabelInterval: 1 };

await fs.mkdir(outputDir, { recursive: true });

const check = await workbook.inspect({
  kind: "table",
  range: "Dashboard!A1:H12",
  include: "values,formulas",
  tableMaxRows: 12,
  tableMaxCols: 8,
});
console.log(check.ndjson);

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  summary: "final formula error scan",
});
console.log(errors.ndjson);

await workbook.render({ sheetName: "Dashboard", range: "A1:N38", scale: 1 });
await workbook.render({ sheetName: "Summary", range: "A1:K20", scale: 1 });
await workbook.render({ sheetName: "Raw Data", range: "A1:I25", scale: 1 });

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
console.log(outputPath);
