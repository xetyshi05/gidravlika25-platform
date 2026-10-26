import helmet from 'helmet';

export function apiSecurityHeaders() {
  return helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  });
}
