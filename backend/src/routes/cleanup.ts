import { Router, Request, Response } from 'express';
import { AppDataSource } from '../config/database';
import fs from 'fs';
import path from 'path';

const router = Router();

// Known tables managed by TypeORM entities
const KNOWN_TABLES = new Set([
  'domains', 'domain_infos', 'dns_records', 'subdomains',
  'screenshots', 'scrape_runs', 'scrape_configs', 'settings',
]);

// Expected columns per table
const EXPECTED_COLUMNS: Record<string, Set<string>> = {
  domains: new Set(['id', 'name', 'active', 'notes', 'lastScrapedAt', 'createdAt', 'updatedAt']),
  domain_infos: new Set(['id', 'domainId', 'registrar', 'registrant', 'creationDate', 'expiryDate', 'updatedDate', 'status', 'nameServers', 'rawWhois', 'scrapedAt']),
  dns_records: new Set(['id', 'domainId', 'type', 'name', 'value', 'ttl', 'priority', 'scrapedAt']),
  subdomains: new Set(['id', 'domainId', 'name', 'ip', 'httpStatus', 'title', 'active', 'firstSeenAt', 'lastSeenAt']),
  screenshots: new Set(['id', 'domainId', 'subdomainId', 'url', 'localPath', 'filename', 'type', 'httpStatus', 'imageHash', 'capturedAt']),
  scrape_runs: new Set(['id', 'status', 'configId', 'domainsTotal', 'domainsProcessed', 'whoisLookups', 'dnsLookups', 'subdomainsFound', 'screenshotsTaken', 'errorsCount', 'errorMessages', 'startedAt', 'completedAt']),
  scrape_configs: new Set(['id', 'name', 'enabled', 'intervalMinutes', 'enableWhois', 'enableDns', 'enableSubdomains', 'enableScreenshots', 'domainIds', 'dnsRecordTypes', 'lastRunAt', 'createdAt', 'updatedAt']),
  settings: new Set(['id', 'key', 'value', 'description', 'updatedAt']),
};

const getStoragePath = (): string => process.env.PVC_MOUNT_PATH || '/data/images';

// Scan for issues
router.get('/scan', async (_req: Request, res: Response) => {
  try {
    const dbName = process.env.DB_NAME || 'domain';
    const issues: {
      unknownTables: string[];
      unknownColumns: { table: string; columns: string[] }[];
      orphanedScreenshotRows: number;
      orphanedScrapeRuns: number;
      orphanedFiles: string[];
      orphanedDirs: string[];
      totalFileSize: number;
    } = {
      unknownTables: [],
      unknownColumns: [],
      orphanedScreenshotRows: 0,
      orphanedScrapeRuns: 0,
      orphanedFiles: [],
      orphanedDirs: [],
      totalFileSize: 0,
    };

    // 1. Find unknown tables
    const tables: { TABLE_NAME: string }[] = await AppDataSource.query(
      `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?`,
      [dbName]
    );
    for (const t of tables) {
      if (!KNOWN_TABLES.has(t.TABLE_NAME)) {
        issues.unknownTables.push(t.TABLE_NAME);
      }
    }

    // 2. Find unknown columns in known tables
    for (const tableName of KNOWN_TABLES) {
      const tableExists = tables.some(t => t.TABLE_NAME === tableName);
      if (!tableExists) continue;

      const columns: { COLUMN_NAME: string }[] = await AppDataSource.query(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
        [dbName, tableName]
      );
      const expected = EXPECTED_COLUMNS[tableName];
      if (!expected) continue;

      const unknownCols = columns
        .map(c => c.COLUMN_NAME)
        .filter(col => !expected.has(col));
      if (unknownCols.length > 0) {
        issues.unknownColumns.push({ table: tableName, columns: unknownCols });
      }
    }

    // 3. Count orphaned screenshot rows (domain doesn't exist)
    const orphanedSS: { cnt: number }[] = await AppDataSource.query(
      `SELECT COUNT(*) as cnt FROM screenshots WHERE domainId NOT IN (SELECT id FROM domains)`
    );
    issues.orphanedScreenshotRows = orphanedSS[0]?.cnt || 0;

    // 4. Count all scrape_runs (these are just history clutter)
    const runCount: { cnt: number }[] = await AppDataSource.query(
      `SELECT COUNT(*) as cnt FROM scrape_runs`
    );
    issues.orphanedScrapeRuns = runCount[0]?.cnt || 0;

    // 5. Scan files on disk, find orphaned ones
    const storagePath = getStoragePath();
    if (fs.existsSync(storagePath)) {
      // Get all screenshot localPaths from DB
      const dbPaths: { localPath: string }[] = await AppDataSource.query(
        `SELECT localPath FROM screenshots`
      );
      const dbPathSet = new Set(dbPaths.map(r => r.localPath));

      // Get all domain IDs
      const domainIds: { id: number }[] = await AppDataSource.query(`SELECT id FROM domains`);
      const domainIdSet = new Set(domainIds.map(r => String(r.id)));

      // Walk the storage directory
      const walkDir = (dir: string, relativeTo: string): string[] => {
        const files: string[] = [];
        if (!fs.existsSync(dir)) return files;
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const fullPath = path.join(dir, entry.name);
          const relPath = path.relative(relativeTo, fullPath);
          if (entry.isDirectory()) {
            files.push(...walkDir(fullPath, relativeTo));
          } else {
            files.push(relPath);
          }
        }
        return files;
      };

      const allFiles = walkDir(storagePath, storagePath);
      for (const filePath of allFiles) {
        if (!dbPathSet.has(filePath)) {
          issues.orphanedFiles.push(filePath);
          try {
            const stat = fs.statSync(path.join(storagePath, filePath));
            issues.totalFileSize += stat.size;
          } catch { /* ignore */ }
        }
      }

      // Find directories for domains that no longer exist
      for (const entry of fs.readdirSync(storagePath, { withFileTypes: true })) {
        if (entry.isDirectory() && !domainIdSet.has(entry.name)) {
          issues.orphanedDirs.push(entry.name);
        }
      }
    }

    res.json(issues);
  } catch (error) {
    console.error('Cleanup scan error:', error);
    res.status(500).json({ error: 'Failed to scan for cleanup issues' });
  }
});

