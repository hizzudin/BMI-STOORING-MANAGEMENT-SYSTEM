import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { type Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { IdempotencyStore } from './idempotency.store.js';

/** The header carrying the client's idempotency key (NFR-01). */
export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';

/** Methods for which an idempotency key is honoured (the mutating ones). */
const MUTATING_METHODS: ReadonlySet<string> = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Idempotency support for mutating endpoints (NFR-01).
 *
 * When a POST/PUT/PATCH/DELETE carries an `Idempotency-Key` header:
 *   - **First sight** → the handler runs; its successful response (status +
 *     body) is remembered against the key.
 *   - **Replay** → the stored response is returned verbatim without re-running
 *     the handler, so retries from a flaky mobile network cause no duplicate
 *     effect ("submit/approve/post/issue are idempotent", NFR-01).
 *
 * Requests without the header, and all read-only methods, pass straight through.
 * This pairs with {@link UnitOfWorkContext.claimIdempotencyKey} in the gateway:
 * this layer dedupes at the HTTP edge, the gateway dedupes within a transaction.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly store: IdempotencyStore) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const method = request.method.toUpperCase();

    const headerValue = request.header(IDEMPOTENCY_KEY_HEADER);
    const key = typeof headerValue === 'string' ? headerValue.trim() : '';

    if (!MUTATING_METHODS.has(method) || key === '') {
      return next.handle();
    }

    const existing = this.store.get(key);
    if (existing) {
      // Replay: return the first response, do not run the handler again.
      response.status(existing.statusCode);
      response.setHeader('Idempotency-Replayed', 'true');
      return of(existing.body);
    }

    return next.handle().pipe(
      tap((body) => {
        this.store.remember(key, response.statusCode, body);
      }),
    );
  }
}
