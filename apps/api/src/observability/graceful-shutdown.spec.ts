import { Controller, Get, INestApplication, Module, OnModuleDestroy } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { enableGracefulShutdown } from './graceful-shutdown';
import { StructuredLogger } from './structured-logger';

const events: string[] = [];

@Controller()
class SlowController {
  @Get('slow')
  async slow() {
    await new Promise((resolve) => setTimeout(resolve, 300));
    events.push('response');
    return { done: true };
  }
}

@Module({ controllers: [SlowController] })
class SlowModule implements OnModuleDestroy {
  onModuleDestroy() {
    // Stands for Prisma and the S3 client: must not go away under a running request.
    events.push('destroy');
  }
}

describe('enableGracefulShutdown', () => {
  let app: INestApplication;
  const signalListeners = () => process.listenerCount('SIGTERM') + process.listenerCount('SIGINT');
  let listenersBefore: number;

  beforeEach(async () => {
    events.length = 0;
    listenersBefore = signalListeners();
    app = await NestFactory.create(SlowModule, { logger: false });
  });

  afterEach(() => {
    delete process.env.SHUTDOWN_DRAIN_TIMEOUT_MS;
    process.removeAllListeners('SIGINT');
  });

  async function start(lines: string[], exit: jest.Mock) {
    enableGracefulShutdown(app, new StructuredLogger((line) => lines.push(line)), exit);
    await app.listen(0, '127.0.0.1');
    const { port } = (app.getHttpServer() as Server).address() as AddressInfo;
    return port;
  }

  it('on SIGTERM finishes requests in flight before closing modules, then exits', async () => {
    const lines: string[] = [];
    const exit = jest.fn();
    const port = await start(lines, exit);
    expect(signalListeners()).toBe(listenersBefore + 2);

    const response = fetch(`http://127.0.0.1:${port}/slow`);
    await new Promise((resolve) => setTimeout(resolve, 50));
    process.emit('SIGTERM');

    await expect((await response).json()).resolves.toEqual({ done: true });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(events).toEqual(['response', 'destroy']);
    expect(exit).toHaveBeenCalledWith(0);
    const logged = lines.map((line) => (JSON.parse(line) as { event: string }).event);
    expect(logged).toEqual(['application.shutdown_started', 'application.shutdown_completed']);
    await expect(fetch(`http://127.0.0.1:${port}/slow`)).rejects.toThrow();
  });

  it('stops waiting after the drain timeout', async () => {
    process.env.SHUTDOWN_DRAIN_TIMEOUT_MS = '100';
    const lines: string[] = [];
    const exit = jest.fn();
    const port = await start(lines, exit);

    const response = fetch(`http://127.0.0.1:${port}/slow`).catch(() => 'aborted');
    await new Promise((resolve) => setTimeout(resolve, 20));
    process.emit('SIGTERM');

    await expect(response).resolves.toBe('aborted');
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(exit).toHaveBeenCalledWith(0);
    expect(lines.join('\n')).toContain('application.shutdown_drain_timeout');
  });
});
