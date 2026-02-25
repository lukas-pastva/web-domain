import { promises as dns } from 'dns';
import axios from 'axios';
import { AppDataSource } from '../config/database';
import { Subdomain } from '../models/Subdomain';
import { getSettingNumber } from './settings';

const COMMON_SUBDOMAINS = [
  'www', 'mail', 'ftp', 'smtp', 'pop', 'imap', 'webmail',
  'ns1', 'ns2', 'ns3', 'ns4', 'dns', 'dns1', 'dns2',
  'mx', 'mx1', 'mx2', 'relay',
  'api', 'app', 'dev', 'staging', 'test', 'beta', 'alpha',
  'admin', 'panel', 'dashboard', 'portal', 'cp', 'cpanel',
  'blog', 'shop', 'store', 'cdn', 'static', 'assets', 'media', 'img', 'images',
  'vpn', 'remote', 'gateway', 'proxy',
  'db', 'database', 'mysql', 'postgres', 'redis', 'mongo',
  'git', 'gitlab', 'jenkins', 'ci', 'build',
  'docs', 'wiki', 'help', 'support', 'status',
  'login', 'auth', 'sso', 'oauth',
  'cloud', 'server', 'host', 'node',
  'm', 'mobile', 'wap',
  'autodiscover', 'autoconfig',
  'calendar', 'meet', 'chat',
  'monitoring', 'grafana', 'prometheus', 'kibana',
  'backup', 'archive', 'old', 'legacy', 'new',
];

const resolveSubdomain = async (subdomain: string): Promise<string | null> => {
  const resolver = new dns.Resolver();
  resolver.setServers(['8.8.8.8', '1.1.1.1']);

  try {
    const records = await resolver.resolve4(subdomain);
    return records[0] || null;
  } catch {
    return null;
  }
};

const fetchCrtShSubdomains = async (domain: string): Promise<string[]> => {
  try {
    const response = await axios.get(`https://crt.sh/?q=%.${domain}&output=json`, { timeout: 15000 });
    const names = new Set<string>();
    for (const entry of response.data) {
      const nameValue: string = entry.name_value;
      for (const name of nameValue.split('\n')) {
        const clean = name.trim().toLowerCase();
        if (clean.endsWith(domain) && !clean.startsWith('*')) {
          names.add(clean);
        }
      }
    }
    return Array.from(names);
  } catch {
    console.log(`crt.sh lookup failed for ${domain}`);
    return [];
  }
};

export const discoverSubdomains = async (domainId: number, domainName: string): Promise<Subdomain[]> => {
  const maxSubdomains = await getSettingNumber('max_subdomains_per_domain', 100);
  const subRepo = AppDataSource.getRepository(Subdomain);

  const discovered = new Map<string, string | null>();

  // Brute-force common subdomains
  const bruteForcePromises = COMMON_SUBDOMAINS.map(async (prefix) => {
    const fqdn = `${prefix}.${domainName}`;
    const ip = await resolveSubdomain(fqdn);
    if (ip) {
      discovered.set(fqdn, ip);
    }
  });
  await Promise.all(bruteForcePromises);

  // crt.sh certificate transparency
  const crtSubdomains = await fetchCrtShSubdomains(domainName);
  const crtPromises = crtSubdomains.slice(0, maxSubdomains).map(async (fqdn) => {
    if (!discovered.has(fqdn)) {
      const ip = await resolveSubdomain(fqdn);
      discovered.set(fqdn, ip);
    }
  });
  await Promise.all(crtPromises);

  // Save or update subdomains
  const results: Subdomain[] = [];
  let count = 0;

  for (const [fqdn, ip] of discovered) {
    if (count >= maxSubdomains) break;

    let subdomain = await subRepo.findOne({ where: { domainId, name: fqdn } });
    if (subdomain) {
      subdomain.ip = ip;
      subdomain.active = ip !== null;
    } else {
      subdomain = new Subdomain();
      subdomain.domainId = domainId;
      subdomain.name = fqdn;
      subdomain.ip = ip;
      subdomain.active = ip !== null;
    }

    results.push(await subRepo.save(subdomain));
    count++;
  }

  // Mark subdomains not found this time as inactive
  const existingAll = await subRepo.find({ where: { domainId } });
  for (const existing of existingAll) {
    if (!discovered.has(existing.name) && existing.active) {
      existing.active = false;
      await subRepo.save(existing);
    }
  }

  return results;
};
