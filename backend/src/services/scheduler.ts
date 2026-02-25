import { scrapeAllDomains } from './domainScraper';
import { getSettingNumber } from './settings';
import { AppDataSource } from '../config/database';
import { ScrapeConfig } from '../models/ScrapeConfig';

interface SchedulerEntry {
  configId: number | null;
  timeout: NodeJS.Timeout | null;
  isRunning: boolean;
  lastRunAt: Date | null;
  nextRunAt: Date | null;
}

const schedulers: Map<string, SchedulerEntry> = new Map();

// Default scheduler (uses global settings)
const DEFAULT_KEY = 'default';

const getRandomInterval = async (configId?: number): Promise<number> => {
  if (configId) {
    const configRepo = AppDataSource.getRepository(ScrapeConfig);
    const config = await configRepo.findOne({ where: { id: configId } });
    if (config) {
      const minutes = config.intervalMinutes;
      // Add +/- 10% randomness
      const variance = minutes * 0.1;
      const randomMinutes = minutes - variance + Math.random() * variance * 2;
      return Math.floor(randomMinutes * 60 * 1000);
    }
  }

  const minMinutes = await getSettingNumber('scrape_interval_min', 55);
  const maxMinutes = await getSettingNumber('scrape_interval_max', 65);
  const randomMinutes = minMinutes + Math.random() * (maxMinutes - minMinutes);
  return Math.floor(randomMinutes * 60 * 1000);
};

const scheduleNextRun = async (key: string, configId?: number): Promise<void> => {
  const interval = await getRandomInterval(configId);
  const entry = schedulers.get(key) || {
    configId: configId || null,
    timeout: null,
    isRunning: false,
    lastRunAt: null,
    nextRunAt: null,
  };

  entry.nextRunAt = new Date(Date.now() + interval);
  console.log(`[${key}] Next scrape scheduled in ${(interval / 60000).toFixed(1)} minutes at ${entry.nextRunAt.toISOString()}`);

  entry.timeout = setTimeout(async () => {
    if (entry.isRunning) {
      console.log(`[${key}] Scraper already running, rescheduling...`);
      await scheduleNextRun(key, configId);
      return;
    }

    entry.isRunning = true;
    entry.lastRunAt = new Date();
    console.log(`[${key}] Scheduled scrape started at ${entry.lastRunAt.toISOString()}`);

    try {
      await scrapeAllDomains(configId);
    } catch (error) {
      console.error(`[${key}] Scheduled scrape failed:`, error);
    } finally {
      entry.isRunning = false;
      await scheduleNextRun(key, configId);
    }
  }, interval);

  schedulers.set(key, entry);
};

export const startScheduler = async (): Promise<void> => {
  console.log('Starting scheduler...');

  // Start default scheduler
  await scheduleNextRun(DEFAULT_KEY);

  // Start config-based schedulers
  const configRepo = AppDataSource.getRepository(ScrapeConfig);
  const configs = await configRepo.find({ where: { enabled: true } });

  for (const config of configs) {
    const key = `config-${config.id}`;
    await scheduleNextRun(key, config.id);
  }

  console.log(`Scheduler started with ${configs.length + 1} schedule(s)`);
};

export const stopScheduler = (): void => {
  for (const [key, entry] of schedulers) {
    if (entry.timeout) {
      clearTimeout(entry.timeout);
      entry.timeout = null;
      entry.nextRunAt = null;
    }
    console.log(`Scheduler [${key}] stopped`);
  }
  schedulers.clear();
};

export const restartSchedulerForConfig = async (configId: number): Promise<void> => {
  const key = `config-${configId}`;
  const entry = schedulers.get(key);
  if (entry?.timeout) {
    clearTimeout(entry.timeout);
  }

  const configRepo = AppDataSource.getRepository(ScrapeConfig);
  const config = await configRepo.findOne({ where: { id: configId } });

  if (config?.enabled) {
    await scheduleNextRun(key, configId);
  } else {
    schedulers.delete(key);
  }
};

export const triggerManualScrape = async (configId?: number): Promise<{ success: boolean; message: string }> => {
  const key = configId ? `config-${configId}` : DEFAULT_KEY;
  const entry = schedulers.get(key);

  if (entry?.isRunning) {
    return { success: false, message: 'Scraper is already running' };
  }

  // Run in background
  scrapeAllDomains(configId).catch(err => console.error('Manual scrape failed:', err));

  return { success: true, message: 'Scrape started' };
};

export const getSchedulerStatus = (): {
  schedulers: Array<{
    key: string;
    configId: number | null;
    isRunning: boolean;
    lastRunAt: Date | null;
    nextRunAt: Date | null;
  }>;
} => {
  const result: Array<{
    key: string;
    configId: number | null;
    isRunning: boolean;
    lastRunAt: Date | null;
    nextRunAt: Date | null;
  }> = [];

  for (const [key, entry] of schedulers) {
    result.push({
      key,
      configId: entry.configId,
      isRunning: entry.isRunning,
      lastRunAt: entry.lastRunAt,
      nextRunAt: entry.nextRunAt,
    });
  }

  return { schedulers: result };
};
