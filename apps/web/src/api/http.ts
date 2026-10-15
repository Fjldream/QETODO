export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
}

export interface HttpClient {
  request<T>(path: string, options?: RequestOptions): Promise<T>;
  setCsrfToken(token: string): void;
  clearCsrfToken(): void;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

class BrowserHttpClient implements HttpClient {
  private csrfToken: string | null = null;

  setCsrfToken(token: string): void {
    this.csrfToken = token;
  }

  clearCsrfToken(): void {
    this.csrfToken = null;
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { body, ...fetchOptions } = options;
    const method = options.method?.toUpperCase() ?? 'GET';
    const headers = new Headers(options.headers);
    if (body !== undefined) headers.set('Content-Type', 'application/json');
    if (!['GET', 'HEAD'].includes(method) && this.csrfToken) {
      headers.set('X-CSRF-Token', this.csrfToken);
    }

    const response = await fetch(path, {
      ...fetchOptions,
      method,
      headers,
      credentials: 'include',
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

    const payload = response.status === 204 ? undefined : await response.json().catch(() => undefined);
    if (!response.ok) {
      const error = payload as { error?: string; message?: string; issues?: unknown } | undefined;
      const code = error?.error ?? 'REQUEST_FAILED';
      throw new ApiError(error?.message ?? messageFor(code), response.status, code, error?.issues);
    }
    return payload as T;
  }
}

function messageFor(code: string): string {
  const messages: Record<string, string> = {
    AUTHENTICATION_REQUIRED: '登录已失效，请重新登录',
    INVALID_CREDENTIALS: '用户名或密码不正确',
    TOO_MANY_ATTEMPTS: '尝试次数过多，请稍后再试',
    REQUEST_FORBIDDEN: '请求验证失败，请刷新后重试',
  };
  return messages[code] ?? '请求失败，请稍后重试';
}

export const apiClient: HttpClient = new BrowserHttpClient();
