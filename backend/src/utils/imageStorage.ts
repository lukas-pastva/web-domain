import fs from 'fs';
import path from 'path';

const getStoragePath = (): string => {
  return process.env.PVC_MOUNT_PATH || '/data/images';
};

export const ensureDirectoryExists = (dirPath: string): void => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

export const getImageFullPath = (relativePath: string): string => {
  return path.join(getStoragePath(), relativePath);
};

export const deleteScreenshotFile = (localPath: string): void => {
  const fullPath = path.join(getStoragePath(), localPath);
  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
  }
};

export const deleteDomainImages = (domainId: number): void => {
  const dirPath = path.join(getStoragePath(), String(domainId));
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
};
