import { Injectable } from '@nestjs/common';

const statusClasses = ['1xx', '2xx', '3xx', '4xx', '5xx'] as const;
type StatusClass = (typeof statusClasses)[number];

export const publicRequestRejectionReasons = [
  'honeypot',
  'ip_limit',
  'captcha_missing',
  'captcha_invalid',
  'captcha_expired',
  'captcha_replayed',
  'phone_limit',
  'email_limit',
  'global_budget',
] as const;
export type PublicRequestRejectionReason = (typeof publicRequestRejectionReasons)[number];

export const daDataOutcomes = [
  'success',
  'error',
  'timeout',
  'rate_limited',
  'budget_exhausted',
] as const;
export type DaDataOutcome = (typeof daDataOutcomes)[number];

/** Upper bounds of the request duration histogram, in milliseconds. */
const durationBucketsMs = [50, 100, 250, 500, 1_000, 2_500, 5_000, 10_000] as const;
const windowMinutes = 15;
/** Probes and monitoring calls would dilute the error rate and latency of real traffic. */
const internalPaths = new Set(['/health', '/ready', '/metrics', '/ops/status']);

type MinuteBucket = {
  minute: number;
  requests: number;
  serverErrors: number;
  durations: number[];
  daData: Record<DaDataOutcome, number>;
};

export type RecentHttpStats = {
  windowMinutes: number;
  requests: number;
  serverErrors: number;
  /** Upper bound of the bucket that holds the 95th percentile; null without traffic. */
  p95Ms: number | null;
  daData: Record<DaDataOutcome, number>;
};

@Injectable()
export class HttpMetricsService {
  private readonly startedAt = Date.now();
  private readonly responseCounts = new Map<StatusClass, number>(
    statusClasses.map((statusClass) => [statusClass, 0]),
  );

  private readonly publicRequestRejections = new Map<PublicRequestRejectionReason, number>(
    publicRequestRejectionReasons.map((reason) => [reason, 0]),
  );

  private readonly daDataRequests = new Map<DaDataOutcome, number>(
    daDataOutcomes.map((outcome) => [outcome, 0]),
  );
  /** Cumulative histogram of real traffic (probes excluded); the last slot is +Inf. */
  private readonly durationCounts = Array<number>(durationBucketsMs.length + 1).fill(0);
  private durationSumMs = 0;
  private readonly minutes: MinuteBucket[] = [];

  /** Calls to DaData by result (INT-01). */
  recordDaDataRequest(outcome: DaDataOutcome) {
    this.daDataRequests.set(outcome, (this.daDataRequests.get(outcome) ?? 0) + 1);
    this.currentMinute().daData[outcome] += 1;
  }

  /** Requests, 5xx and latency over the last minutes, for the operations status. */
  recentStats(): RecentHttpStats {
    const oldest = this.minuteNow() - windowMinutes + 1;
    const recent = this.minutes.filter((bucket) => bucket.minute >= oldest);
    const durations = Array<number>(durationBucketsMs.length + 1).fill(0);
    const daData = emptyDaDataCounts();
    let requests = 0;
    let serverErrors = 0;
    for (const bucket of recent) {
      requests += bucket.requests;
      serverErrors += bucket.serverErrors;
      bucket.durations.forEach((count, index) => (durations[index] += count));
      for (const outcome of daDataOutcomes) daData[outcome] += bucket.daData[outcome];
    }
    return { windowMinutes, requests, serverErrors, p95Ms: percentile(durations, 0.95), daData };
  }

  /** Public form submissions stopped by anti-spam checks (SEC-03), by reason. */
  recordPublicRequestRejection(reason: PublicRequestRejectionReason) {
    this.publicRequestRejections.set(reason, (this.publicRequestRejections.get(reason) ?? 0) + 1);
  }

  recordResponse(statusCode: number, durationMs?: number, path?: string) {
    const statusClass = this.statusClass(statusCode);
    if (!statusClass) return;
    this.responseCounts.set(statusClass, (this.responseCounts.get(statusClass) ?? 0) + 1);
    if (durationMs === undefined || (path !== undefined && internalPaths.has(path))) return;

    const bucketIndex = durationBucketIndex(durationMs);
    this.durationCounts[bucketIndex] += 1;
    this.durationSumMs += durationMs;
    const minute = this.currentMinute();
    minute.requests += 1;
    if (statusClass === '5xx') minute.serverErrors += 1;
    minute.durations[bucketIndex] += 1;
  }

