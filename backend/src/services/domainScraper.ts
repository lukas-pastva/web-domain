import { AppDataSource } from '../config/database';
import { Domain } from '../models/Domain';
import { ScrapeRun } from '../models/ScrapeRun';
import { ScrapeConfig } from '../models/ScrapeConfig';
import { lookupWhois } from './whoisService';
import { lookupDns } from './dnsService';
import { discoverSubdomains } from './subdomainService';
import { takeScreenshotsForDomain, closeBrowser } from './screenshotService';
import { checkSubdomainMonitoring } from './monitoringService';
import { checkCertificates } from './certService';
import { getSettingNumber } from './settings';
import { In } from 'typeorm';

// Scraper state
let isRunning = false;
let currentDomain: string | null = null;
let progress = { current: 0, total: 0 };
let stats = { whoisLookups: 0, dnsLookups: 0, subdomainsFound: 0, screenshotsTaken: 0, errors: 0 };

const randomDelay = async (): Promise<void> => {
  const min = await getSettingNumber('delay_between_domains_min', 2000);
  const max = await getSettingNumber('delay_between_domains_max', 5000);
  const delay = min + Math.random() * (max - min);
  return new Promise(resolve => setTimeout(resolve, delay));
};

export const scrapeAllDomains = async (configId?: number): Promise<void> => {
  if (isRunning) {
    console.log('Scraper already running, skipping...');
    return;
  }

  isRunning = true;
  currentDomain = null;
  stats = { whoisLookups: 0, dnsLookups: 0, subdomainsFound: 0, screenshotsTaken: 0, errors: 0 };

  const domainRepo = AppDataSource.getRepository(Domain);
  const runRepo = AppDataSource.getRepository(ScrapeRun);

  // Get config if specified
  let config: ScrapeConfig | null = null;
  if (configId) {
    const configRepo = AppDataSource.getRepository(ScrapeConfig);
    config = await configRepo.findOne({ where: { id: configId } });
  }

  // Get domains to scrape
  let domains: Domain[];
  if (config?.domainIds) {
    const ids = config.domainIds.split(',').map(id => parseInt(id.trim()));
    domains = await domainRepo.find({ where: { id: In(ids), active: true } });
  } else {
    domains = await domainRepo.find({ where: { active: true } });
  }

  progress = { current: 0, total: domains.length };

  // Create scrape run
  const run = new ScrapeRun();
  run.status = 'running';
  run.configId = configId || null;
  run.domainsTotal = domains.length;
  await runRepo.save(run);

  const errors: string[] = [];

  try {
    for (const domain of domains) {
      currentDomain = domain.name;
      progress.current++;
      console.log(`[${progress.current}/${progress.total}] Scraping ${domain.name}...`);

      try {
        // WHOIS lookup
        if (!config || config.enableWhois) {
          try {
            await lookupWhois(domain.id, domain.name);
            stats.whoisLookups++;
            run.whoisLookups++;
          } catch (err) {
            console.error(`WHOIS failed for ${domain.name}:`, err);
            stats.errors++;
            errors.push(`WHOIS ${domain.name}: ${err}`);
          }
        }

        // DNS lookup
        if (!config || config.enableDns) {
          try {
            const records = await lookupDns(domain.id, domain.name);
            stats.dnsLookups += records.length;
            run.dnsLookups += records.length;
          } catch (err) {
            console.error(`DNS failed for ${domain.name}:`, err);
            stats.errors++;
            errors.push(`DNS ${domain.name}: ${err}`);
          }
        }

        // Subdomain discovery
        let subdomainEntries: { id: number; name: string }[] = [];
        if (!config || config.enableSubdomains) {
          try {
            const subs = await discoverSubdomains(domain.id, domain.name);
            stats.subdomainsFound += subs.length;
            run.subdomainsFound += subs.length;
            subdomainEntries = subs.filter(s => s.active).map(s => ({ id: s.id, name: s.name }));
          } catch (err) {
            console.error(`Subdomain discovery failed for ${domain.name}:`, err);
            stats.errors++;
            errors.push(`Subdomains ${domain.name}: ${err}`);
          }
        }

        // Screenshots
        if (!config || config.enableScreenshots) {
          try {
            const ssResult = await takeScreenshotsForDomain(
              domain.id,
              domain.name,
              !config || config.enableSubdomains,
              subdomainEntries
            );
            stats.screenshotsTaken += ssResult.taken;
            run.screenshotsTaken += ssResult.taken;
            stats.errors += ssResult.errors;
          } catch (err) {
            console.error(`Screenshots failed for ${domain.name}:`, err);
            stats.errors++;
            errors.push(`Screenshots ${domain.name}: ${err}`);
          }
        }

        // Monitoring checks
        try {
          const monitorResults = await checkSubdomainMonitoring(domain.id);
          for (const r of monitorResults) {
            if (r.status === 'down') {
              console.log(`[Monitoring] ${r.subdomainName} is DOWN (HTTP ${r.statusCode})`);
            }
          }
        } catch (err) {
          console.error(`Monitoring failed for ${domain.name}:`, err);
          errors.push(`Monitoring ${domain.name}: ${err}`);
        }

        // Certificate checks
        try {
          const certResults = await checkCertificates(domain.id);
          for (const r of certResults) {
            if (r.expired) {
              console.log(`[CertCheck] ${r.subdomainName} certificate EXPIRED`);
            } else if (r.expiresSoon) {
              console.log(`[CertCheck] ${r.subdomainName} certificate expires in ${r.daysUntilExpiry} days`);
            }
          }
        } catch (err) {
          console.error(`Certificate check failed for ${domain.name}:`, err);
          errors.push(`CertCheck ${domain.name}: ${err}`);
        }

        // Update domain last scraped
        domain.lastScrapedAt = new Date();
        await domainRepo.save(domain);

        run.domainsProcessed++;
        await runRepo.save(run);

        await randomDelay();
      } catch (err) {
        console.error(`Error scraping ${domain.name}:`, err);
        stats.errors++;
        errors.push(`${domain.name}: ${err}`);
      }
    }

    run.status = 'completed';
  } catch (err) {
    console.error('Scraper failed:', err);
    run.status = 'failed';
    errors.push(`Fatal: ${err}`);
  } finally {
    run.errorsCount = stats.errors;
    run.errorMessages = errors.length > 0 ? errors.join('\n') : null;
    run.completedAt = new Date();
    await runRepo.save(run);

    await closeBrowser();
    currentDomain = null;
    isRunning = false;

    // Update config lastRunAt
    if (config) {
      const configRepo = AppDataSource.getRepository(ScrapeConfig);
      config.lastRunAt = new Date();
      await configRepo.save(config);
    }
  }
};

