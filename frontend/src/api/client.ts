import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json'
  }
});

export interface Domain {
  id: number;
  name: string;
  active: boolean;
  notes: string | null;
  lastScrapedAt: string | null;
  createdAt: string;
  updatedAt: string;
  subdomainCount?: number;
  dnsRecordCount?: number;
  screenshotCount?: number;
  latestScreenshotPath?: string | null;
}

export interface DomainInfo {
  id: number;
  domainId: number;
  registrar: string | null;
  expiryDate: string | null;
  creationDate: string | null;
  updatedDate: string | null;
  registrant: string | null;
  status: string | null;
  nameServers: string | null;
  rawWhois: string | null;
  scrapedAt: string;
}

export interface DnsRecord {
  id: number;
  domainId: number;
  type: string;
  name: string;
  value: string;
  ttl: number | null;
  priority: number | null;
  scrapedAt: string;
}

export interface SubdomainEntry {
  id: number;
  domainId: number;
  name: string;
  ip: string | null;
  active: boolean;
  httpStatus: number | null;
  title: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface Screenshot {
  id: number;
  domainId: number;
  subdomainId: number | null;
  url: string;
  localPath: string;
  filename: string;
  type: string;
  httpStatus: number | null;
  capturedAt: string;
}

export interface DomainDetail extends Domain {
  latestInfo: DomainInfo | null;
  dnsRecords: DnsRecord[];
  subdomains: SubdomainEntry[];
  screenshots: Screenshot[];
}

export interface ScrapeConfig {
  id: number;
  name: string;
  enabled: boolean;
  intervalMinutes: number;
  enableWhois: boolean;
  enableDns: boolean;
  enableSubdomains: boolean;
  enableScreenshots: boolean;
  domainIds: string | null;
  dnsRecordTypes: string | null;
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScrapeRun {
  id: number;
  status: 'running' | 'completed' | 'failed';
  configId: number | null;
  domainsTotal: number;
  domainsProcessed: number;
  whoisLookups: number;
  dnsLookups: number;
  subdomainsFound: number;
  screenshotsTaken: number;
  errorsCount: number;
  errorMessages: string | null;
  startedAt: string;
  completedAt: string | null;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface DomainStats {
  totalDomains: number;
  activeDomains: number;
  totalSubdomains: number;
  totalDnsRecords: number;
  totalScreenshots: number;
}

export interface Setting {
  id: number;
  key: string;
  value: string;
  description: string | null;
  updatedAt: string;
}

export interface SchedulerEntry {
  key: string;
  configId: number | null;
  isRunning: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
}

export interface ScraperStatus {
  scheduler: {
    schedulers: SchedulerEntry[];
  };
  scraper: {
    isRunning: boolean;
    currentDomain: string | null;
    progress: { current: number; total: number };
    stats: {
      whoisLookups: number;
      dnsLookups: number;
      subdomainsFound: number;
      screenshotsTaken: number;
      errors: number;
    };
  };
}

// API methods
export const domainsApi = {
  getAll: () => api.get<Domain[]>('/domains'),
  getById: (id: number) => api.get<DomainDetail>(`/domains/${id}`),
  getStats: () => api.get<DomainStats>('/domains/stats/overview'),
  create: (data: { name: string; notes?: string }) => api.post<Domain>('/domains', data),
  createBulk: (domains: string[]) => api.post<{ added: number; skipped: number }>('/domains/bulk', { domains }),
  update: (id: number, data: Partial<Domain>) => api.put<Domain>(`/domains/${id}`, data),
  delete: (id: number) => api.delete(`/domains/${id}`),
  getWhoisHistory: (id: number) => api.get<DomainInfo[]>(`/domains/${id}/whois-history`),
};

export const scraperApi = {
  getStatus: () => api.get<ScraperStatus>('/scraper/status'),
  trigger: (configId?: number) => api.post<{ success: boolean; message: string }>('/scraper/trigger', { configId }),
  triggerDomain: (domainId: number) => api.post<{ success: boolean; message: string }>(`/scraper/trigger/${domainId}`),
};

export const scrapeConfigsApi = {
  getAll: () => api.get<ScrapeConfig[]>('/scrape-configs'),
  getById: (id: number) => api.get<ScrapeConfig>(`/scrape-configs/${id}`),
  create: (data: Partial<ScrapeConfig>) => api.post<ScrapeConfig>('/scrape-configs', data),
  update: (id: number, data: Partial<ScrapeConfig>) => api.put<ScrapeConfig>(`/scrape-configs/${id}`, data),
  delete: (id: number) => api.delete(`/scrape-configs/${id}`),
};

export const scrapeHistoryApi = {
  getRuns: (params?: { page?: number; limit?: number }) =>
    api.get<PaginatedResponse<ScrapeRun>>('/scrape-history/runs', { params }),
  getRun: (id: number) => api.get<ScrapeRun>(`/scrape-history/runs/${id}`),
  deleteRun: (id: number) => api.delete(`/scrape-history/runs/${id}`),
  deleteAllRuns: () => api.delete('/scrape-history/runs'),
};

export const settingsApi = {
  getAll: () => api.get<Setting[]>('/settings'),
  update: (key: string, value: string) => api.put<Setting>(`/settings/${key}`, { value }),
  updateBulk: (updates: { key: string; value: string }[]) => api.put<Setting[]>('/settings', updates),
};

export default api;
