import 'reflect-metadata';
import express from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import { AppDataSource } from './config/database';
import { startScheduler } from './services/scheduler';
import { initializeSettings } from './services/settings';
import { ensureDirectoryExists, getImageFullPath } from './utils/imageStorage';

import domainsRouter from './routes/domains';
import scraperRouter from './routes/scraper';
import scrapeConfigsRouter from './routes/scrapeConfigs';
import scrapeHistoryRouter from './routes/scrapeHistory';
import settingsRouter from './routes/settings';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use('/api/domains', domainsRouter);
app.use('/api/scraper', scraperRouter);
app.use('/api/scrape-configs', scrapeConfigsRouter);
app.use('/api/scrape-history', scrapeHistoryRouter);
app.use('/api/settings', settingsRouter);

app.get('/api/images/:path(*)', (req, res) => {
  const imagePath = req.params.path;
  const fullPath = getImageFullPath(imagePath);
  res.sendFile(fullPath, (err) => {
    if (err) {
      res.status(404).json({ error: 'Image not found' });
    }
  });
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const frontendPath = path.join(__dirname, '../frontend/dist');
app.use(express.static(frontendPath));

app.get('*', (_req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

const startServer = async () => {
  try {
    const storagePath = process.env.PVC_MOUNT_PATH || '/data/images';
    ensureDirectoryExists(storagePath);

    await AppDataSource.initialize();
    console.log('Database connected successfully');

    await initializeSettings();
    console.log('Settings initialized');

    await startScheduler();

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
