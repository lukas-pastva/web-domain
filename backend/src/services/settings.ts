import { AppDataSource } from '../config/database';
import { Setting, DEFAULT_SETTINGS } from '../models/Setting';

let settingsCache: Map<string, string> = new Map();
let cacheInitialized = false;

export const initializeSettings = async (): Promise<void> => {
  const settingRepo = AppDataSource.getRepository(Setting);

  for (const [, defaultSetting] of Object.entries(DEFAULT_SETTINGS)) {
    const existing = await settingRepo.findOne({ where: { key: defaultSetting.key } });
    if (!existing) {
      const setting = new Setting();
      setting.key = defaultSetting.key;
      setting.value = defaultSetting.value;
      setting.description = defaultSetting.description;
      await settingRepo.save(setting);
    }
  }

  await refreshSettingsCache();
};

export const refreshSettingsCache = async (): Promise<void> => {
  const settingRepo = AppDataSource.getRepository(Setting);
  const allSettings = await settingRepo.find();

  settingsCache.clear();
  for (const setting of allSettings) {
    settingsCache.set(setting.key, setting.value);
  }
  cacheInitialized = true;
};

export const getSetting = async (key: string, defaultValue?: string): Promise<string> => {
  // Environment variables override DB settings (e.g. ARGO_WORKFLOW_URL env overrides argo_workflow_url setting)
  const envValue = process.env[key.toUpperCase()];
  if (envValue) return envValue;

  if (!cacheInitialized) {
    await refreshSettingsCache();
  }
  return settingsCache.get(key) || defaultValue || '';
};

export const getSettingNumber = async (key: string, defaultValue: number): Promise<number> => {
  const value = await getSetting(key);
  const num = parseInt(value, 10);
  return isNaN(num) ? defaultValue : num;
};

export const getSettingBoolean = async (key: string, defaultValue: boolean): Promise<boolean> => {
  const value = await getSetting(key);
  if (!value) return defaultValue;
  return value === 'true';
};

export const updateSetting = async (key: string, value: string): Promise<Setting | null> => {
  const settingRepo = AppDataSource.getRepository(Setting);
  const setting = await settingRepo.findOne({ where: { key } });

  if (setting) {
    setting.value = value;
    await settingRepo.save(setting);
    settingsCache.set(key, value);
    return setting;
  }

  return null;
};

export const getAllSettings = async (): Promise<Setting[]> => {
  const settingRepo = AppDataSource.getRepository(Setting);
  return await settingRepo.find({ order: { key: 'ASC' } });
};
