export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    readonly details?: unknown,
  ) {
    super(code);
    this.name = 'HttpError';
  }
}
