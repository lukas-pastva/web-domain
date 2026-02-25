import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Domain } from './Domain';

@Entity('domain_info')
export class DomainInfo {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  domainId!: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  registrar!: string | null;

  @Column({ type: 'datetime', nullable: true })
  expiryDate!: Date | null;

  @Column({ type: 'datetime', nullable: true })
  creationDate!: Date | null;

  @Column({ type: 'datetime', nullable: true })
  updatedDate!: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  registrant!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  status!: string | null;

  @Column({ type: 'text', nullable: true })
  nameServers!: string | null;

  @Column({ type: 'text', nullable: true })
  rawWhois!: string | null;

  @CreateDateColumn()
  scrapedAt!: Date;

  @ManyToOne(() => Domain, domain => domain.domainInfos, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'domainId' })
  domain!: Domain;
}
