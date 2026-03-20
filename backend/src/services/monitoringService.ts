import { AppDataSource } from '../config/database';
import { Subdomain } from '../models/Subdomain';
import { Domain } from '../models/Domain';
import { getSetting, getSettingNumber } from './settings';
import http from 'http';
import https from 'https';
import { URL } from 'url';

interface MonitoringResult {
  subdomainId: number;
  subdomainName: string;
  statusCode: number | null;
  status: 'up' | 'down';
  error?: string;
}

const checkHttp = (url: string, timeoutMs: number): Promise<{ statusCode: number }> => {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === 'https:' ? https : http;

    const req = client.get(url, { timeout: timeoutMs, rejectUnauthorized: false }, (res) => {
      // Consume response to free socket
      res.resume();
      resolve({ statusCode: res.statusCode || 0 });
    });

    req.on('error', (err) => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
  });
};

const matchesExpectedStatus = (statusCode: number, expected: string): boolean => {
  const trimmed = expected.trim().toLowerCase();

  // Exact match (e.g. "200")
  if (/^\d{3}$/.test(trimmed)) {
    return statusCode === parseInt(trimmed, 10);
  }

  // Range match (e.g. "2xx", "3xx")
  if (/^\d[x]{2}$/i.test(trimmed)) {
    const firstDigit = parseInt(trimmed[0], 10);
    return Math.floor(statusCode / 100) === firstDigit;
  }

  // Comma-separated (e.g. "200,301")
  if (trimmed.includes(',')) {
    return trimmed.split(',').some(s => matchesExpectedStatus(statusCode, s.trim()));
  }

  // Default: 2xx
  return statusCode >= 200 && statusCode < 300;
};

export const checkSubdomainMonitoring = async (domainId: number): Promise<MonitoringResult[]> => {
  const subRepo = AppDataSource.getRepository(Subdomain);
  const subs = await subRepo.find({
    where: { domainId, monitoringEnabled: true },
  });

  if (subs.length === 0) return [];

  const timeoutMs = await getSettingNumber('monitoring_timeout', 10000);
  const results: MonitoringResult[] = [];

  for (const sub of subs) {
    const path = sub.monitoringPath.startsWith('/') ? sub.monitoringPath : `/${sub.monitoringPath}`;
    // Try HTTPS first, fall back to HTTP
    const urls = [`https://${sub.name}${path}`, `http://${sub.name}${path}`];
    let statusCode: number | null = null;
    let isUp = false;
    let lastError: string | undefined;

    for (const url of urls) {
      try {
        const result = await checkHttp(url, timeoutMs);
        statusCode = result.statusCode;
        isUp = matchesExpectedStatus(statusCode, sub.monitoringExpectedStatus);
        if (isUp) break;
      } catch (err) {
        lastError = String(err);
      }
    }

    const previousStatus = sub.monitoringStatus;
    const newStatus: 'up' | 'down' = isUp ? 'up' : 'down';

    sub.monitoringStatus = newStatus;
    sub.monitoringLastStatusCode = statusCode;
    sub.monitoringLastCheckedAt = new Date();
    await subRepo.save(sub);

    results.push({
      subdomainId: sub.id,
      subdomainName: sub.name,
      statusCode,
      status: newStatus,
      error: isUp ? undefined : lastError,
    });

    // Send Argo event if status changed to down
    if (newStatus === 'down' && previousStatus !== 'down') {
      await sendArgoEvent(sub, domainId, statusCode, lastError);
    }
  }

  return results;
};

const sendArgoEvent = async (sub: Subdomain, domainId: number, statusCode: number | null, error?: string): Promise<void> => {
  const argoUrl = await getSetting('argo_event_url');
  if (!argoUrl) {
    console.log(`[Monitoring] Subdomain ${sub.name} is DOWN (status: ${statusCode}) but no argo_event_url configured`);
    return;
  }

  const domainRepo = AppDataSource.getRepository(Domain);
  const domain = await domainRepo.findOne({ where: { id: domainId } });

  const payload = {
    type: 'web-domain-monitoring',
    subdomain: sub.name,
    domain: domain?.name || '',
    domainId,
    subdomainId: sub.id,
    status: 'down',
    statusCode,
    expectedStatus: sub.monitoringExpectedStatus,
    monitoringPath: sub.monitoringPath,
    error: error || null,
    checkedAt: new Date().toISOString(),
  };

  console.log(`[Monitoring] Sending Argo event for ${sub.name} DOWN to ${argoUrl}`);

  try {
    const parsed = new URL(argoUrl);
    const client = parsed.protocol === 'https:' ? https : http;
    const postData = JSON.stringify(payload);

    await new Promise<void>((resolve, reject) => {
      const req = client.request(argoUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
        timeout: 5000,
      }, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          console.log(`[Monitoring] Argo event sent successfully for ${sub.name}`);
          resolve();
        } else {
          console.error(`[Monitoring] Argo event failed for ${sub.name}: HTTP ${res.statusCode}`);
          resolve(); // Don't fail the scrape for event delivery issues
        }
      });

      req.on('error', (err) => {
        console.error(`[Monitoring] Failed to send Argo event for ${sub.name}:`, err);
        resolve(); // Don't fail the scrape
      });

      req.on('timeout', () => {
        req.destroy();
        console.error(`[Monitoring] Argo event timeout for ${sub.name}`);
        resolve();
      });

      req.write(postData);
      req.end();
    });
  } catch (err) {
    console.error(`[Monitoring] Error sending Argo event for ${sub.name}:`, err);
  }
};
