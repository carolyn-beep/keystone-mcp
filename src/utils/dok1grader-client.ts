/**
 * HTTP client for DOK1Grader internal API.
 *
 * Centralizes header injection (service key, user email/name),
 * error handling, and base URL management.
 */

// ── Response types ──

export interface GradeResponse {
  slug: string;
  brainliftId: number;
  status: string;
  retryAfter: number;
}

export interface Pagination {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface BrainliftListItem {
  slug: string;
  title: string;
  status: string;
  score: number | null;
  createdAt: string;
}

export interface ListBrainliftsResponse {
  brainlifts: BrainliftListItem[];
  pagination: Pagination;
}

export interface DOKProgress {
  total: number;
  graded: number;
  pending: number;
  error: number;
}

export interface StatusResponse {
  slug: string;
  title: string;
  status: string;
  progress: {
    dok1: DOKProgress;
    dok2: DOKProgress;
    dok3: DOKProgress;
    dok4: DOKProgress;
  };
  score: {
    overall: number | null;
    dok1Mean: number | null;
    dok2Mean: number | null;
    dok3Mean: number | null;
    dok4Mean: number | null;
  };
  retryAfter: number;
  createdAt: string;
}

export interface AssessmentResponse {
  slug: string;
  dok: number;
  status: string;
  items: any[];
  pagination: Pagination;
}

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
   * Submit markdown for grading.
   * Calls POST /api/internal/grade on DOK1Grader.
   */
  async gradeBrainlift(
    markdown: string,
    title?: string,
  ): Promise<GradeResponse> {
    const body: Record<string, string> = { markdown };
    if (title) body.title = title;
    const response = await this.request('POST', '/api/internal/grade', body);
    return (await response.json()) as GradeResponse;
  }

  /**
   * List user's brainlifts with pagination.
   * Calls GET /api/internal/brainlifts on DOK1Grader.
   */
  async listBrainlifts(
    page: number = 1,
    pageSize: number = 10,
  ): Promise<ListBrainliftsResponse> {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    const response = await this.request(
      'GET',
      `/api/internal/brainlifts?${params.toString()}`,
    );
    return (await response.json()) as ListBrainliftsResponse;
  }

  /**
   * Get grading status and progress for a brainlift.
   * Calls GET /api/internal/brainlifts/:slug/status on DOK1Grader.
   */
  async getStatus(slug: string): Promise<StatusResponse> {
    const response = await this.request(
      'GET',
      `/api/internal/brainlifts/${slug}/status`,
    );
    return (await response.json()) as StatusResponse;
  }

  /**
   * Get paginated assessment results for a specific DOK level.
   * Calls GET /api/internal/brainlifts/:slug/assessment on DOK1Grader.
   */
  async getAssessment(
    slug: string,
    dok: number,
    page: number,
    pageSize: number,
    detail: 'summary' | 'full' = 'summary',
  ): Promise<AssessmentResponse> {
    const params = new URLSearchParams({
      dok: String(dok),
      page: String(page),
      pageSize: String(pageSize),
      detail,
    });
    const response = await this.request(
      'GET',
      `/api/internal/brainlifts/${slug}/assessment?${params.toString()}`,
    );
    return (await response.json()) as AssessmentResponse;
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
