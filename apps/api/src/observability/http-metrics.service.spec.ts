import { HttpMetricsService } from './http-metrics.service';

describe('HttpMetricsService', () => {
  it('counts all responses and exposes a dedicated 5xx counter', () => {
    const metrics = new HttpMetricsService();

    metrics.recordResponse(200);
    metrics.recordResponse(404);
    metrics.recordResponse(500);
    metrics.recordResponse(503);

    expect(metrics.serverErrorCount()).toBe(2);
    expect(metrics.prometheus()).toContain('gidravlika_http_responses_total{status_class="2xx"} 1');
    expect(metrics.prometheus()).toContain('gidravlika_http_responses_total{status_class="5xx"} 2');
    expect(metrics.prometheus()).toContain('gidravlika_http_server_error_responses_total 2');
  });

  it('ignores invalid HTTP status codes', () => {
    const metrics = new HttpMetricsService();

    metrics.recordResponse(0);
    metrics.recordResponse(700);

    expect(metrics.prometheus()).toContain('gidravlika_http_server_error_responses_total 0');
  });

  describe('recent window', () => {
    afterEach(() => jest.useRealTimers());

    it('reports 5xx and p95 of real traffic over the last 15 minutes', () => {
      jest.useFakeTimers({ now: new Date('2026-09-25T10:00:00.000Z') });
      const metrics = new HttpMetricsService();
      for (let index = 0; index < 18; index += 1) metrics.recordResponse(200, 40, '/catalog');
      metrics.recordResponse(500, 300, '/requests/cart');
      metrics.recordResponse(200, 3_000, '/catalog/slow');
      // Probes do not count: a failing /ready is already seen by the uptime check.
      metrics.recordResponse(503, 1, '/ready');
      metrics.recordResponse(200, 20_000, '/ops/status');

      expect(metrics.recentStats()).toMatchObject({
        windowMinutes: 15,
        requests: 20,
        serverErrors: 1,
        p95Ms: 500,
      });

      jest.setSystemTime(new Date('2026-09-25T10:14:59.000Z'));
      expect(metrics.recentStats().requests).toBe(20);
      jest.setSystemTime(new Date('2026-09-25T10:15:00.000Z'));
      metrics.recordResponse(200, 12_000, '/catalog');
      expect(metrics.recentStats()).toMatchObject({
        requests: 1,
        serverErrors: 0,
        p95Ms: Number.POSITIVE_INFINITY,
      });
    });

    it('exports a cumulative duration histogram and DaData outcomes', () => {
      const metrics = new HttpMetricsService();
      metrics.recordResponse(200, 40, '/catalog');
      metrics.recordResponse(200, 700, '/catalog');
      metrics.recordDaDataRequest('budget_exhausted');

      const text = metrics.prometheus();
      expect(text).toContain('gidravlika_http_request_duration_seconds_bucket{le="0.05"} 1');
      expect(text).toContain('gidravlika_http_request_duration_seconds_bucket{le="1"} 2');
      expect(text).toContain('gidravlika_http_request_duration_seconds_bucket{le="+Inf"} 2');
      expect(text).toContain('gidravlika_http_request_duration_seconds_count 2');
      expect(text).toContain('gidravlika_dadata_requests_total{outcome="budget_exhausted"} 1');
    });
  });
});
