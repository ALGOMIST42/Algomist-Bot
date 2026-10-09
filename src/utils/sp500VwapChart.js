// utils/sp500VwapChart.js
//
// Fetches the most recent 1-minute S&P 500 session (^GSPC), computes a
// volume-weighted VWAP and ±1 / ±1.5 / ±2 standard-deviation bands around
// it, and renders the result as a chart image (PNG buffer) via QuickChart's
// hosted rendering API — no native dependencies (no "canvas" package),
// which avoids the build issues that package causes on platforms like
// Railway.

import yahooFinance from "yahoo-finance2";

const QUICKCHART_URL = "https://quickchart.io/chart";
const WIDTH = 1200;
const HEIGHT = 650;

// Yahoo Finance's unofficial API occasionally rate-limits requests coming
// from cloud/datacenter IPs (like Railway's) with a plain-text "Too Many
// Requests" response instead of JSON, which crashes the library's own
// JSON parser. Retrying after a short delay almost always succeeds once
// the rate limit window passes.
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 4000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Pulls the last few days of 1-minute bars for the S&P 500 and returns
 * only the bars belonging to the most recent trading day present in the
 * data (so weekends/holidays are naturally skipped). Retries a few times
 * on transient failures (e.g. Yahoo Finance rate-limiting) before giving
 * up.
 */
async function fetchLatestSessionBars() {
  let lastError;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const period2 = new Date();
      const period1 = new Date(period2.getTime() - 5 * 24 * 60 * 60 * 1000); // 5 days back

      const result = await yahooFinance.chart("^GSPC", {
        period1,
        period2,
        interval: "1m",
      });

      const quotes = (result.quotes || []).filter(
        (q) => q.close != null && q.high != null && q.low != null && q.volume != null
      );

      if (quotes.length === 0) {
        throw new Error("No 1-minute quote data returned for ^GSPC.");
      }

      // Group by calendar date (based on the exchange timestamp) and keep
      // only the most recent date's bars.
      const dateKey = (d) => new Date(d).toISOString().slice(0, 10);
      const lastDate = dateKey(quotes[quotes.length - 1].date);
      return quotes.filter((q) => dateKey(q.date) === lastDate);
    } catch (error) {
      lastError = error;
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS * attempt); // 4s, then 8s
      }
    }
  }

  throw new Error(
    `Failed to fetch S&P 500 data after ${MAX_RETRIES} attempts: ${lastError?.message || lastError}`
  );
}

/**
 * Computes cumulative VWAP and ±k standard-deviation bands for a single
 * session's worth of 1-minute bars.
 */
function computeVwapAndBands(bars) {
  let cumPV = 0; // cumulative (typical price * volume)
  let cumPV2 = 0; // cumulative (typical price^2 * volume)
  let cumV = 0; // cumulative volume

  const labels = [];
  const closes = [];
  const vwap = [];
  const upper1 = [];
  const lower1 = [];
  const upper15 = [];
  const lower15 = [];
  const upper2 = [];
  const lower2 = [];

  for (const bar of bars) {
    const typicalPrice = (bar.high + bar.low + bar.close) / 3;
    const vol = bar.volume || 0;

    cumPV += typicalPrice * vol;
    cumPV2 += typicalPrice * typicalPrice * vol;
    cumV += vol;

    const v = cumV > 0 ? cumPV / cumV : typicalPrice;
    const variance = cumV > 0 ? Math.max(cumPV2 / cumV - v * v, 0) : 0;
    const stdDev = Math.sqrt(variance);

    labels.push(
      new Date(bar.date).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      })
    );
    closes.push(bar.close);
    vwap.push(v);
    upper1.push(v + 1 * stdDev);
    lower1.push(v - 1 * stdDev);
    upper15.push(v + 1.5 * stdDev);
    lower15.push(v - 1.5 * stdDev);
    upper2.push(v + 2 * stdDev);
    lower2.push(v - 2 * stdDev);
  }

  return { labels, closes, vwap, upper1, lower1, upper15, lower15, upper2, lower2 };
}

function buildChartConfig(data) {
  const bandDataset = (label, values, color, dash) => ({
    label,
    data: values,
    borderColor: color,
    borderWidth: 1,
    borderDash: dash,
    pointRadius: 0,
    fill: false,
    tension: 0.1,
  });

  return {
    type: "line",
    data: {
      labels: data.labels,
      datasets: [
        {
          label: "S&P 500 (1m)",
          data: data.closes,
          borderColor: "#e5e7eb",
          borderWidth: 1.5,
          pointRadius: 0,
          fill: false,
          tension: 0.1,
        },
        {
          label: "VWAP",
          data: data.vwap,
          borderColor: "#2dd4e8",
          borderWidth: 2,
          pointRadius: 0,
          fill: false,
          tension: 0.1,
        },
        bandDataset("+1σ", data.upper1, "#60a5fa", [4, 4]),
        bandDataset("-1σ", data.lower1, "#60a5fa", [4, 4]),
        bandDataset("+1.5σ", data.upper15, "#a78bfa", [4, 4]),
        bandDataset("-1.5σ", data.lower15, "#a78bfa", [4, 4]),
        bandDataset("+2σ", data.upper2, "#c026d3", [4, 4]),
        bandDataset("-2σ", data.lower2, "#c026d3", [4, 4]),
      ],
    },
    options: {
      plugins: {
        legend: {
          labels: { color: "#e5e7eb", font: { size: 12 } },
        },
        title: {
          display: true,
          text: "S&P 500 — 1-Minute VWAP + Deviation Bands",
          color: "#f5f7fa",
          font: { size: 18 },
        },
      },
      scales: {
        x: {
          ticks: { color: "#94a3b8", maxTicksLimit: 12 },
          grid: { color: "rgba(255,255,255,0.05)" },
        },
        y: {
          ticks: { color: "#94a3b8" },
          grid: { color: "rgba(255,255,255,0.05)" },
        },
      },
    },
  };
}

/**
 * Public entry point: fetches data, computes VWAP + bands, and returns a
 * PNG image buffer (rendered by QuickChart's hosted API) ready to attach
 * to a Discord message.
 */
export async function generateSp500VwapChartBuffer() {
  const bars = await fetchLatestSessionBars();
  const data = computeVwapAndBands(bars);
  const config = buildChartConfig(data);

  const response = await fetch(QUICKCHART_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chart: config,
      width: WIDTH,
      height: HEIGHT,
      backgroundColor: "#0b0f1a",
      format: "png",
    }),
  });

  if (!response.ok) {
    throw new Error(`QuickChart render failed: HTTP ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
