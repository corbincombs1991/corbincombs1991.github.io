(() => {
  "use strict";

  const colors = ["#8eb9ff", "#d6a3ff", "#ffb78e", "#80ded6"];
  const safeAsset = asset => typeof asset === "string" && /^reports\/[A-Za-z0-9._-]+\.json$/.test(asset) ? asset : null;
  const series = values => Array.isArray(values) && values.every(Number.isFinite) ? values : [];
  const records = report => Array.isArray(report.matching_records) ? report.matching_records : [];
  const count = value => Number.isInteger(value) && value >= 0 ? value : "Not supplied";
  const matchStyle = index => ({ color: colors[index % colors.length], dash: index % 2 ? "6 4" : "" });

  function formatDate(value) {
    if (typeof value !== "string" || !value.trim()) return "Not supplied";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Not supplied" : new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(date);
  }

  function filterReports(reports, k) {
    return reports.map((entry, index) => ({ entry, index })).filter(({ entry }) => k === "" || entry.k === Number(k));
  }

  function chartMarkup(report, availableWidth) {
    const query = series(report.query?.normalized);
    const matches = records(report).map(record => series(record.normalized));
    const all = [query, ...matches].flat();
    if (!all.length) return '<p class="empty">This report does not include chart values.</p>';
    const width = Math.max(260, Math.round(availableWidth || 760));
    const height = 280, left = 45, right = 22, top = 42, bottom = 48;
    const steps = Math.max(query.length, ...matches.map(values => values.length));
    let minimum = Math.min(...all), maximum = Math.max(...all);
    const padding = (maximum - minimum || 1) * .12;
    minimum -= padding;
    maximum += padding;
    const x = index => steps > 1 ? left + index / (steps - 1) * (width - left - right) : (left + width - right) / 2;
    const y = value => height - bottom - (value - minimum) / (maximum - minimum) * (height - top - bottom);
    let markup = `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="pattern-title pattern-desc"><title id="pattern-title">Sample query and matching patterns</title><desc id="pattern-desc">Normalized synthetic values by observation number. The solid green line is the query. Match colors and line styles are listed below the chart. The yellow line marks the query's last observation; outcomes are listed separately.</desc><text class="axis-label" x="${left}" y="17">Normalized value</text>`;
    for (let index = 0; index < 5; index++) {
      const value = minimum + (maximum - minimum) * index / 4;
      markup += `<line class="grid" x1="${left}" x2="${width - right}" y1="${y(value)}" y2="${y(value)}"/><text x="${left - 8}" y="${y(value) + 4}" text-anchor="end">${value.toFixed(1)}</text>`;
    }
    const ticks = Math.min(steps, width < 500 ? 4 : 7);
    for (let index = 0; index < ticks; index++) {
      const step = ticks > 1 ? Math.round(index * (steps - 1) / (ticks - 1)) : 0;
      markup += `<text x="${x(step)}" y="${height - bottom + 21}" text-anchor="middle">${step + 1}</text>`;
    }
    markup += `<text class="axis-label" x="${(left + width - right) / 2}" y="${height - 9}" text-anchor="middle">Observation number</text>`;
    if (query.length) {
      const boundary = x(query.length - 1);
      const anchor = boundary > width / 2 ? "end" : "start";
      markup += `<line class="boundary" x1="${boundary}" x2="${boundary}" y1="${top - 8}" y2="${height - bottom}"/><text class="boundary-label" x="${boundary}" y="${top - 15}" text-anchor="${anchor}">Decision point</text>`;
    }
    const plot = (values, color, dash = "") => {
      if (!values.length) return "";
      const points = values.map((value, index) => `${x(index).toFixed(2)},${y(value).toFixed(2)}`).join(" ");
      let line = `<polyline fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="${dash}" points="${points}"/>`;
      if (values.length <= 12) values.forEach((value, index) => {
        line += `<circle cx="${x(index)}" cy="${y(value)}" r="3" fill="${color}"/>`;
      });
      return line;
    };
    matches.forEach((values, index) => {
      const style = matchStyle(index);
      markup += plot(values, style.color, style.dash);
    });
    return markup + plot(query, "#52ff93") + "</svg>";
  }

  // A later selection owns the UI, even if an older request ignores cancellation.
  function latestRequest(onResult, onError) {
    let revision = 0, controller;
    return async job => {
      const current = ++revision;
      if (controller) controller.abort();
      controller = new AbortController();
      const signal = controller.signal;
      const isCurrent = () => current === revision;
      try {
        const result = await job({ signal, isCurrent });
        if (isCurrent()) onResult(result);
      } catch (error) {
        if (isCurrent()) onError(error);
      }
    };
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { formatDate, safeAsset, filterReports, chartMarkup, latestRequest };
    return;
  }

  const reportSelect = document.querySelector("#report");
  const kSelect = document.querySelector("#k");
  const controls = document.querySelector("#controls");
  const reportLabel = document.querySelector("#report-label");
  const kLabel = document.querySelector("#k-label");
  const status = document.querySelector("#status");
  const content = document.querySelector("#content");
  const retry = document.querySelector("#retry");
  let manifest = null, chartObserver = null;

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  async function fetchJSON(url, signal) {
    const response = await fetch(url, { credentials: "omit", signal });
    if (!response.ok) throw new Error(`The sample file could not be loaded (HTTP ${response.status}).`);
    return response.json();
  }

  function validateReport(report) {
    if (!report || report.schema_version !== 1 || (report.matching_records != null && (!Array.isArray(report.matching_records) || report.matching_records.some(row => !row || typeof row !== "object")))) {
      throw new Error("This sample report has an unsupported format.");
    }
    return report;
  }

  function setLoading() {
    if (chartObserver) chartObserver.disconnect();
    content.hidden = true;
    content.setAttribute("aria-busy", "true");
    status.className = "status";
    status.textContent = "Loading sample report…";
    retry.hidden = true;
  }

  function fail(error) {
    content.hidden = true;
    content.setAttribute("aria-busy", "false");
    status.className = "status error";
    status.textContent = error instanceof SyntaxError ? "The sample file could not be read. Please try again." : `Unable to load this sample. ${error.message || "Please try again."}`;
    retry.hidden = false;
  }

  function addValue(list, label, value) {
    const row = node("div");
    row.append(node("dt", "", label), node("dd", "", value));
    list.append(row);
  }

  function render({ report, entry } = {}) {
    content.replaceChildren();
    content.hidden = false;
    content.setAttribute("aria-busy", "false");
    if (!report) {
      content.append(node("p", "empty", "No sample reports are available yet. Please check back later."));
      status.textContent = "No reports available.";
      return;
    }
    const rows = records(report);
    const card = node("article", "card");
    card.append(node("h2", "", `Sample query · ${formatDate(entry.query_date)}`));
    card.append(node("p", "meta", `Method: ${report.route || entry.model || "Not supplied"} · Source as of ${formatDate(entry.source_as_of || report.provenance?.source_as_of)}`));
    const stats = node("dl", "stats");
    [["Requested matches", report.matching?.requested_k ?? entry.k], ["Selected matches", report.matching?.selected_count], ["Eligible matches", report.matching?.eligible_count]].forEach(([label, value]) => {
      const stat = node("div", "stat");
      stat.append(node("dt", "", label), node("dd", "", count(value)));
      stats.append(stat);
    });
    card.append(stats);
    if (Number.isInteger(report.matching?.requested_k) && Number.isInteger(report.matching?.selected_count) && report.matching.selected_count < report.matching.requested_k) {
      card.append(node("p", "note", `This fixture supplies ${report.matching.selected_count} selected matches for a request of ${report.matching.requested_k}. No additional matches have been added.`));
    }
    const figure = node("figure");
    const chart = node("div", "chart-host");
    const legend = node("ul", "legend");
    legend.setAttribute("aria-label", "Chart legend");
    const legendItem = (label, color, dash = "") => {
      const item = node("li");
      item.innerHTML = `<svg viewBox="0 0 25 12" aria-hidden="true"><line x1="0" y1="6" x2="25" y2="6" stroke="${color}" stroke-width="3" stroke-dasharray="${dash}"/></svg>`;
      item.append(document.createTextNode(label));
      legend.append(item);
    };
    if (series(report.query?.normalized).length) legendItem("Query", "#52ff93");
    rows.forEach((row, index) => {
      if (series(row.normalized).length) {
        const style = matchStyle(index);
        legendItem(`Match ${index + 1}`, style.color, style.dash);
      }
    });
    figure.append(chart, legend, node("figcaption", "", "Normalized sample values are shown by observation number, not calendar date or price. Yellow marks the query’s final observation. Outcome paths are not supplied; available outcome values appear below."));
    card.append(figure);
    card.append(node("h3", "", "Match details"));
    card.append(node("p", "note", "Distance measures pattern difference; a smaller value means a closer match. Returns below are synthetic examples. The fixture does not specify an outcome time window."));
    const matches = node("div", "matches");
    const outcomes = Array.isArray(report.outcomes) ? report.outcomes.filter(outcome => outcome && typeof outcome === "object") : [];
    rows.forEach((row, index) => {
      const match = node("section", "match-card");
      match.append(node("h3", "", `Match ${index + 1}`), node("p", "meta", row.identifier || "Identifier not supplied"));
      const values = node("dl", "match-values");
      const outcome = outcomes.find(value => row.identifier != null && value.identifier === row.identifier);
      const available = outcome?.available === true;
      const direction = available ? ({ "1": "Up", "0": "Unchanged", "-1": "Down" })[outcome.direction] : null;
      const result = available && Number.isFinite(outcome.simple_return) ? new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 2, signDisplay: "exceptZero" }).format(outcome.simple_return) : "Not supplied";
      addValue(values, "Pattern distance", Number.isFinite(row.distance) ? row.distance.toLocaleString("en-US", { maximumFractionDigits: 4 }) : "Not supplied");
      addValue(values, "Outcome direction", direction || "Not supplied");
      addValue(values, "Sample return", result);
      match.append(values);
      matches.append(match);
    });
    if (!rows.length) matches.append(node("p", "empty", "No matching records are included in this report."));
    card.append(matches);
    const source = node("a", "data-link", "View this sample’s source data →");
    source.href = safeAsset(entry.asset);
    card.append(source);
    content.append(card);
    const draw = () => { chart.innerHTML = chartMarkup(report, chart.clientWidth); };
    draw();
    if (typeof ResizeObserver !== "undefined") {
      chartObserver = new ResizeObserver(draw);
      chartObserver.observe(chart);
    }
    status.textContent = `Synthetic sample · Dataset generated ${formatDate(manifest.generation_timestamp)} · ${manifest.reports.length} ${manifest.reports.length === 1 ? "report" : "reports"} available`;
  }

  const runLatest = latestRequest(render, fail);

  function populateReports() {
    const previous = reportSelect.value;
    const options = filterReports(manifest.reports, kSelect.value);
    reportSelect.replaceChildren(...options.map(({ entry, index }) => {
      const option = node("option", "", `${formatDate(entry.query_date)} · ${entry.model || "Sample"} · ${count(entry.k)} requested matches`);
      option.value = String(index);
      return option;
    }));
    if (options.some(({ index }) => String(index) === previous)) reportSelect.value = previous;
    reportLabel.hidden = options.length < 2;
    controls.hidden = reportLabel.hidden && kLabel.hidden;
  }

  async function selectedReport(signal) {
    const entry = manifest.reports[Number(reportSelect.value)];
    const asset = safeAsset(entry?.asset);
    if (!asset) throw new Error("The selected report does not have a valid sample file.");
    return { entry, report: validateReport(await fetchJSON(asset, signal)) };
  }

  function showSelected() {
    setLoading();
    return runLatest(({ signal }) => selectedReport(signal));
  }

  function loadManifest() {
    setLoading();
    controls.hidden = true;
    return runLatest(async ({ signal, isCurrent }) => {
      const data = await fetchJSON("manifest.json", signal);
      if (!data || data.schema_version !== 1 || !Array.isArray(data.reports) || data.reports.some(entry => !entry || !safeAsset(entry.asset))) throw new Error("The sample list has an unsupported format.");
      if (!isCurrent()) return;
      manifest = data;
      if (!manifest.reports.length) return {};
      const counts = [...new Set(manifest.reports.map(entry => entry.k).filter(value => Number.isInteger(value) && value >= 0))].sort((a, b) => a - b);
      const all = node("option", "", "All available counts");
      all.value = "";
      kSelect.replaceChildren(all, ...counts.map(value => {
        const option = node("option", "", String(value));
        option.value = String(value);
        return option;
      }));
      kLabel.hidden = counts.length < 2;
      populateReports();
      return selectedReport(signal);
    });
  }

  reportSelect.addEventListener("change", showSelected);
  kSelect.addEventListener("change", () => { populateReports(); showSelected(); });
  retry.addEventListener("click", () => manifest ? showSelected() : loadManifest());
  loadManifest();
})();
