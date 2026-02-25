import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn } from 'typeorm';

@Entity('settings')
export class Setting {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 100, unique: true })
  key!: string;

  @Column({ type: 'varchar', length: 500 })
  value!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description!: string | null;

  @UpdateDateColumn()
  updatedAt!: Date;
}

export const DEFAULT_SETTINGS = {
  SCRAPE_INTERVAL_MIN: { key: 'scrape_interval_min', value: '55', description: 'Minimum scrape interval in minutes' },
  SCRAPE_INTERVAL_MAX: { key: 'scrape_interval_max', value: '65', description: 'Maximum scrape interval in minutes' },
  SCREENSHOT_WIDTH: { key: 'screenshot_width', value: '1280', description: 'Screenshot viewport width' },
  SCREENSHOT_HEIGHT: { key: 'screenshot_height', value: '800', description: 'Screenshot viewport height' },
  SCREENSHOT_TIMEOUT: { key: 'screenshot_timeout', value: '30000', description: 'Screenshot page load timeout (ms)' },
  DELAY_BETWEEN_DOMAINS_MIN: { key: 'delay_between_domains_min', value: '2000', description: 'Minimum delay between domain scrapes (ms)' },
  DELAY_BETWEEN_DOMAINS_MAX: { key: 'delay_between_domains_max', value: '5000', description: 'Maximum delay between domain scrapes (ms)' },
  WHOIS_TIMEOUT: { key: 'whois_timeout', value: '15000', description: 'WHOIS lookup timeout (ms)' },
  DNS_RECORD_TYPES: { key: 'dns_record_types', value: 'A,AAAA,MX,NS,TXT,CNAME,SOA,SRV,CAA', description: 'DNS record types to query (comma-separated)' },
  MAX_SUBDOMAINS_PER_DOMAIN: { key: 'max_subdomains_per_domain', value: '100', description: 'Max subdomains to discover per domain' },
  SCREENSHOT_SUBDOMAINS: { key: 'screenshot_subdomains', value: 'true', description: 'Also take screenshots of discovered subdomains' },
  CLEANUP_DAYS: { key: 'cleanup_days', value: '90', description: 'Delete old scrape data older than this many days' },
};
