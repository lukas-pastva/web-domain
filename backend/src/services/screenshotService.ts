import puppeteer, { Browser } from 'puppeteer-core';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { IsNull } from 'typeorm';
import { AppDataSource } from '../config/database';
import { Screenshot } from '../models/Screenshot';
import { getSettingNumber, getSettingBoolean } from './settings';

let browser: Browser | null = null;

const getStoragePath = (): string => {
  return process.env.PVC_MOUNT_PATH || '/data/images';
};

const ensureDir = (dirPath: string): void => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

const getBrowser = async (): Promise<Browser> => {
  if (!browser || !browser.connected) {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    });
  }
  return browser;
};

export const closeBrowser = async (): Promise<void> => {
  if (browser) {
    await browser.close();
    browser = null;
  }
};

export const takeScreenshot = async (
  domainId: number,
  url: string,
  type: string = 'domain',
  subdomainId: number | null = null
): Promise<Screenshot | null> => {
  const screenshotRepo = AppDataSource.getRepository(Screenshot);
  const width = await getSettingNumber('screenshot_width', 1280);
  const height = await getSettingNumber('screenshot_height', 800);
  const timeout = await getSettingNumber('screenshot_timeout', 30000);

  const storagePath = getStoragePath();
  const domainDir = path.join(storagePath, String(domainId));
  ensureDir(domainDir);

  const timestamp = Date.now();
  const safeName = url.replace(/[^a-zA-Z0-9.-]/g, '_').substring(0, 100);
  const filename = `${safeName}_${timestamp}.png`;
  const localPath = path.join(String(domainId), filename);
  const fullPath = path.join(storagePath, localPath);

  let httpStatus: number | null = null;

  try {
    const b = await getBrowser();
    const page = await b.newPage();
    await page.setViewport({ width, height });

    let response;
    try {
      response = await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout,
      });
    } catch (navErr) {
      // Fallback: if networkidle2 times out, try with just load event
      console.warn(`Screenshot networkidle2 failed for ${url}, retrying with load: ${navErr}`);
      response = await page.goto(url, {
        waitUntil: 'load',
        timeout,
      });
    }

    httpStatus = response?.status() || null;
    const buffer = await page.screenshot({ fullPage: false }) as Buffer;
    await page.close();

    // Compute hash for deduplication
    const imageHash = crypto.createHash('sha256').update(buffer).digest('hex');

    // Check if latest screenshot for same domain+subdomain+url has the same hash (per-subdomain dedup)
    const latest = await screenshotRepo.findOne({
      where: { domainId, subdomainId: subdomainId ?? IsNull(), url },
      order: { capturedAt: 'DESC' },
    });

    if (latest && latest.imageHash === imageHash) {
      // Content unchanged — skip saving
      return null;
    }

    // Write buffer to file
    fs.writeFileSync(fullPath, buffer);

    const screenshot = new Screenshot();
    screenshot.domainId = domainId;
    screenshot.subdomainId = subdomainId;
    screenshot.url = url;
    screenshot.localPath = localPath;
    screenshot.filename = filename;
    screenshot.type = type;
    screenshot.httpStatus = httpStatus;
    screenshot.imageHash = imageHash;

    return await screenshotRepo.save(screenshot);
  } catch (err) {
    console.error(`Screenshot failed for ${url}:`, err);
    return null;
  }
};

export const takeScreenshotsForDomain = async (
  domainId: number,
  domainName: string,
  includeSubdomains: boolean = true,
  subdomains: { id: number; name: string }[] = []
): Promise<{ taken: number; errors: number }> => {
  let taken = 0;
  let errors = 0;

  // Screenshot main domain (both http and https)
  for (const protocol of ['https', 'http']) {
    const url = `${protocol}://${domainName}`;
    const result = await takeScreenshot(domainId, url, 'domain');
    if (result) taken++;
    else errors++;
  }

  // Screenshot subdomains
  if (includeSubdomains) {
    const shouldScreenshotSubs = await getSettingBoolean('screenshot_subdomains', true);
    if (shouldScreenshotSubs) {
      for (const sub of subdomains) {
        if (sub.name === domainName) continue;
        for (const protocol of ['https', 'http']) {
          const result = await takeScreenshot(domainId, `${protocol}://${sub.name}`, 'subdomain', sub.id);
          if (result) taken++;
          else errors++;
        }
      }
    }
  }

  return { taken, errors };
};
