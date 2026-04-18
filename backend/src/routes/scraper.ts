import { Router, Request, Response } from 'express';
import { triggerManualScrape, getSchedulerStatus } from '../services/scheduler';
import { getScraperState, scrapeSingleDomain } from '../services/domainScraper';

const router = Router();

// Get scraper status
router.get('/status', async (_req: Request, res: Response) => {
  try {
    const scheduler = getSchedulerStatus();
    const scraper = getScraperState();

    res.json({ scheduler, scraper });
  } catch (error) {
    console.error('Error getting scraper status:', error);
    res.status(500).json({ error: 'Failed to get scraper status' });
  }
});

// Trigger manual scrape (all domains or by config)
router.post('/trigger', async (req: Request, res: Response) => {
  try {
    const { configId } = req.body || {};
    const result = await triggerManualScrape(configId);
    res.json(result);
  } catch (error) {
    console.error('Error triggering scrape:', error);
    res.status(500).json({ error: 'Failed to trigger scrape' });
  }
});

// Trigger scrape for single domain
router.post('/trigger/:domainId', async (req: Request, res: Response) => {
  try {
    const domainId = parseInt(req.params.domainId);
    // Start scrape and get run ID from the initial save
    const runIdPromise = scrapeSingleDomain(domainId);
    // Wait briefly for the run to be created so we can return the ID
    // The run is saved at the start of scrapeSingleDomain, so we use a different approach:
    // We'll look up the latest running run for this domain
    const { AppDataSource } = await import('../config/database');
    const { ScrapeRun } = await import('../models/ScrapeRun');
    const runRepo = AppDataSource.getRepository(ScrapeRun);

    // Give a moment for the run to be created
    await new Promise(resolve => setTimeout(resolve, 100));

    const latestRun = await runRepo.findOne({
      where: { status: 'running' },
      order: { startedAt: 'DESC' },
    });

    runIdPromise.catch(err => console.error('Single domain scrape failed:', err));
    res.json({ success: true, message: `Scrape started for domain ${domainId}`, runId: latestRun?.id || null });
  } catch (error) {
    console.error('Error triggering single scrape:', error);
    res.status(500).json({ error: 'Failed to trigger scrape' });
  }
});

export default router;
