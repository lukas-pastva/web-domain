import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('scrape_runs')
export class ScrapeRun {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 20, default: 'running' })
  status!: 'running' | 'completed' | 'failed';

  @Column({ type: 'int', nullable: true })
  configId!: number | null;

  @Column({ type: 'int', default: 0 })
  domainsTotal!: number;

  @Column({ type: 'int', default: 0 })
  domainsProcessed!: number;

  @Column({ type: 'int', default: 0 })
  whoisLookups!: number;

  @Column({ type: 'int', default: 0 })
  dnsLookups!: number;

  @Column({ type: 'int', default: 0 })
  subdomainsFound!: number;

  @Column({ type: 'int', default: 0 })
  screenshotsTaken!: number;

  @Column({ type: 'int', default: 0 })
  errorsCount!: number;

  @Column({ type: 'text', nullable: true })
  errorMessages!: string | null;

  @CreateDateColumn()
  startedAt!: Date;

  @Column({ type: 'datetime', nullable: true })
  completedAt!: Date | null;
}
