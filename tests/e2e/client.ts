/**
 * Simple HTTP test client with automatic cookie tracking.
 * Simulates browser-like request behavior for e2e tests.
 */
export class TestClient {
  private cookies: Map<string, string> = new Map();

  constructor(private baseUrl: string) {}

  async get<T = unknown>(path: string): Promise<{ status: number; body: T; headers: Headers }> {
    return this.request<T>('GET', path);
  }

  async post<T = unknown>(path: string, body?: unknown): Promise<{ status: number; body: T; headers: Headers }> {
    return this.request<T>('POST', path, body);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<{ status: number; body: T; headers: Headers }> {
    const headers: Record<string, string> = {};

    if (body != null) {
      headers['content-type'] = 'application/json';
    }

    const cookieStr = Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
    if (cookieStr) {
      headers['cookie'] = cookieStr;
    }

    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined,
      redirect: 'manual',
    });

    const setCookies = res.headers.getSetCookie?.() ?? [];
    for (const sc of setCookies) {
      const parts = sc.split(';')[0]!;
      const eq = parts.indexOf('=');
      if (eq > 0) {
        const name = parts.slice(0, eq);
        const value = parts.slice(eq + 1);
        if (value) {
          this.cookies.set(name, value);
        } else {
          this.cookies.delete(name);
        }
      }
    }

    const text = await res.text();
    let parsed: T;
    try {
      parsed = JSON.parse(text) as T;
    } catch {
      parsed = text as unknown as T;
    }

    return { status: res.status, body: parsed, headers: res.headers };
  }

  /** Directly set a cookie (e.g. for injecting a test JWT). */
  setCookie(name: string, value: string): void {
    this.cookies.set(name, value);
  }

  clearCookies(): void {
    this.cookies.clear();
  }
}
