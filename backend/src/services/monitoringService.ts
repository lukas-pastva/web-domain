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

    // Send Argo Workflow (email alert) if status changed to down
    if (newStatus === 'down' && previousStatus !== 'down') {
      await sendArgoWorkflow(sub, domainId, statusCode, lastError);
    }
  }

  return results;
};

const sendArgoWorkflow = async (sub: Subdomain, domainId: number, statusCode: number | null, error?: string): Promise<void> => {
  const argoWorkflowUrl = await getSetting('argo_workflow_url');
  if (!argoWorkflowUrl) {
    console.log(`[Monitoring] Subdomain ${sub.name} is DOWN (status: ${statusCode}) but no argo_workflow_url configured`);
    return;
  }

  const emailFrom = await getSetting('monitoring_email_from');
  const emailTo = await getSetting('monitoring_email_to');
  if (!emailFrom || !emailTo) {
    console.log(`[Monitoring] Subdomain ${sub.name} is DOWN but monitoring_email_from or monitoring_email_to not configured`);
    return;
  }

  const domainRepo = AppDataSource.getRepository(Domain);
  const domain = await domainRepo.findOne({ where: { id: domainId } });

  const message = `ALERT: ${sub.name} is DOWN. HTTP status: ${statusCode ?? 'N/A'}. Domain: ${domain?.name || 'unknown'}. Path: ${sub.monitoringPath}. Expected: ${sub.monitoringExpectedStatus}. Error: ${error || 'none'}. Checked at: ${new Date().toISOString()}`;

  // Same format as web-celebration: POST to Argo Workflows API
  const eventData = JSON.stringify({
    name: Buffer.from('monitoring-alert').toString('base64'),
    email: Buffer.from(emailFrom).toString('base64'),
    email_to: Buffer.from(emailTo).toString('base64'),
    message: Buffer.from(message).toString('base64'),
    host: 'web-domain',
    phone: '',
  });

  const body = JSON.stringify({
    resourceName: 'event-mail',
    template: 'event-mail',
    parameters: {
      'event-data': eventData,
    },
  });

  console.log(`[Monitoring] Sending Argo Workflow for ${sub.name} DOWN to ${argoWorkflowUrl}`);

  try {
    const url = new URL(argoWorkflowUrl);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;

    await new Promise<void>((resolve) => {
      const req = client.request({
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: 5000,
      }, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            console.log(`[Monitoring] Argo Workflow created for ${sub.name}`);
          } else {
            console.error(`[Monitoring] Argo API error for ${sub.name} (${res.statusCode}): ${data}`);
          }
          resolve();
        });
      });

      req.on('error', (err) => {
        console.error(`[Monitoring] Failed to send Argo Workflow for ${sub.name}:`, err);
        resolve();
      });

      req.on('timeout', () => {
        req.destroy();
        console.error(`[Monitoring] Argo Workflow timeout for ${sub.name}`);
        resolve();
      });

      req.write(body);
      req.end();
    });
  } catch (err) {
    console.error(`[Monitoring] Error sending Argo Workflow for ${sub.name}:`, err);
  }
};
