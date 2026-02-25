import { Router, Request, Response } from 'express';
import { AppDataSource } from '../config/database';
import { ScrapeConfig } from '../models/ScrapeConfig';
import { restartSchedulerForConfig } from '../services/scheduler';

const router = Router();

// Get all configs
router.get('/', async (_req: Request, res: Response) => {
  try {
    const configRepo = AppDataSource.getRepository(ScrapeConfig);
    const configs = await configRepo.find({ order: { name: 'ASC' } });
    res.json(configs);
  } catch (error) {
    console.error('Error getting scrape configs:', error);
    res.status(500).json({ error: 'Failed to get scrape configs' });
  }
});

// Get config by ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const configRepo = AppDataSource.getRepository(ScrapeConfig);
    const config = await configRepo.findOne({ where: { id: parseInt(req.params.id) } });
    if (!config) return res.status(404).json({ error: 'Config not found' });
    res.json(config);
  } catch (error) {
    console.error('Error getting scrape config:', error);
    res.status(500).json({ error: 'Failed to get scrape config' });
  }
});

// Create config
router.post('/', async (req: Request, res: Response) => {
  try {
    const configRepo = AppDataSource.getRepository(ScrapeConfig);
    const config = new ScrapeConfig();
    config.name = req.body.name;
    config.enabled = req.body.enabled ?? true;
    config.intervalMinutes = req.body.intervalMinutes ?? 60;
    config.enableWhois = req.body.enableWhois ?? true;
    config.enableDns = req.body.enableDns ?? true;
    config.enableSubdomains = req.body.enableSubdomains ?? true;
    config.enableScreenshots = req.body.enableScreenshots ?? true;
    config.domainIds = req.body.domainIds || null;
    config.dnsRecordTypes = req.body.dnsRecordTypes || null;

    const saved = await configRepo.save(config);

    if (saved.enabled) {
      await restartSchedulerForConfig(saved.id);
    }

    res.status(201).json(saved);
  } catch (error) {
    console.error('Error creating scrape config:', error);
    res.status(500).json({ error: 'Failed to create scrape config' });
  }
});

// Update config
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const configRepo = AppDataSource.getRepository(ScrapeConfig);
    const config = await configRepo.findOne({ where: { id: parseInt(req.params.id) } });
    if (!config) return res.status(404).json({ error: 'Config not found' });

    if (req.body.name !== undefined) config.name = req.body.name;
    if (req.body.enabled !== undefined) config.enabled = req.body.enabled;
    if (req.body.intervalMinutes !== undefined) config.intervalMinutes = req.body.intervalMinutes;
    if (req.body.enableWhois !== undefined) config.enableWhois = req.body.enableWhois;
    if (req.body.enableDns !== undefined) config.enableDns = req.body.enableDns;
    if (req.body.enableSubdomains !== undefined) config.enableSubdomains = req.body.enableSubdomains;
    if (req.body.enableScreenshots !== undefined) config.enableScreenshots = req.body.enableScreenshots;
    if (req.body.domainIds !== undefined) config.domainIds = req.body.domainIds;
    if (req.body.dnsRecordTypes !== undefined) config.dnsRecordTypes = req.body.dnsRecordTypes;

    const saved = await configRepo.save(config);
    await restartSchedulerForConfig(saved.id);

    res.json(saved);
  } catch (error) {
    console.error('Error updating scrape config:', error);
    res.status(500).json({ error: 'Failed to update scrape config' });
  }
});

// Delete config
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const configRepo = AppDataSource.getRepository(ScrapeConfig);
    const config = await configRepo.findOne({ where: { id: parseInt(req.params.id) } });
    if (!config) return res.status(404).json({ error: 'Config not found' });

    await configRepo.remove(config);
    await restartSchedulerForConfig(parseInt(req.params.id));

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting scrape config:', error);
    res.status(500).json({ error: 'Failed to delete scrape config' });
  }
});

export default router;
