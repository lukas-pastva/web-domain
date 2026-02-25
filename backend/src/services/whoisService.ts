import { AppDataSource } from '../config/database';
import { DomainInfo } from '../models/DomainInfo';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface WhoisParsed {
  registrar?: string;
  expiryDate?: Date | null;
  creationDate?: Date | null;
  updatedDate?: Date | null;
  registrant?: string;
  status?: string;
  nameServers?: string;
}

const parseDate = (dateStr: string | undefined): Date | null => {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
};

const parseWhoisOutput = (raw: string): WhoisParsed => {
  const result: WhoisParsed = {};
  const lines = raw.split('\n');

  for (const line of lines) {
    const lower = line.toLowerCase().trim();

    if (lower.startsWith('registrar:') || lower.startsWith('registrar name:')) {
      result.registrar = line.split(':').slice(1).join(':').trim();
    }
    if (lower.startsWith('registry expiry date:') || lower.startsWith('expir') || lower.startsWith('paid-till:')) {
      const val = line.split(':').slice(1).join(':').trim();
      if (!result.expiryDate) result.expiryDate = parseDate(val);
    }
    if (lower.startsWith('creation date:') || lower.startsWith('created:') || lower.startsWith('registered:')) {
      const val = line.split(':').slice(1).join(':').trim();
      if (!result.creationDate) result.creationDate = parseDate(val);
    }
    if (lower.startsWith('updated date:') || lower.startsWith('last updated:') || lower.startsWith('changed:')) {
      const val = line.split(':').slice(1).join(':').trim();
      if (!result.updatedDate) result.updatedDate = parseDate(val);
    }
    if (lower.startsWith('registrant:') || lower.startsWith('registrant name:') || lower.startsWith('registrant organization:')) {
      result.registrant = line.split(':').slice(1).join(':').trim();
    }
    if (lower.startsWith('domain status:') || lower.startsWith('status:')) {
      const val = line.split(':').slice(1).join(':').trim();
      result.status = result.status ? `${result.status}, ${val}` : val;
    }
    if (lower.startsWith('name server:') || lower.startsWith('nserver:')) {
      const val = line.split(':').slice(1).join(':').trim();
      result.nameServers = result.nameServers ? `${result.nameServers}, ${val}` : val;
    }
  }

  return result;
};

export const lookupWhois = async (domainId: number, domainName: string): Promise<DomainInfo> => {
  const infoRepo = AppDataSource.getRepository(DomainInfo);

  let raw = '';
  try {
    const { stdout } = await execAsync(`whois ${domainName}`, { timeout: 15000 });
    raw = stdout;
  } catch (err: unknown) {
    const error = err as { stdout?: string; message?: string };
    raw = error.stdout || `WHOIS lookup failed: ${error.message}`;
  }

  const parsed = parseWhoisOutput(raw);

  const info = new DomainInfo();
  info.domainId = domainId;
  info.registrar = parsed.registrar || null;
  info.expiryDate = parsed.expiryDate || null;
  info.creationDate = parsed.creationDate || null;
  info.updatedDate = parsed.updatedDate || null;
  info.registrant = parsed.registrant || null;
  info.status = parsed.status || null;
  info.nameServers = parsed.nameServers || null;
  info.rawWhois = raw;

  return await infoRepo.save(info);
};
