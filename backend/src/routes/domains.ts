import { Router, Request, Response } from 'express';
import { AppDataSource } from '../config/database';
import { Domain } from '../models/Domain';
import { DomainInfo } from '../models/DomainInfo';
import { DnsRecord } from '../models/DnsRecord';
import { Subdomain } from '../models/Subdomain';
import { Screenshot } from '../models/Screenshot';
import { deleteDomainImages } from '../utils/imageStorage';

const router = Router();

// Get all domains
router.get('/', async (_req: Request, res: Response) => {
  try {
    const domainRepo = AppDataSource.getRepository(Domain);
    const domains = await domainRepo.find({
      order: { name: 'ASC' },
    });

    // Get counts for each domain
    const domainsWithCounts = await Promise.all(domains.map(async (domain) => {
      const subCount = await AppDataSource.getRepository(Subdomain).count({ where: { domainId: domain.id } });
      const dnsCount = await AppDataSource.getRepository(DnsRecord).count({ where: { domainId: domain.id } });
      const ssCount = await AppDataSource.getRepository(Screenshot).count({ where: { domainId: domain.id } });
      return { ...domain, subdomainCount: subCount, dnsRecordCount: dnsCount, screenshotCount: ssCount };
    }));

    res.json(domainsWithCounts);
  } catch (error) {
    console.error('Error getting domains:', error);
    res.status(500).json({ error: 'Failed to get domains' });
  }
});

// Get domain by ID with all relations
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const domainRepo = AppDataSource.getRepository(Domain);
    const domain = await domainRepo.findOne({
      where: { id: parseInt(req.params.id) },
    });

    if (!domain) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    // Get latest domain info
    const latestInfo = await AppDataSource.getRepository(DomainInfo).findOne({
      where: { domainId: domain.id },
      order: { scrapedAt: 'DESC' },
    });

    // Get DNS records
    const dnsRecords = await AppDataSource.getRepository(DnsRecord).find({
      where: { domainId: domain.id },
      order: { type: 'ASC', name: 'ASC' },
    });

    // Get subdomains
    const subdomains = await AppDataSource.getRepository(Subdomain).find({
      where: { domainId: domain.id },
      order: { name: 'ASC' },
    });

    // Get latest screenshots
    const screenshots = await AppDataSource.getRepository(Screenshot).find({
      where: { domainId: domain.id },
      order: { capturedAt: 'DESC' },
      take: 50,
    });

    res.json({
      ...domain,
      latestInfo,
      dnsRecords,
      subdomains,
      screenshots,
    });
  } catch (error) {
    console.error('Error getting domain:', error);
    res.status(500).json({ error: 'Failed to get domain' });
  }
});

// Get domain stats
router.get('/stats/overview', async (_req: Request, res: Response) => {
  try {
    const domainRepo = AppDataSource.getRepository(Domain);
    const total = await domainRepo.count();
    const active = await domainRepo.count({ where: { active: true } });
    const subCount = await AppDataSource.getRepository(Subdomain).count();
    const dnsCount = await AppDataSource.getRepository(DnsRecord).count();
    const ssCount = await AppDataSource.getRepository(Screenshot).count();

    res.json({ totalDomains: total, activeDomains: active, totalSubdomains: subCount, totalDnsRecords: dnsCount, totalScreenshots: ssCount });
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// Create domain
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, notes } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Domain name is required' });
    }

    const domainRepo = AppDataSource.getRepository(Domain);
    const existing = await domainRepo.findOne({ where: { name: name.toLowerCase().trim() } });
    if (existing) {
      return res.status(409).json({ error: 'Domain already exists' });
    }

    const domain = new Domain();
    domain.name = name.toLowerCase().trim();
    domain.notes = notes || null;

    const saved = await domainRepo.save(domain);
    res.status(201).json(saved);
  } catch (error) {
    console.error('Error creating domain:', error);
    res.status(500).json({ error: 'Failed to create domain' });
  }
});

// Bulk add domains
router.post('/bulk', async (req: Request, res: Response) => {
  try {
    const { domains: domainNames } = req.body;
    if (!Array.isArray(domainNames)) {
      return res.status(400).json({ error: 'Expected array of domain names' });
    }

    const domainRepo = AppDataSource.getRepository(Domain);
    let added = 0;
    let skipped = 0;

    for (const name of domainNames) {
      const clean = name.toLowerCase().trim();
      if (!clean) continue;

      const existing = await domainRepo.findOne({ where: { name: clean } });
      if (existing) {
        skipped++;
        continue;
      }

      const domain = new Domain();
      domain.name = clean;
      await domainRepo.save(domain);
      added++;
    }

    res.json({ added, skipped });
  } catch (error) {
    console.error('Error bulk adding domains:', error);
    res.status(500).json({ error: 'Failed to bulk add domains' });
  }
});

// Update domain
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const domainRepo = AppDataSource.getRepository(Domain);
    const domain = await domainRepo.findOne({ where: { id: parseInt(req.params.id) } });

    if (!domain) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    if (req.body.name !== undefined) domain.name = req.body.name.toLowerCase().trim();
    if (req.body.active !== undefined) domain.active = req.body.active;
    if (req.body.notes !== undefined) domain.notes = req.body.notes;

    const saved = await domainRepo.save(domain);
    res.json(saved);
  } catch (error) {
    console.error('Error updating domain:', error);
    res.status(500).json({ error: 'Failed to update domain' });
  }
});

// Delete domain
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const domainRepo = AppDataSource.getRepository(Domain);
    const domain = await domainRepo.findOne({ where: { id: parseInt(req.params.id) } });

    if (!domain) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    deleteDomainImages(domain.id);
    await domainRepo.remove(domain);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting domain:', error);
    res.status(500).json({ error: 'Failed to delete domain' });
  }
});

// Get WHOIS history for domain
router.get('/:id/whois-history', async (req: Request, res: Response) => {
  try {
    const infoRepo = AppDataSource.getRepository(DomainInfo);
    const history = await infoRepo.find({
      where: { domainId: parseInt(req.params.id) },
      order: { scrapedAt: 'DESC' },
      take: 20,
    });
    res.json(history);
  } catch (error) {
    console.error('Error getting WHOIS history:', error);
    res.status(500).json({ error: 'Failed to get WHOIS history' });
  }
});

export default router;
