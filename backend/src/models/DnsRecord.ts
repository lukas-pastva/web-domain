import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Domain } from './Domain';

@Entity('dns_records')
export class DnsRecord {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  domainId!: number;

  @Column({ type: 'varchar', length: 20 })
  type!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'text' })
  value!: string;

  @Column({ type: 'int', nullable: true })
  ttl!: number | null;

  @Column({ type: 'int', nullable: true })
  priority!: number | null;

  @CreateDateColumn()
  scrapedAt!: Date;

  @ManyToOne(() => Domain, domain => domain.dnsRecords, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'domainId' })
  domain!: Domain;
}
