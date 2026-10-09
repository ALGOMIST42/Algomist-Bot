// jobs/morningChart.js
//
// Schedules the S&P 500 1-minute VWAP + deviation bands chart to post
// automatically every weekday morning to a specific Discord channel.

import cron from "node-cron";
import { generateSp500VwapChartBuffer } from "../utils/sp500VwapChart.js";
import { logger, startupLog } from "../utils/logger.js";

const CHANNEL_ID = process.env.MORNING_CHART_CHANNEL_ID;

// Default: 7:00 AM, Monday–Friday, in the timezone set below.
// Cron format: minute hour day-of-month month day-of-week
const CRON_SCHEDULE = "0 9 * * 1-5";
const TIMEZONE = "America/New_York";

export async function postMorningChart(client) {
  if (!CHANNEL_ID) {
    logger.error(
      "MORNING_CHART_CHANNEL_ID is not set in your .env file — skipping morning chart post."
    );
    return;
  }

  try {
    const channel = await client.channels.fetch(CHANNEL_ID);
    const buffer = await generateSp500VwapChartBuffer();

    await channel.send({
      content: "📊 **S&P 500 — 1m VWAP + Deviation Bands**",
      files: [{ attachment: buffer, name: "sp500_vwap.png" }],
    });

    startupLog("Morning S&P 500 VWAP chart posted successfully.");
  } catch (error) {
    logger.error("Failed to post morning S&P 500 chart:", error);
  }
}

/**
 * Call this once from ready.js, after the client is ready, to register
 * the daily schedule.
 */
export function scheduleMorningChart(client) {
  cron.schedule(
    CRON_SCHEDULE,
    () => {
      postMorningChart(client);
    },
    { timezone: TIMEZONE }
  );

  startupLog(`Morning S&P 500 chart scheduled: "${CRON_SCHEDULE}" (${TIMEZONE}).`);
}
