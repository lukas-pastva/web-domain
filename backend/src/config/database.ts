import { DataSource } from 'typeorm';
import { Domain } from '../models/Domain';
import { DomainInfo } from '../models/DomainInfo';
import { DnsRecord } from '../models/DnsRecord';
import { Subdomain } from '../models/Subdomain';
import { Screenshot } from '../models/Screenshot';
import { ScrapeRun } from '../models/ScrapeRun';
import { ScrapeConfig } from '../models/ScrapeConfig';
import { Setting } from '../models/Setting';
import dotenv from 'dotenv';

dotenv.config();

export const AppDataSource = new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  username: process.env.DB_USER || 'domain',
  password: process.env.DB_PASSWORD || 'secret',
  database: process.env.DB_NAME || 'domain',
  synchronize: true,
  logging: process.env.NODE_ENV === 'development',
  entities: [Domain, DomainInfo, DnsRecord, Subdomain, Screenshot, ScrapeRun, ScrapeConfig, Setting],
  migrations: ['src/migrations/*.ts'],
  subscribers: [],
});
