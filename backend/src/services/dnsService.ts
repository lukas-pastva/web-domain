import { promises as dns } from 'dns';
import { AppDataSource } from '../config/database';
import { DnsRecord } from '../models/DnsRecord';
import { getSetting } from './settings';

interface DnsResult {
  type: string;
  name: string;
  value: string;
  ttl?: number;
  priority?: number;
}

const resolveDnsType = async (domain: string, type: string): Promise<DnsResult[]> => {
  const results: DnsResult[] = [];
  const resolver = new dns.Resolver();
  resolver.setServers(['8.8.8.8', '1.1.1.1']);

  try {
    switch (type) {
      case 'A': {
        const records = await resolver.resolve4(domain, { ttl: true });
        for (const r of records) {
          results.push({ type: 'A', name: domain, value: r.address, ttl: r.ttl });
        }
        break;
      }
      case 'AAAA': {
        const records = await resolver.resolve6(domain, { ttl: true });
        for (const r of records) {
          results.push({ type: 'AAAA', name: domain, value: r.address, ttl: r.ttl });
        }
        break;
      }
      case 'MX': {
        const records = await resolver.resolveMx(domain);
        for (const r of records) {
          results.push({ type: 'MX', name: domain, value: r.exchange, priority: r.priority });
        }
        break;
      }
      case 'NS': {
        const records = await resolver.resolveNs(domain);
        for (const r of records) {
          results.push({ type: 'NS', name: domain, value: r });
        }
        break;
      }
      case 'TXT': {
        const records = await resolver.resolveTxt(domain);
        for (const r of records) {
          results.push({ type: 'TXT', name: domain, value: r.join('') });
        }
        break;
      }
      case 'CNAME': {
        const records = await resolver.resolveCname(domain);
        for (const r of records) {
          results.push({ type: 'CNAME', name: domain, value: r });
        }
        break;
      }
      case 'SOA': {
        const record = await resolver.resolveSoa(domain);
        if (record) {
          results.push({
            type: 'SOA',
            name: domain,
            value: `${record.nsname} ${record.hostmaster} ${record.serial} ${record.refresh} ${record.retry} ${record.expire} ${record.minttl}`,
            ttl: record.minttl
          });
        }
        break;
      }
      case 'SRV': {
        const records = await resolver.resolveSrv(domain);
        for (const r of records) {
          results.push({ type: 'SRV', name: domain, value: `${r.name}:${r.port}`, priority: r.priority });
        }
        break;
      }
      case 'CAA': {
        const records = await resolver.resolveCaa(domain);
        for (const r of records) {
          results.push({ type: 'CAA', name: domain, value: `${r.critical} ${r.issue || r.issuewild || r.iodef || ''}` });
        }
        break;
      }
    }
  } catch (err: unknown) {
    const error = err as { code?: string };
    if (error.code !== 'ENODATA' && error.code !== 'ENOTFOUND' && error.code !== 'ESERVFAIL') {
      console.log(`DNS ${type} lookup for ${domain}: ${error.code || err}`);
    }
  }

  return results;
};

export const lookupDns = async (domainId: number, domainName: string): Promise<DnsRecord[]> => {
  const recordTypesStr = await getSetting('dns_record_types', 'A,AAAA,MX,NS,TXT,CNAME,SOA,SRV,CAA');
  const recordTypes = recordTypesStr.split(',').map(t => t.trim());

  const dnsRepo = AppDataSource.getRepository(DnsRecord);

  // Delete old records for this domain
  await dnsRepo.delete({ domainId });

  const allResults: DnsRecord[] = [];

  for (const type of recordTypes) {
    const results = await resolveDnsType(domainName, type);
    for (const result of results) {
      const record = new DnsRecord();
      record.domainId = domainId;
      record.type = result.type;
      record.name = result.name;
      record.value = result.value;
      record.ttl = result.ttl || null;
      record.priority = result.priority || null;
      const saved = await dnsRepo.save(record);
      allResults.push(saved);
    }
  }

  return allResults;
};
