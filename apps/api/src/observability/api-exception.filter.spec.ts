import {
  ArgumentsHost,
  BadGatewayException,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiExceptionFilter } from './api-exception.filter';
import { StructuredLogger } from './structured-logger';

describe('ApiExceptionFilter', () => {
  function respond(exception: unknown) {
    const json = jest.fn();
    const response = {
      headersSent: false,
      setHeader: jest.fn(),
      status: jest.fn(() => ({ json })),
    };
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({ requestId: 'request-1', method: 'POST', path: '/x' }),
        getResponse: () => response,
      }),
    } as unknown as ArgumentsHost;
    const logger = { event: jest.fn() } as unknown as StructuredLogger;
    new ApiExceptionFilter(logger).catch(exception, host);
    const [[body]] = json.mock.calls as unknown[][];
    return { status: response.status, body, logger };
  }

  it('passes the message of an explicit 503 to the client and still logs it', () => {
    const { status, body, logger } = respond(
      new ServiceUnavailableException(
        'Сервис удаления фона недоступен. Повторите попытку через несколько минут.',
      ),
    );

    expect(status).toHaveBeenCalledWith(503);
    expect(body).toEqual({
      statusCode: 503,
      message: 'Сервис удаления фона недоступен. Повторите попытку через несколько минут.',
      error: 'Service Unavailable',
      requestId: 'request-1',
    });
    expect((logger as unknown as { event: jest.Mock }).event).toHaveBeenCalledTimes(1);
  });

  it('keeps readiness details of a structured 503', () => {
    const { body } = respond(
      new ServiceUnavailableException({ status: 'error', checks: { database: 'down' } }),
    );

    expect(body).toEqual({
      statusCode: 503,
      status: 'error',
      checks: { database: 'down' },
      requestId: 'request-1',
    });
  });

  it.each([
    ['an unexpected error', new Error('connect ECONNREFUSED 10.0.0.5:5432')],
    ['an explicit 500', new InternalServerErrorException('secret detail')],
    ['an explicit 502', new BadGatewayException('upstream detail')],
  ])('masks %s', (_name, exception) => {
    const { body } = respond(exception);

    expect(body).toEqual({
      statusCode: expect.any(Number) as number,
      message: 'Внутренняя ошибка сервера.',
      requestId: 'request-1',
    });
  });
});