export const scrapeSingleDomain = async (domainId: number): Promise<void> => {
  const domainRepo = AppDataSource.getRepository(Domain);
  const domain = await domainRepo.findOne({ where: { id: domainId } });
  if (!domain) throw new Error('Domain not found');

  const runRepo = AppDataSource.getRepository(ScrapeRun);
  const run = new ScrapeRun();
  run.status = 'running';
  run.domainsTotal = 1;
  await runRepo.save(run);

  try {
    await lookupWhois(domain.id, domain.name);
    run.whoisLookups++;

    const records = await lookupDns(domain.id, domain.name);
    run.dnsLookups = records.length;

    const subs = await discoverSubdomains(domain.id, domain.name);
    run.subdomainsFound = subs.length;

    const ssResult = await takeScreenshotsForDomain(
      domain.id, domain.name, true,
      subs.filter(s => s.active).map(s => ({ id: s.id, name: s.name }))
    );
    run.screenshotsTaken = ssResult.taken;
    run.errorsCount = ssResult.errors;

    // Monitoring checks
    await checkSubdomainMonitoring(domain.id);

    // Certificate checks
    await checkCertificates(domain.id);

    domain.lastScrapedAt = new Date();
    await domainRepo.save(domain);

    run.domainsProcessed = 1;
    run.status = 'completed';
  } catch (err) {
    run.status = 'failed';
    run.errorMessages = String(err);
    run.errorsCount++;
  } finally {
    run.completedAt = new Date();
    await runRepo.save(run);
    await closeBrowser();
  }
};

export const getScraperState = () => ({
  isRunning,
  currentDomain,
  progress,
  stats,
});