  serverErrorCount() {
    return this.responseCounts.get('5xx') ?? 0;
  }

  prometheus() {
    const lines = [
      '# HELP gidravlika_http_responses_total HTTP responses grouped by status class.',
      '# TYPE gidravlika_http_responses_total counter',
      ...statusClasses.map(
        (statusClass) =>
          `gidravlika_http_responses_total{status_class="${statusClass}"} ${this.responseCounts.get(statusClass) ?? 0}`,
      ),
      '# HELP gidravlika_http_server_error_responses_total HTTP responses with a 5xx status.',
      '# TYPE gidravlika_http_server_error_responses_total counter',
      `gidravlika_http_server_error_responses_total ${this.serverErrorCount()}`,
      '# HELP gidravlika_public_request_rejections_total Public form submissions rejected by anti-spam checks.',
      '# TYPE gidravlika_public_request_rejections_total counter',
      ...publicRequestRejectionReasons.map(
        (reason) =>
          `gidravlika_public_request_rejections_total{reason="${reason}"} ${this.publicRequestRejections.get(reason) ?? 0}`,
      ),
      '# HELP gidravlika_http_request_duration_seconds Duration of API requests, probes excluded.',
      '# TYPE gidravlika_http_request_duration_seconds histogram',
      ...this.durationHistogram(),
      '# HELP gidravlika_dadata_requests_total Address suggestion calls to DaData by outcome.',
      '# TYPE gidravlika_dadata_requests_total counter',
      ...daDataOutcomes.map(
        (outcome) =>
          `gidravlika_dadata_requests_total{outcome="${outcome}"} ${this.daDataRequests.get(outcome) ?? 0}`,
      ),
      '# HELP gidravlika_process_uptime_seconds API process uptime in seconds.',
      '# TYPE gidravlika_process_uptime_seconds gauge',
      `gidravlika_process_uptime_seconds ${Math.floor((Date.now() - this.startedAt) / 1000)}`,
    ];
    return `${lines.join('\n')}\n`;
  }

  private durationHistogram() {
    let cumulative = 0;
    const lines = durationBucketsMs.map((bound, index) => {
      cumulative += this.durationCounts[index] ?? 0;
      return `gidravlika_http_request_duration_seconds_bucket{le="${bound / 1000}"} ${cumulative}`;
    });
    const total = cumulative + (this.durationCounts[durationBucketsMs.length] ?? 0);
    return [
      ...lines,
      `gidravlika_http_request_duration_seconds_bucket{le="+Inf"} ${total}`,
      `gidravlika_http_request_duration_seconds_sum ${(this.durationSumMs / 1000).toFixed(3)}`,
      `gidravlika_http_request_duration_seconds_count ${total}`,
    ];
  }

  private minuteNow() {
    return Math.floor(Date.now() / 60_000);
  }

  private currentMinute() {
    const minute = this.minuteNow();
    let bucket = this.minutes.at(-1);
    if (bucket?.minute !== minute) {
      bucket = {
        minute,
        requests: 0,
        serverErrors: 0,
        durations: Array<number>(durationBucketsMs.length + 1).fill(0),
        daData: emptyDaDataCounts(),
      };
      this.minutes.push(bucket);
      while ((this.minutes[0]?.minute ?? minute) <= minute - windowMinutes) this.minutes.shift();
    }
    return bucket;
  }

  private statusClass(statusCode: number): StatusClass | null {
    const firstDigit = Math.floor(statusCode / 100);
    return firstDigit >= 1 && firstDigit <= 5 ? (`${firstDigit}xx` as StatusClass) : null;
  }
}

function durationBucketIndex(durationMs: number) {
  const index = durationBucketsMs.findIndex((bound) => durationMs <= bound);
  return index < 0 ? durationBucketsMs.length : index;
}

function percentile(counts: number[], share: number) {
  const total = counts.reduce((sum, count) => sum + count, 0);
  if (!total) return null;
  let cumulative = 0;
  for (const [index, count] of counts.entries()) {
    cumulative += count;
    if (cumulative >= total * share) return durationBucketsMs[index] ?? Number.POSITIVE_INFINITY;
  }
  return Number.POSITIVE_INFINITY;
}

function emptyDaDataCounts(): Record<DaDataOutcome, number> {
  return Object.fromEntries(daDataOutcomes.map((outcome) => [outcome, 0])) as Record<
    DaDataOutcome,
    number
  >;
}
