import { Router, Request, Response } from 'express';
import { getAllSettings, updateSetting, refreshSettingsCache } from '../services/settings';

const router = Router();

// Get all settings
router.get('/', async (_req: Request, res: Response) => {
  try {
    const settings = await getAllSettings();
    res.json(settings);
  } catch (error) {
    console.error('Error getting settings:', error);
    res.status(500).json({ error: 'Failed to get settings' });
  }
});

// Update a setting
router.put('/:key', async (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    const { value } = req.body;

    if (value === undefined) {
      return res.status(400).json({ error: 'Value is required' });
    }

    const setting = await updateSetting(key, String(value));
    if (!setting) {
      return res.status(404).json({ error: 'Setting not found' });
    }

    res.json(setting);
  } catch (error) {
    console.error('Error updating setting:', error);
    res.status(500).json({ error: 'Failed to update setting' });
  }
});

// Bulk update settings
router.put('/', async (req: Request, res: Response) => {
  try {
    const updates: { key: string; value: string }[] = req.body;

    if (!Array.isArray(updates)) {
      return res.status(400).json({ error: 'Expected array of {key, value} objects' });
    }

    for (const update of updates) {
      await updateSetting(update.key, String(update.value));
    }

    await refreshSettingsCache();
    const settings = await getAllSettings();
    res.json(settings);
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

export default router;
