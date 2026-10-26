import { Injectable } from '@nestjs/common';
import { statfs } from 'node:fs/promises';
import { cpus, freemem, loadavg, totalmem } from 'node:os';

export type ResourceUsage = {
  usedBytes: number;
  totalBytes: number;
  usedPercent: number;
};

export type ServerResources = {
  status: 'ok';
  checkedAt: string;
  uptimeSeconds: number;
  cpu: {
    cores: number;
    loadAverage1m: number;
    loadPercent: number;
  };
  memory: ResourceUsage;
  disk: ResourceUsage | null;
};

@Injectable()
export class ServerResourcesService {
  async status(): Promise<ServerResources> {
    const cpuCount = Math.max(cpus().length, 1);
    const oneMinuteLoad = loadavg()[0] ?? 0;
    const memoryTotal = totalmem();
    const memoryUsed = Math.max(memoryTotal - freemem(), 0);

    return {
      status: 'ok',
      checkedAt: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      cpu: {
        cores: cpuCount,
        loadAverage1m: round(oneMinuteLoad, 2),
        loadPercent: usagePercent(oneMinuteLoad, cpuCount),
      },
      memory: usage(memoryUsed, memoryTotal),
      disk: await diskUsage(),
    };
  }
}

async function diskUsage(): Promise<ResourceUsage | null> {
  try {
    const stats = await statfs('/');
    const total = stats.blocks * stats.bsize;
    const free = stats.bfree * stats.bsize;
    return usage(Math.max(total - free, 0), total);
  } catch {
    return null;
  }
}

export function usage(usedBytes: number, totalBytes: number): ResourceUsage {
  return {
    usedBytes,
    totalBytes,
    usedPercent: usagePercent(usedBytes, totalBytes),
  };
}

function usagePercent(used: number, total: number) {
  if (!Number.isFinite(used) || !Number.isFinite(total) || total <= 0) return 0;
  return round(Math.min(Math.max((used / total) * 100, 0), 100), 1);
}

function round(value: number, precision: number) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}
