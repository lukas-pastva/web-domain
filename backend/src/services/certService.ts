import tls from 'tls';
import { AppDataSource } from '../config/database';
import { Subdomain } from '../models/Subdomain';
import { Domain } from '../models/Domain';
import { getSetting, getSettingNumber } from './settings';
import http from 'http';
import https from 'https';
import { URL } from 'url';

interface CertInfo {
  expiresAt: Date;
  issuer: string;
}

interface CertCheckResult {
  subdomainId: number;
  subdomainName: string;
  certExpiresAt: Date | null;
  certIssuer: string | null;
  expired: boolean;
  expiresSoon: boolean;
  daysUntilExpiry: number | null;
  error?: string;
}

const getCertInfo = (hostname: string, timeoutMs: number): Promise<CertInfo> => {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({
      host: hostname,
      port: 443,
      servername: hostname,
      rejectUnauthorized: false,
      timeout: timeoutMs,
    }, () => {
      const cert = socket.getPeerCertificate();
      if (!cert || !cert.valid_to) {
        socket.destroy();
        reject(new Error('No certificate found'));
        return;
      }

      const expiresAt = new Date(cert.valid_to);
      const issuer = cert.issuer
        ? [cert.issuer.O, cert.issuer.CN].filter(Boolean).join(' - ') || 'Unknown'
        : 'Unknown';

      socket.destroy();
      resolve({ expiresAt, issuer });
    });

    socket.on('error', (err) => {
      socket.destroy();
      reject(err);
    });

    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error('Timeout'));
    });
  });
};

export const checkCertificates = async (domainId: number): Promise<CertCheckResult[]> => {
  const subRepo = AppDataSource.getRepository(Subdomain);
  const subs = await subRepo.find({
    where: { domainId, active: true },
  });

  if (subs.length === 0) return [];

  const timeoutMs = await getSettingNumber('monitoring_timeout', 10000);
  const certWarningDays = await getSettingNumber('cert_warning_days', 30);
  const results: CertCheckResult[] = [];
  const now = new Date();

  for (const sub of subs) {
    try {
      const certInfo = await getCertInfo(sub.name, timeoutMs);
      const daysUntilExpiry = Math.floor((certInfo.expiresAt.getTime() - now.getTime()) / 86400000);
      const expired = daysUntilExpiry < 0;
      const expiresSoon = !expired && daysUntilExpiry <= certWarningDays;

      sub.certExpiresAt = certInfo.expiresAt;
      sub.certIssuer = certInfo.issuer;
      sub.certLastCheckedAt = now;
      await subRepo.save(sub);

      results.push({
        subdomainId: sub.id,
        subdomainName: sub.name,
        certExpiresAt: certInfo.expiresAt,
        certIssuer: certInfo.issuer,
        expired,
        expiresSoon,
        daysUntilExpiry,
      });

      // Send alert if cert expired or expiring soon
      if (expired || expiresSoon) {
        await sendCertAlert(sub, domainId, daysUntilExpiry, expired);
      }
    } catch (err) {
      // No cert available (e.g. no HTTPS) — clear old cert data
      sub.certExpiresAt = null;
      sub.certIssuer = null;
      sub.certLastCheckedAt = now;
      await subRepo.save(sub);

      results.push({
        subdomainId: sub.id,
        subdomainName: sub.name,
        certExpiresAt: null,
        certIssuer: null,
        expired: false,
        expiresSoon: false,
        daysUntilExpiry: null,
        error: String(err),
      });
    }
  }

  return results;
};

const sendCertAlert = async (sub: Subdomain, domainId: number, daysUntilExpiry: number, expired: boolean): Promise<void> => {
  const argoWorkflowUrl = await getSetting('argo_workflow_url');
  if (!argoWorkflowUrl) {
    const label = expired ? 'EXPIRED' : `expires in ${daysUntilExpiry} days`;
    console.log(`[CertCheck] Certificate for ${sub.name} ${label} but no argo_workflow_url configured`);
    return;
  }

  const emailFrom = await getSetting('monitoring_email_from');
  const emailTo = await getSetting('monitoring_email_to');
  if (!emailFrom || !emailTo) {
    console.log(`[CertCheck] Certificate alert for ${sub.name} but email not configured`);
    return;
  }

  const domainRepo = AppDataSource.getRepository(Domain);
  const domain = await domainRepo.findOne({ where: { id: domainId } });

  const status = expired ? 'EXPIRED' : `EXPIRES IN ${daysUntilExpiry} DAYS`;
  const message = `CERT ALERT: ${sub.name} certificate ${status}. Issuer: ${sub.certIssuer || 'unknown'}. Expires: ${sub.certExpiresAt?.toISOString() || 'N/A'}. Domain: ${domain?.name || 'unknown'}. Checked at: ${new Date().toISOString()}`;

  const eventData = JSON.stringify({
    name: Buffer.from('cert-alert').toString('base64'),
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

  console.log(`[CertCheck] Sending cert alert for ${sub.name} (${status}) to ${argoWorkflowUrl}`);

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
            console.log(`[CertCheck] Alert sent for ${sub.name}`);
          } else {
            console.error(`[CertCheck] Argo API error for ${sub.name} (${res.statusCode}): ${data}`);
          }
          resolve();
        });
      });

      req.on('error', (err) => {
        console.error(`[CertCheck] Failed to send alert for ${sub.name}:`, err);
        resolve();
      });

      req.on('timeout', () => {
        req.destroy();
        console.error(`[CertCheck] Alert timeout for ${sub.name}`);
        resolve();
      });

      req.write(body);
      req.end();
    });
  } catch (err) {
    console.error(`[CertCheck] Error sending alert for ${sub.name}:`, err);
  }
};
