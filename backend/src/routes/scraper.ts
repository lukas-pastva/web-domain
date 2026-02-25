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
    scrapeSingleDomain(domainId).catch(err => console.error('Single domain scrape failed:', err));
    res.json({ success: true, message: `Scrape started for domain ${domainId}` });
  } catch (error) {
    console.error('Error triggering single scrape:', error);
    res.status(500).json({ error: 'Failed to trigger scrape' });
  }
});

export default router;
