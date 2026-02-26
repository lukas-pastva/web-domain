import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Domain } from './Domain';

@Entity('screenshots')
export class Screenshot {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  domainId!: number;

  @Column({ type: 'int', nullable: true })
  subdomainId!: number | null;

  @Column({ type: 'varchar', length: 500 })
  url!: string;

  @Column({ type: 'varchar', length: 500 })
  localPath!: string;

  @Column({ type: 'varchar', length: 255 })
  filename!: string;

  @Column({ type: 'varchar', length: 50, default: 'domain' })
  type!: string;

  @Column({ type: 'int', nullable: true })
  httpStatus!: number | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  imageHash!: string | null;

  @CreateDateColumn()
  capturedAt!: Date;

  @ManyToOne(() => Domain, domain => domain.screenshots, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'domainId' })
  domain!: Domain;
}
