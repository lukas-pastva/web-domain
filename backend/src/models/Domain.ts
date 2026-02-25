import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { DomainInfo } from './DomainInfo';
import { DnsRecord } from './DnsRecord';
import { Subdomain } from './Subdomain';
import { Screenshot } from './Screenshot';

@Entity('domains')
export class Domain {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 255, unique: true })
  name!: string;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ type: 'datetime', nullable: true })
  lastScrapedAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @OneToMany(() => DomainInfo, info => info.domain)
  domainInfos!: DomainInfo[];

  @OneToMany(() => DnsRecord, record => record.domain)
  dnsRecords!: DnsRecord[];

  @OneToMany(() => Subdomain, sub => sub.domain)
  subdomains!: Subdomain[];

  @OneToMany(() => Screenshot, ss => ss.domain)
  screenshots!: Screenshot[];
}
