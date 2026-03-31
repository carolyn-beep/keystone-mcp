/**
 * HTTP client for DOK1Grader internal API.
 *
 * Centralizes header injection (service key, user email/name),
 * error handling, and base URL management.
 */

export class DOK1GraderClient {
  private baseUrl: string;
  private serviceKey: string;
  private userEmail: string | null = null;
  private userName: string | null = null;

  constructor(baseUrl: string, serviceKey: string) {
    // Remove trailing slash for consistent URL construction
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.serviceKey = serviceKey;
  }

  /**
   * Set user context for all subsequent API calls.
   * Must be called before making any requests.
   */
  withUser(email: string, name: string): this {
    this.userEmail = email;
    this.userName = name;
    return this;
  }

  /**
   * Fetch the Brainlift markdown template.
   * Calls GET /api/internal/template on DOK1Grader.
   */
  async getTemplate(): Promise<string> {
    const response = await this.request('GET', '/api/internal/template');
    const data = (await response.json()) as { template: string; format: string };
    return data.template;
  }

  /**
   * Make an authenticated request to DOK1Grader.
   */
  private async request(
    method: 'GET' | 'POST',
    path: string,
    body?: object,
  ): Promise<Response> {
    if (!this.userEmail) {
      throw new Error(
        'User context not set. Call withUser(email, name) before making requests.',
      );
    }

    const url = `${this.baseUrl}${path}`;

    const headers: Record<string, string> = {
      'X-Service-Key': this.serviceKey,
      'X-User-Email': this.userEmail,
      'X-User-Name': this.userName || this.userEmail.split('@')[0],
      'Content-Type': 'application/json',
    };

    const config: RequestInit = { method, headers };

    if (body && method === 'POST') {
      config.body = JSON.stringify(body);
    }

    const response = await fetch(url, config);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `DOK1Grader API error: ${response.status} - ${errorText}`,
      );
    }

    return response;
  }
}
