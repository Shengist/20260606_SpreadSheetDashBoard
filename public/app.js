const cacheKey = "repair-dashboard-records-v1";

let records = [];
let filters = {
  equipment: new Set(),
  locationQuery: "",
  years: new Set(),
  startDate: "",
  endDate: "",
};
let repairFormUrl = "";

const elements = {
  dataStatus: document.querySelector("#dataStatus"),
  refreshButton: document.querySelector("#refreshButton"),
  repairFormButton: document.querySelector("#repairFormButton"),
  resetFiltersButton: document.querySelector("#resetFiltersButton"),
  clearActiveFiltersButton: document.querySelector("#clearActiveFiltersButton"),
  equipmentFilterList: document.querySelector("#equipmentFilterList"),
  locationInput: document.querySelector("#locationInput"),
  clearLocationButton: document.querySelector("#clearLocationButton"),
  locationSuggestions: document.querySelector("#locationSuggestions"),
  dateRangeButton: document.querySelector("#dateRangeButton"),
  yearFilterList: document.querySelector("#yearFilterList"),
  datePopover: document.querySelector("#datePopover"),
  startDateInput: document.querySelector("#startDateInput"),
  endDateInput: document.querySelector("#endDateInput"),
  applyDateButton: document.querySelector("#applyDateButton"),
  clearDateButton: document.querySelector("#clearDateButton"),
  totalCount: document.querySelector("#totalCount"),
  filteredCount: document.querySelector("#filteredCount"),
  topEquipment: document.querySelector("#topEquipment"),
  equipmentChart: document.querySelector("#equipmentChart"),
  monthChart: document.querySelector("#monthChart"),
  recordsBody: document.querySelector("#recordsBody"),
  tableSummary: document.querySelector("#tableSummary"),
};

