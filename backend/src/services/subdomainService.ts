import { promises as dns } from 'dns';
import { exec } from 'child_process';
import { promisify } from 'util';
import axios from 'axios';
import { AppDataSource } from '../config/database';
import { Subdomain } from '../models/Subdomain';
import { getSettingNumber } from './settings';

const execAsync = promisify(exec);

const COMMON_SUBDOMAINS = [
  'www', 'mail', 'ftp', 'smtp', 'pop', 'imap', 'webmail', 'email',
  'ns1', 'ns2', 'ns3', 'ns4', 'dns', 'dns1', 'dns2',
  'mx', 'mx1', 'mx2', 'relay',
  'api', 'app', 'dev', 'staging', 'test', 'beta', 'alpha', 'demo', 'sandbox',
  'admin', 'panel', 'dashboard', 'portal', 'cp', 'cpanel', 'manager', 'manage',
  'blog', 'shop', 'store', 'cdn', 'static', 'assets', 'media', 'img', 'images',
  'vpn', 'remote', 'gateway', 'proxy', 'firewall',
  'db', 'database', 'mysql', 'postgres', 'redis', 'mongo', 'sql',
  'git', 'gitlab', 'jenkins', 'ci', 'build', 'deploy', 'repo',
  'docs', 'wiki', 'help', 'support', 'status', 'faq',
  'login', 'auth', 'sso', 'oauth', 'accounts', 'account', 'signup',
  'cloud', 'server', 'host', 'node', 'web', 'www2',
  'm', 'mobile', 'wap',
  'autodiscover', 'autoconfig',
  'calendar', 'meet', 'chat', 'video', 'conference',
  'monitoring', 'grafana', 'prometheus', 'kibana', 'nagios', 'zabbix',
  'backup', 'archive', 'old', 'legacy', 'new',
  'intranet', 'internal', 'extranet', 'office',
  'crm', 'erp', 'hr', 'finance', 'billing', 'invoice', 'pay', 'payment',
  'eshop', 'obchod', 'evidencia', 'sklad', 'faktura', 'ucto',
  'exchange', 'owa', 'outlook', 'teams',
  'jira', 'confluence', 'bitbucket', 'sonar',
  'staging2', 'qa', 'uat', 'preprod', 'prod',
  'files', 'download', 'upload', 'share', 'transfer', 'nas', 'storage',
  'api2', 'api3', 'v2', 'v3', 'rest', 'graphql',
  'secure', 'ssl', 'https',
  'news', 'newsletter', 'marketing', 'promo',
  'forum', 'community', 'social',
  'search', 'elastic', 'solr',
  'cache', 'memcached', 'varnish',
  'lb', 'loadbalancer', 'ha', 'cluster',
  'smtp2', 'mail2', 'pop3', 'imap2',
  'cpanel', 'plesk', 'webmin', 'directadmin',
  'stats', 'analytics', 'piwik', 'matomo',
  'dev2', 'test2', 'lab', 'labs',
  'preview', 'stage', 'rc',
  'private', 'public', 'ext',
  'redmine', 'trac', 'bugzilla', 'mantis',
  's3', 'minio', 'bucket',
  'k8s', 'kubernetes', 'docker', 'registry', 'rancher',
  'vpn2', 'openvpn', 'wireguard', 'ipsec',
  'radius', 'ldap', 'ad', 'kerberos',
  'log', 'logs', 'syslog', 'graylog', 'elk',
  'map', 'maps', 'geo', 'gis',
  'sip', 'voip', 'pbx', 'asterisk', 'tel', 'phone',
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

// Get authoritative nameservers for a domain
const getAuthoritativeNameservers = async (domain: string): Promise<string[]> => {
  const resolver = new dns.Resolver();
  resolver.setServers(['8.8.8.8', '1.1.1.1']);
  try {
    return await resolver.resolveNs(domain);
  } catch {
    return [];
  }
};

// Attempt DNS zone transfer (AXFR) from authoritative nameservers
const attemptZoneTransfer = async (domain: string, nameservers: string[]): Promise<string[]> => {
  const subdomains = new Set<string>();

  for (const ns of nameservers) {
    try {
      const { stdout } = await execAsync(`dig axfr ${domain} @${ns} +short +time=10 +tries=1 2>/dev/null`, { timeout: 15000 });
      for (const line of stdout.split('\n')) {
        // AXFR output contains FQDN entries - extract subdomain names
        const parts = line.trim().split(/\s+/);
        for (const part of parts) {
          const clean = part.toLowerCase().replace(/\.+$/, '');
          if (clean.endsWith(domain) && clean !== domain && !clean.startsWith('*')) {
            subdomains.add(clean);
          }
        }
      }
      if (subdomains.size > 0) {
        console.log(`Zone transfer successful from ${ns} for ${domain}: found ${subdomains.size} records`);
        break; // One successful transfer is enough
      }
    } catch {
      // Zone transfer refused/failed - this is expected for most domains
    }
  }

  return Array.from(subdomains);
};

// Query authoritative nameservers directly for ANY records to discover subdomains
const queryAuthoritativeANY = async (domain: string, nameservers: string[]): Promise<string[]> => {
  const subdomains = new Set<string>();

  for (const ns of nameservers) {
    try {
      const { stdout } = await execAsync(`dig any ${domain} @${ns} +time=10 +tries=1 2>/dev/null`, { timeout: 15000 });
      for (const line of stdout.split('\n')) {
        const clean = line.trim().toLowerCase();
        // Look for any FQDN references in the response that are subdomains
        const fqdnMatches = clean.match(/[\w.-]+\./g) || [];
        for (const match of fqdnMatches) {
          const name = match.replace(/\.+$/, '');
          if (name.endsWith(domain) && name !== domain && !name.startsWith('*')) {
            subdomains.add(name);
          }
        }
      }
    } catch {
      // Query failed
    }
  }

  return Array.from(subdomains);
};

// Use dig to check for wildcard DNS - if *.domain resolves, brute-force results are unreliable
const checkWildcard = async (domain: string): Promise<string | null> => {
  try {
    const randomPrefix = `nonexistent-${Date.now()}-test`;
    const ip = await resolveSubdomain(`${randomPrefix}.${domain}`);
    return ip; // If this resolves, there's a wildcard
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

// HackerTarget free API for passive DNS subdomain enumeration
const fetchHackerTargetSubdomains = async (domain: string): Promise<string[]> => {
  try {
    const response = await axios.get(`https://api.hackertarget.com/hostsearch/?q=${domain}`, { timeout: 15000 });
    const names = new Set<string>();
    if (typeof response.data === 'string' && !response.data.includes('error')) {
      for (const line of response.data.split('\n')) {
        const parts = line.split(',');
        if (parts.length >= 1) {
          const clean = parts[0].trim().toLowerCase();
          if (clean.endsWith(domain) && clean !== domain) {
            names.add(clean);
          }
        }
      }
    }
    return Array.from(names);
  } catch {
    console.log(`HackerTarget lookup failed for ${domain}`);
    return [];
  }
};

// rapiddns.io - free passive DNS
const fetchRapidDnsSubdomains = async (domain: string): Promise<string[]> => {
  try {
    const response = await axios.get(`https://rapiddns.io/subdomain/${domain}?full=1`, {
      timeout: 15000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const names = new Set<string>();
    if (typeof response.data === 'string') {
      // Parse HTML table for subdomains
      const regex = new RegExp(`([\\w.-]+\\.${domain.replace(/\./g, '\\.')})`, 'gi');
      let match;
      while ((match = regex.exec(response.data)) !== null) {
        const clean = match[1].toLowerCase();
        if (clean !== domain && !clean.startsWith('*')) {
          names.add(clean);
        }
      }
    }
    return Array.from(names);
  } catch {
    console.log(`RapidDNS lookup failed for ${domain}`);
    return [];
  }
};

export const discoverSubdomains = async (domainId: number, domainName: string): Promise<Subdomain[]> => {
  const maxSubdomains = await getSettingNumber('max_subdomains_per_domain', 100);
  const subRepo = AppDataSource.getRepository(Subdomain);

  const discovered = new Map<string, string | null>();

  // 1. Get authoritative nameservers
  const nameservers = await getAuthoritativeNameservers(domainName);
  console.log(`Authoritative NS for ${domainName}: ${nameservers.join(', ') || 'none found'}`);

  // 2. Attempt zone transfer (AXFR) - most reliable if allowed
  if (nameservers.length > 0) {
    const axfrResults = await attemptZoneTransfer(domainName, nameservers);
    for (const fqdn of axfrResults) {
      if (!discovered.has(fqdn)) {
        const ip = await resolveSubdomain(fqdn);
        discovered.set(fqdn, ip);
      }
    }

    // 3. Query ANY records from authoritative NS
    const anyResults = await queryAuthoritativeANY(domainName, nameservers);
    for (const fqdn of anyResults) {
      if (!discovered.has(fqdn)) {
        const ip = await resolveSubdomain(fqdn);
        discovered.set(fqdn, ip);
      }
    }
  }

  // 4. Check for wildcard DNS (to avoid false positives in brute-force)
  const wildcardIp = await checkWildcard(domainName);
  if (wildcardIp) {
    console.log(`Wildcard DNS detected for ${domainName} (resolves to ${wildcardIp}) - brute-force results will be filtered`);
  }

  // 5. Passive DNS sources (run in parallel)
  const [crtSubdomains, hackerTargetSubs, rapidDnsSubs] = await Promise.all([
    fetchCrtShSubdomains(domainName),
    fetchHackerTargetSubdomains(domainName),
    fetchRapidDnsSubdomains(domainName),
  ]);

  const passiveSubs = new Set([...crtSubdomains, ...hackerTargetSubs, ...rapidDnsSubs]);
  console.log(`Passive DNS sources found ${passiveSubs.size} unique subdomains for ${domainName} (crt.sh: ${crtSubdomains.length}, HackerTarget: ${hackerTargetSubs.length}, RapidDNS: ${rapidDnsSubs.length})`);

  const passivePromises = Array.from(passiveSubs).slice(0, maxSubdomains * 2).map(async (fqdn) => {
    if (!discovered.has(fqdn)) {
      const ip = await resolveSubdomain(fqdn);
      discovered.set(fqdn, ip);
    }
  });
  await Promise.all(passivePromises);

  // 6. Brute-force common subdomains (skip if wildcard detected)
  if (!wildcardIp) {
    const bruteForcePromises = COMMON_SUBDOMAINS.map(async (prefix) => {
      const fqdn = `${prefix}.${domainName}`;
      if (!discovered.has(fqdn)) {
        const ip = await resolveSubdomain(fqdn);
        if (ip) {
          discovered.set(fqdn, ip);
        }
      }
    });
    await Promise.all(bruteForcePromises);
  } else {
    // With wildcard, only brute-force but filter out IPs matching the wildcard
    const bruteForcePromises = COMMON_SUBDOMAINS.map(async (prefix) => {
      const fqdn = `${prefix}.${domainName}`;
      if (!discovered.has(fqdn)) {
        const ip = await resolveSubdomain(fqdn);
        if (ip && ip !== wildcardIp) {
          discovered.set(fqdn, ip);
        }
      }
    });
    await Promise.all(bruteForcePromises);
  }

  console.log(`Total discovered for ${domainName}: ${discovered.size} subdomains`);

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
