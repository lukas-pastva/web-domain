import { Router, Request, Response } from 'express';
import { AppDataSource } from '../config/database';
import { ScrapeRun } from '../models/ScrapeRun';

const router = Router();

// Get all runs (paginated)
router.get('/runs', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const runRepo = AppDataSource.getRepository(ScrapeRun);
    const [runs, total] = await runRepo.findAndCount({
      order: { startedAt: 'DESC' },
      skip,
      take: limit,
    });

    res.json({
      data: runs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error getting scrape runs:', error);
    res.status(500).json({ error: 'Failed to get scrape runs' });
  }
});

// Get single run
router.get('/runs/:id', async (req: Request, res: Response) => {
  try {
    const runRepo = AppDataSource.getRepository(ScrapeRun);
    const run = await runRepo.findOne({ where: { id: parseInt(req.params.id) } });
    if (!run) return res.status(404).json({ error: 'Run not found' });
    res.json(run);
  } catch (error) {
    console.error('Error getting scrape run:', error);
    res.status(500).json({ error: 'Failed to get scrape run' });
  }
});

// Delete run
router.delete('/runs/:id', async (req: Request, res: Response) => {
  try {
    const runRepo = AppDataSource.getRepository(ScrapeRun);
    const run = await runRepo.findOne({ where: { id: parseInt(req.params.id) } });
    if (!run) return res.status(404).json({ error: 'Run not found' });
    await runRepo.remove(run);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting scrape run:', error);
    res.status(500).json({ error: 'Failed to delete scrape run' });
  }
});

// Delete all runs
router.delete('/runs', async (_req: Request, res: Response) => {
  try {
    const runRepo = AppDataSource.getRepository(ScrapeRun);
    await runRepo.clear();
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting all scrape runs:', error);
    res.status(500).json({ error: 'Failed to delete all scrape runs' });
  }
});

export default router;
