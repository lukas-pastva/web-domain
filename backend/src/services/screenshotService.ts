import puppeteer, { Browser } from 'puppeteer';
import path from 'path';
import fs from 'fs';
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

    const response = await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout,
    });

    httpStatus = response?.status() || null;
    await page.screenshot({ path: fullPath, fullPage: false });
    await page.close();

    const screenshot = new Screenshot();
    screenshot.domainId = domainId;
    screenshot.subdomainId = subdomainId;
    screenshot.url = url;
    screenshot.localPath = localPath;
    screenshot.filename = filename;
    screenshot.type = type;
    screenshot.httpStatus = httpStatus;

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
  subdomainNames: string[] = []
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
      for (const sub of subdomainNames) {
        if (sub === domainName) continue;
        const result = await takeScreenshot(domainId, `https://${sub}`, 'subdomain');
        if (result) taken++;
        else errors++;
      }
    }
  }

  return { taken, errors };
};
