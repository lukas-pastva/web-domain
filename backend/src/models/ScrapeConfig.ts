import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('scrape_configs')
export class ScrapeConfig {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'boolean', default: true })
  enabled!: boolean;

  @Column({ type: 'int', default: 60 })
  intervalMinutes!: number;

  @Column({ type: 'boolean', default: true })
  enableWhois!: boolean;

  @Column({ type: 'boolean', default: true })
  enableDns!: boolean;

  @Column({ type: 'boolean', default: true })
  enableSubdomains!: boolean;

  @Column({ type: 'boolean', default: true })
  enableScreenshots!: boolean;

  @Column({ type: 'text', nullable: true })
  domainIds!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  dnsRecordTypes!: string | null;

  @Column({ type: 'datetime', nullable: true })
  lastRunAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
