// jobs/morningChart.js
//
// Schedules the S&P 500 1-minute VWAP + deviation bands chart to post
// automatically every weekday morning to a specific Discord channel.

const cron = require('node-cron');
const { generateSp500VwapChartBuffer } = require('../utils/sp500VwapChart');

const CHANNEL_ID = process.env.MORNING_CHART_CHANNEL_ID;

// Default: 7:00 AM, Monday–Friday, in the timezone set below.
// Cron format: minute hour day-of-month month day-of-week
const CRON_SCHEDULE = '0 7 * * 1-5';
const TIMEZONE = 'America/New_York';

async function postMorningChart(client) {
  if (!CHANNEL_ID) {
    console.error(
      'MORNING_CHART_CHANNEL_ID is not set in your .env file — skipping morning chart post.'
    );
    return;
  }

  try {
    const channel = await client.channels.fetch(CHANNEL_ID);
    const buffer = await generateSp500VwapChartBuffer();

    await channel.send({
      content: '📊 **S&P 500 — 1m VWAP + Deviation Bands**',
      files: [{ attachment: buffer, name: 'sp500_vwap.png' }],
    });

    console.log('Morning S&P 500 VWAP chart posted successfully.');
  } catch (err) {
    console.error('Failed to post morning S&P 500 chart:', err);
  }
}

/**
 * Call this once from your main bot file, after the client is ready,
 * to register the daily schedule.
 */
function scheduleMorningChart(client) {
  cron.schedule(
    CRON_SCHEDULE,
    () => {
      postMorningChart(client);
    },
    { timezone: TIMEZONE }
  );

  console.log(
    `Morning S&P 500 chart scheduled: "${CRON_SCHEDULE}" (${TIMEZONE}).`
  );
}

module.exports = { scheduleMorningChart, postMorningChart };