// Delete specific cleanup items
router.post('/execute', async (req: Request, res: Response) => {
  try {
    const { actions } = req.body as {
      actions: {
        dropTables?: boolean;
        dropColumns?: boolean;
        deleteOrphanedScreenshots?: boolean;
        deleteScrapeRuns?: boolean;
        deleteOrphanedFiles?: boolean;
      };
    };

    const results: string[] = [];
    const dbName = process.env.DB_NAME || 'domain';

    // 1. Drop unknown tables
    if (actions.dropTables) {
      const tables: { TABLE_NAME: string }[] = await AppDataSource.query(
        `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?`,
        [dbName]
      );
      for (const t of tables) {
        if (!KNOWN_TABLES.has(t.TABLE_NAME)) {
          await AppDataSource.query(`DROP TABLE \`${t.TABLE_NAME}\``);
          results.push(`Dropped table: ${t.TABLE_NAME}`);
        }
      }
    }

    // 2. Drop unknown columns
    if (actions.dropColumns) {
      const tables: { TABLE_NAME: string }[] = await AppDataSource.query(
        `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?`,
        [dbName]
      );
      for (const tableName of KNOWN_TABLES) {
        const tableExists = tables.some(t => t.TABLE_NAME === tableName);
        if (!tableExists) continue;
        const expected = EXPECTED_COLUMNS[tableName];
        if (!expected) continue;

        const columns: { COLUMN_NAME: string }[] = await AppDataSource.query(
          `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
          [dbName, tableName]
        );
        for (const col of columns) {
          if (!expected.has(col.COLUMN_NAME)) {
            await AppDataSource.query(`ALTER TABLE \`${tableName}\` DROP COLUMN \`${col.COLUMN_NAME}\``);
            results.push(`Dropped column: ${tableName}.${col.COLUMN_NAME}`);
          }
        }
      }
    }

    // 3. Delete orphaned screenshot rows
    if (actions.deleteOrphanedScreenshots) {
      const result = await AppDataSource.query(
        `DELETE FROM screenshots WHERE domainId NOT IN (SELECT id FROM domains)`
      );
      results.push(`Deleted ${result.affectedRows || 0} orphaned screenshot rows`);
    }

    // 4. Delete all scrape runs
    if (actions.deleteScrapeRuns) {
      const result = await AppDataSource.query(`DELETE FROM scrape_runs`);
      results.push(`Deleted ${result.affectedRows || 0} scrape run records`);
    }

    // 5. Delete orphaned files
    if (actions.deleteOrphanedFiles) {
      const storagePath = getStoragePath();
      if (fs.existsSync(storagePath)) {
        // Get all screenshot localPaths from DB
        const dbPaths: { localPath: string }[] = await AppDataSource.query(
          `SELECT localPath FROM screenshots`
        );
        const dbPathSet = new Set(dbPaths.map(r => r.localPath));

        // Get all domain IDs
        const domainIds: { id: number }[] = await AppDataSource.query(`SELECT id FROM domains`);
        const domainIdSet = new Set(domainIds.map(r => String(r.id)));

        // Delete orphaned directories for non-existent domains
        let deletedDirs = 0;
        for (const entry of fs.readdirSync(storagePath, { withFileTypes: true })) {
          if (entry.isDirectory() && !domainIdSet.has(entry.name)) {
            fs.rmSync(path.join(storagePath, entry.name), { recursive: true, force: true });
            deletedDirs++;
          }
        }
        results.push(`Deleted ${deletedDirs} orphaned directories`);

        // Delete orphaned files in valid directories
        let deletedFiles = 0;
        const walkAndClean = (dir: string, relativeTo: string) => {
          if (!fs.existsSync(dir)) return;
          for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              walkAndClean(fullPath, relativeTo);
              // Remove empty directories
              try {
                const remaining = fs.readdirSync(fullPath);
                if (remaining.length === 0) fs.rmdirSync(fullPath);
              } catch { /* ignore */ }
            } else {
              const relPath = path.relative(relativeTo, fullPath);
              if (!dbPathSet.has(relPath)) {
                fs.unlinkSync(fullPath);
                deletedFiles++;
              }
            }
          }
        };
        walkAndClean(storagePath, storagePath);
        results.push(`Deleted ${deletedFiles} orphaned files`);
      }
    }

    res.json({ success: true, results });
  } catch (error) {
    console.error('Cleanup execute error:', error);
    res.status(500).json({ error: 'Failed to execute cleanup' });
  }
});

export default router;
