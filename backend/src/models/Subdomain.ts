import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Domain } from './Domain';

@Entity('subdomains')
export class Subdomain {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  domainId!: number;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ip!: string | null;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  @Column({ type: 'int', nullable: true })
  httpStatus!: number | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  title!: string | null;

  @CreateDateColumn()
  firstSeenAt!: Date;

  @UpdateDateColumn()
  lastSeenAt!: Date;

  @ManyToOne(() => Domain, domain => domain.subdomains, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'domainId' })
  domain!: Domain;
}
