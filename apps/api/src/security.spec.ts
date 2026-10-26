import { Controller, Get } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { apiSecurityHeaders } from './security';

@Controller()
class ProbeController {
  @Get('probe') probe() {
    return { status: 'ok' };
  }
}

describe('API security headers', () => {
  it('adds defensive headers and hides the server signature', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ProbeController],
    }).compile();
    const app = moduleRef.createNestApplication();
    app.use(apiSecurityHeaders());
    await app.init();

    try {
      const httpServer: unknown = app.getHttpServer();
      const response = await request(httpServer as App)
        .get('/probe')
        .expect(200);

      expect(response.headers).toMatchObject({
        'x-content-type-options': 'nosniff',
        'x-frame-options': 'SAMEORIGIN',
        'referrer-policy': 'no-referrer',
      });
      expect(response.headers['strict-transport-security']).toContain('max-age=');
      expect(response.headers['x-powered-by']).toBeUndefined();
    } finally {
      await app.close();
    }
  });
});
