import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError, notFound } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

/** Runs when no route matched: turns "nothing here" into a normal 404 error. */
export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(notFound(`No route for ${req.method} ${req.path}.`));
};

/**
 * The single place where errors become HTTP responses, so every error has the same shape:
 * { "error": { "code", "message", "details"?, "requestId" } }
 * Express recognises it as an error handler because it takes four arguments.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const requestId = req.id;

  if (err instanceof AppError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details, requestId },
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Some fields are invalid.',
        details: err.issues.map((issue) => ({
          path: issue.path.map(String).join('.'),
          message: issue.message,
        })),
        requestId,
      },
    });
    return;
  }

  // express.json() failures: malformed JSON or a body over the size limit
  if (isBodyParserError(err)) {
    const tooLarge = err.type === 'entity.too.large';
    res.status(tooLarge ? 413 : 400).json({
      error: {
        code: tooLarge ? 'PAYLOAD_TOO_LARGE' : 'INVALID_JSON',
        message: tooLarge ? 'Request body is too large.' : 'Request body is not valid JSON.',
        requestId,
      },
    });
    return;
  }

  // Anything else is a bug: log the details, but never leak them to the client.
  (req.log ?? logger).error({ err }, 'unhandled error');
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Something went wrong on our side.', requestId },
  });
};

function isBodyParserError(err: unknown): err is { type: string } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'type' in err &&
    typeof err.type === 'string' &&
    err.type.startsWith('entity.')
  );
}