function countBy(items, getKey) {
  const counts = new Map();
  for (const item of items) {
    const key = getKey(item) || "(空白)";
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-Hant"));
}

function formatNumber(value) {
  return new Intl.NumberFormat("zh-TW").format(value);
}

function formatDate(value) {
  return value ? value.replaceAll("-", "/") : "";
}

function monthKey(value) {
  return value ? value.slice(0, 7) : "未標示";
}

function yearKey(value) {
  return value ? value.slice(0, 4) : "";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getFilteredRecords() {
  return records.filter((record) => {
    if (filters.equipment.size && !filters.equipment.has(record.equipment)) return false;
    if (filters.locationQuery && !record.location.toLowerCase().includes(filters.locationQuery.toLowerCase())) return false;
    if (filters.years.size && !filters.years.has(yearKey(record.date))) return false;
    if (filters.startDate && record.date < filters.startDate) return false;
    if (filters.endDate && record.date > filters.endDate) return false;
    return true;
  });
}

function getDateFilteredRecords() {
  return records.filter((record) => {
    if (filters.locationQuery && !record.location.toLowerCase().includes(filters.locationQuery.toLowerCase())) return false;
    if (filters.years.size && !filters.years.has(yearKey(record.date))) return false;
    if (filters.startDate && record.date < filters.startDate) return false;
    if (filters.endDate && record.date > filters.endDate) return false;
    return true;
  });
}

function getDateBounds() {
  const dates = records.map((record) => record.date).filter(Boolean).sort();
  return {
    min: dates[0] || "",
    max: dates.at(-1) || "",
  };
}

function setChangingState() {
  document.body.classList.add("is-changing");
  window.setTimeout(() => document.body.classList.remove("is-changing"), 260);
}

function renderEquipmentFilters() {
  const dateFilteredRecords = getDateFilteredRecords();
  const equipmentCounts = countBy(dateFilteredRecords, (record) => record.equipment);
  const equipmentButtons = equipmentCounts
    .map(([name, value]) => {
      const active = filters.equipment.has(name) ? " active" : "";
      return `
        <button class="filter-pill${active}" type="button" data-equipment="${escapeHtml(name)}">
          <span>${escapeHtml(name)}</span>
          <strong>${formatNumber(value)}</strong>
        </button>
      `;
    })
    .join("");

  elements.equipmentFilterList.innerHTML =
    dateFilteredRecords.length
      ? equipmentButtons
      : `<div class="empty-state compact">${records.length ? "這段時間沒有設備資料" : "按更新資料後顯示設備"}</div>`;
}

function renderLocationSuggestions() {
  const query = filters.locationQuery.trim().toLowerCase();
  if (!records.length) {
    elements.locationSuggestions.innerHTML = `<div class="empty-state compact">按更新資料後可搜尋地點</div>`;
    return;
  }

  if (!query) {
    elements.locationSuggestions.innerHTML = "";
    return;
  }

  const dateAndEquipmentFiltered = records.filter((record) => {
    if (filters.equipment.size && !filters.equipment.has(record.equipment)) return false;
    if (filters.startDate && record.date < filters.startDate) return false;
    if (filters.endDate && record.date > filters.endDate) return false;
    return record.location.toLowerCase().includes(query);
  });
  const suggestions = countBy(dateAndEquipmentFiltered, (record) => record.location).slice(0, 10);

  elements.locationSuggestions.innerHTML =
    suggestions
      .map(
        ([name, value]) => `
          <button class="suggestion-pill" type="button" data-location="${escapeHtml(name)}">
            <span>${escapeHtml(name)}</span>
            <strong>${formatNumber(value)}</strong>
          </button>
        `,
      )
      .join("") || `<div class="empty-state compact">沒有相符地點</div>`;
}

function renderDateButton() {
  if (filters.startDate || filters.endDate) {
    const start = filters.startDate ? formatDate(filters.startDate) : "最早";
    const end = filters.endDate ? formatDate(filters.endDate) : "最新";
    elements.dateRangeButton.textContent = `${start} - ${end}`;
    elements.dateRangeButton.classList.add("active");
  } else {
    elements.dateRangeButton.textContent = "全部期間";
    elements.dateRangeButton.classList.remove("active");
  }
}

function renderYearFilters() {
  const baseRecords = records.filter((record) => {
    if (filters.equipment.size && !filters.equipment.has(record.equipment)) return false;
    if (filters.locationQuery && !record.location.toLowerCase().includes(filters.locationQuery.toLowerCase())) return false;
    if (filters.startDate && record.date < filters.startDate) return false;
    if (filters.endDate && record.date > filters.endDate) return false;
    return true;
  });
  const yearCounts = countBy(baseRecords, (record) => yearKey(record.date))
    .filter(([year]) => year)
    .sort((a, b) => a[0].localeCompare(b[0]));

  elements.yearFilterList.innerHTML =
    yearCounts
      .map(([year, value]) => {
        const active = filters.years.has(year) ? " active" : "";
        return `
          <button class="year-pill${active}" type="button" data-year="${escapeHtml(year)}">
            <span>${escapeHtml(year)}</span>
            <strong>${formatNumber(value)}</strong>
          </button>
        `;
      })
      .join("") || `<div class="empty-state compact">尚無年份資料</div>`;
}

function renderKpis(filtered) {
  const equipmentCounts = countBy(filtered, (record) => record.equipment);

  elements.totalCount.textContent = records.length ? formatNumber(records.length) : "--";
  elements.filteredCount.textContent = records.length ? formatNumber(filtered.length) : "--";
  elements.topEquipment.textContent = equipmentCounts[0]?.[0] || "--";
}

function renderEquipmentChart(filtered) {
  const counts = countBy(filtered, (record) => record.equipment);
  const max = Math.max(...counts.map(([, value]) => value), 1);

  elements.equipmentChart.innerHTML =
    counts
      .map(([name, value]) => {
        const width = Math.max((value / max) * 100, 2);
        return `
          <div class="bar-row">
            <strong title="${escapeHtml(name)}">${escapeHtml(name)}</strong>
            <span class="bar-track"><span class="bar-fill" style="width: ${width}%"></span></span>
            <em>${formatNumber(value)}</em>
          </div>
        `;
      })
      .join("") || `<div class="empty-state">沒有符合條件的資料</div>`;
}

function renderMonthChart(filtered) {
  const monthCounts = new Map();
  for (const record of filtered) {
    const key = monthKey(record.date);
    if (key === "未標示") continue;
    monthCounts.set(key, (monthCounts.get(key) || 0) + 1);
  }
  const months = Array.from({ length: 12 }, (_, index) => index + 1);
  const selectedYears = [...filters.years].sort();
  const years = selectedYears.length
    ? selectedYears
    : [...new Set([...monthCounts.keys()].map((key) => key.slice(0, 4)))].sort();
  const series = selectedYears.length
    ? years.map((year) => ({
        label: year,
        values: months.map((month) => monthCounts.get(`${year}-${String(month).padStart(2, "0")}`) || 0),
      }))
    : [
        {
          label: "歷年加總",
          values: months.map((month) =>
            years.reduce((sum, year) => sum + (monthCounts.get(`${year}-${String(month).padStart(2, "0")}`) || 0), 0),
          ),
        },
      ];
  const svg = elements.monthChart;
  const width = 760;
  const height = 280;
  const padding = { top: 24, right: 24, bottom: 54, left: 42 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const max = Math.max(...series.flatMap((item) => item.values), 1);
  const colors = ["#24506a", "#d9644a", "#357c61", "#7a5aa6", "#b36b2c"];

  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

  if (!series.length) {
    svg.innerHTML = `<text x="${width / 2}" y="${height / 2}" text-anchor="middle" class="axis-label">尚無趨勢資料</text>`;
    return;
  }

  const grid = [0, 0.25, 0.5, 0.75, 1]
    .map((ratio) => {
      const y = padding.top + plotHeight - plotHeight * ratio;
      const label = Math.round(max * ratio);
      return `<line class="grid-line" x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}"></line>
        <text class="axis-label" x="8" y="${y + 4}">${label}</text>`;
    })
    .join("");
  const labels = months
    .map((month, index) => {
      const x = padding.left + (plotWidth / 11) * index;
      return `<text class="axis-label" x="${x}" y="${height - 22}" text-anchor="middle">${month}月</text>`;
    })
    .join("");
  const lines = series
    .map((item, seriesIndex) => {
      const color = colors[seriesIndex % colors.length];
      const points = item.values.map((value, index) => {
        const x = padding.left + (plotWidth / 11) * index;
        const y = padding.top + plotHeight - (value / max) * plotHeight;
        return { x, y, value };
      });
      const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
      const circles = points
        .filter((point) => point.value > 0)
        .map(
          (point) =>
            `<circle class="trend-point" cx="${point.x}" cy="${point.y}" r="4" style="fill: ${color}"><title>${item.label} / ${point.value}</title></circle>`,
        )
        .join("");
      return `<path class="trend-line" d="${path}" style="stroke: ${color}"></path>${circles}`;
    })
    .join("");
  const legend = series
    .map((item, index) => {
      const x = padding.left + index * 88;
      const y = height - 8;
      const color = colors[index % colors.length];
      return `<g class="chart-legend"><line x1="${x}" y1="${y - 4}" x2="${x + 20}" y2="${y - 4}" stroke="${color}" stroke-width="3"></line><text x="${x + 26}" y="${y}" class="axis-label">${item.label}</text></g>`;
    })
    .join("");

  svg.innerHTML = `${grid}${lines}${labels}${legend}`;
}

function renderTable(filtered) {
  const visible = filtered.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 200);
  elements.tableSummary.textContent = records.length
    ? `顯示 ${formatNumber(visible.length)} / ${formatNumber(filtered.length)} 筆`
    : "尚無資料";
  elements.recordsBody.innerHTML =
    visible
      .map(
        (record) => `
          <tr>
            <td>${escapeHtml(formatDate(record.date))}</td>
            <td>${escapeHtml(record.equipment)}</td>
            <td>${escapeHtml(record.location)}</td>
            <td>${escapeHtml(record.issue)}</td>
          </tr>
        `,
      )
      .join("") || `<tr><td colspan="4" class="empty-state">沒有符合條件的資料</td></tr>`;
}

function render() {
  const filtered = getFilteredRecords();
  elements.clearActiveFiltersButton.hidden =
    !filters.equipment.size && !filters.locationQuery && !filters.years.size && !filters.startDate && !filters.endDate;
  renderEquipmentFilters();
  renderLocationSuggestions();
  renderDateButton();
  renderYearFilters();
  renderKpis(filtered);
  renderEquipmentChart(filtered);
  renderMonthChart(filtered);
  renderTable(filtered);
}

function setRecords(nextRecords, refreshedAt, fromCache = false) {
  records = nextRecords;
  const { min, max } = getDateBounds();
  elements.startDateInput.min = min;
  elements.startDateInput.max = max;
  elements.endDateInput.min = min;
  elements.endDateInput.max = max;
  render();

  if (records.length) {
    const label = new Date(refreshedAt).toLocaleString("zh-TW", { hour12: false });
    elements.dataStatus.textContent = `${fromCache ? "使用暫存資料" : "更新完成"}：${label}`;
  } else {
    elements.dataStatus.textContent = "尚未更新資料";
  }
}

async function refreshData() {
  elements.refreshButton.disabled = true;
  elements.refreshButton.textContent = "更新中";
  elements.dataStatus.textContent = "正在讀取發布資料...";
  document.body.classList.add("is-updating");

  try {
    const response = await fetch("/api/repair-requests", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.detail || payload.error || "更新失敗");
    localStorage.setItem(cacheKey, JSON.stringify(payload));
    setRecords(payload.records, payload.refreshedAt);
    setChangingState();
  } catch (error) {
    elements.dataStatus.textContent = `更新失敗：${error.message}`;
  } finally {
    elements.refreshButton.disabled = false;
    elements.refreshButton.textContent = "更新資料";
    document.body.classList.remove("is-updating");
  }
}

async function loadConfig() {
  const response = await fetch("/api/config", { cache: "no-store" });
  const payload = await response.json();
  repairFormUrl = payload.repairFormUrl || "";
}

function resetFilters() {
  filters = { equipment: new Set(), locationQuery: "", years: new Set(), startDate: "", endDate: "" };
  elements.locationInput.value = "";
  elements.startDateInput.value = "";
  elements.endDateInput.value = "";
  elements.datePopover.hidden = true;
  setChangingState();
  render();
}

elements.refreshButton.addEventListener("click", refreshData);
elements.resetFiltersButton.addEventListener("click", resetFilters);
elements.clearActiveFiltersButton.addEventListener("click", resetFilters);
elements.repairFormButton.addEventListener("click", () => {
  if (repairFormUrl) {
    window.open(repairFormUrl, "_blank", "noopener,noreferrer");
    return;
  }
  alert("尚未設定報修表單連結。部署時請設定 REPAIR_FORM_URL 環境變數。");
});

elements.equipmentFilterList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-equipment]");
  if (!button) return;
  const value = button.dataset.equipment;
  if (filters.equipment.has(value)) {
    filters.equipment.delete(value);
  } else {
    filters.equipment.add(value);
  }
  setChangingState();
  render();
});

