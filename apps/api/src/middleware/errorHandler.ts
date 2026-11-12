import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { InvalidTimeZoneError, type ErrorResponse } from '@codeyoung/shared';
import { DomainError } from '../domain/errors.js';

/** HTTP status for each domain error code. Anything unlisted is a server error. */
const STATUS_BY_CODE: Readonly<Record<string, number>> = {
  VALIDATION_ERROR: 422,
};

function body(code: string, message: string, details?: unknown): ErrorResponse {
  return { error: { code, message, ...(details === undefined ? {} : { details }) } };
}

export const notFound: RequestHandler = (req, res) => {
  res.status(404).json(body('NOT_FOUND', `No route for ${req.method} ${req.path}`));
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    const details = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    res.status(422).json(body('VALIDATION_ERROR', 'Request is invalid', details));
    return;
  }
  if (err instanceof InvalidTimeZoneError) {
    res
      .status(422)
      .json(body('VALIDATION_ERROR', err.message, [{ path: 'tz', message: err.message }]));
    return;
  }
  if (err instanceof DomainError) {
    const status = STATUS_BY_CODE[err.code] ?? 500;
    const details = 'details' in err ? err.details : undefined;
    res.status(status).json(body(err.code, err.message, details));
    return;
  }
  // express.json() parse failures carry type 'entity.parse.failed'.
  if (
    typeof err === 'object' &&
    err !== null &&
    'type' in err &&
    err.type === 'entity.parse.failed'
  ) {
    res.status(400).json(body('INVALID_JSON', 'Request body is not valid JSON'));
    return;
  }
  console.error(err);
  res.status(500).json(body('INTERNAL_ERROR', 'Something went wrong on our side'));
};
