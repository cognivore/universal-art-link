import fs from 'fs-extra';
import { SiteConfig } from '../types/content.js';

type DeployConfig = NonNullable<SiteConfig['deploy']>;

export const deployZipBundle = async (zipPath: string, deployConfig: DeployConfig): Promise<Response> => {
  const body = await fs.readFile(zipPath);
  const headers: Record<string, string> = {
    'Content-Type': 'application/zip',
    'Content-Length': String(body.length),
  };
  if (deployConfig.authHeader) {
    headers.Authorization = deployConfig.authHeader;
  }

  const response = await fetch(deployConfig.endpoint, {
    method: deployConfig.method ?? 'POST',
    headers,
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Deploy failed with ${response.status}: ${text}`);
  }

  return response;
};