elements.locationInput.addEventListener("input", (event) => {
  filters.locationQuery = event.target.value.trim();
  setChangingState();
  render();
});

elements.clearLocationButton.addEventListener("click", () => {
  filters.locationQuery = "";
  elements.locationInput.value = "";
  setChangingState();
  render();
});

elements.yearFilterList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-year]");
  if (!button) return;
  const value = button.dataset.year;
  if (filters.years.has(value)) {
    filters.years.delete(value);
  } else {
    filters.years.add(value);
  }
  setChangingState();
  render();
});

elements.locationSuggestions.addEventListener("click", (event) => {
  const button = event.target.closest("[data-location]");
  if (!button) return;
  filters.locationQuery = button.dataset.location || "";
  elements.locationInput.value = filters.locationQuery;
  setChangingState();
  render();
});

elements.dateRangeButton.addEventListener("click", () => {
  elements.startDateInput.value = filters.startDate;
  elements.endDateInput.value = filters.endDate;
  elements.datePopover.hidden = !elements.datePopover.hidden;
});

elements.applyDateButton.addEventListener("click", () => {
  const start = elements.startDateInput.value;
  const end = elements.endDateInput.value;
  filters.startDate = start && end && start > end ? end : start;
  filters.endDate = start && end && start > end ? start : end;
  elements.startDateInput.value = filters.startDate;
  elements.endDateInput.value = filters.endDate;
  elements.datePopover.hidden = true;
  setChangingState();
  render();
});

elements.clearDateButton.addEventListener("click", () => {
  filters.startDate = "";
  filters.endDate = "";
  elements.startDateInput.value = "";
  elements.endDateInput.value = "";
  elements.datePopover.hidden = true;
  setChangingState();
  render();
});

document.addEventListener("click", (event) => {
  const insideDateFilter = event.target.closest(".period-filter");
  if (!insideDateFilter) elements.datePopover.hidden = true;
});

try {
  const cached = JSON.parse(localStorage.getItem(cacheKey) || "null");
  if (cached?.records?.length) {
    setRecords(cached.records, cached.refreshedAt, true);
  } else {
    render();
  }
} catch {
  render();
}

loadConfig();
