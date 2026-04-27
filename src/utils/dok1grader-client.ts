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

export interface ExpertRecord {
  id: number;
  name: string;
  who: string | null;
  why: string | null;
  focus: string | null;
  where: string | null;
  rankScore: number | null;
  rationale: string | null;
  twitterHandle: string | null;
  source: string;
  isFollowing: boolean;
}

export interface ExpertInput {
  name: string;
  who: string;
  why: string;
  focus?: string;
  where?: string;
}

// ── Scope Breaker sprint types ──

export interface PlanHistoryItem {
  id: number;
  startDate: string;
  endDate: string;
  status: 'active' | 'complete' | 'generating' | 'failed';
  taskCount: number;
  completedTaskCount: number;
  generationError?: string | null;
}

export type SprintTaskMilestone = 'weekly_artifact';

export interface TaskListItem {
  id: number;
  planId: number;
  scheduledDate: string;
  weekNumber: number;
  dayInWeek: number;
  title: string;
  description: string;
  milestone: SprintTaskMilestone | null;
  isComplete: boolean;
  isPastDue: boolean;
  deliverable: {
    id: number;
    title: string;
    docUrl: string;
    createdAt: string;
  } | null;
}

export interface GeneratePlanInput {
  localDate: string;
  diagnosis: {
    goalRaw: string;
    currentState: string;
  };
}

export interface CrossBrainliftTaskListItem extends TaskListItem {
  brainliftSlug: string;
  brainliftTitle: string;
}

export interface TaskDetailResponse extends TaskListItem {
  plan: {
    id: number;
    startDate: string;
    endDate: string;
    status: 'active' | 'complete' | 'generating' | 'failed';
  };
}

export interface GeneratedPlanResponse {
  plan: PlanHistoryItem;
  tasks: TaskListItem[];
}

export interface ListTasksQuery {
  date?: string;
  week?: number;
  state?: 'all' | 'complete' | 'incomplete';
  includePastDue?: boolean;
  localDate?: string;
}

export interface SaveDeliverableInput {
  title: string;
  markdown: string;
}

export interface UpdateDeliverableInput {
  markdown: string;
}

export interface DeliverableWriteResponse {
  docUrl: string;
}

export interface ReadDeliverableResponse {
  title: string;
  contentMarkdown: string;
  docUrl: string;
}

export interface DeliverableListItem {
  id: number;
  taskId: number;
  planId: number;
  title: string;
  taskTitle: string;
  scheduledDate: string;
  createdAt: string;
  docUrl: string;
}

export interface DeliverableListResponse {
  plans: PlanHistoryItem[];
  deliverables: DeliverableListItem[];
}

// ── CRUD response types ──

export interface EditResponse {
  id: number;
  dokLevel: number;
  status: 'regrading';
  previousScore: number | null;
  message: string;
}

export interface DeletePreviewResponse {
  item: { id: number; text: string; score: number | null };
  unlinkedItems: Array<{ id: number; dokLevel: number; text: string }>;
  staleDok2Ids: number[];
  staleDok3Ids: number[];
  staleDok4Ids: number[];
}

export interface DeleteResultResponse {
  deleted: true;
  impactSummary: { unlinked: number; markedStale: number };
}

export interface CreateResponse {
  id: number;
  status: 'grading';
}

export interface StaleItem {
  id: number;
  text: string | null;
  staleReason: string | null;
}

export interface StaleResponse {
  dok1: StaleItem[];
  dok2: StaleItem[];
  dok3: StaleItem[];
  dok4: StaleItem[];
}

export interface DismissStaleResponse {
  dismissed: boolean;
}

export interface LinkResponse {
  id: number;
  addedLinks: number;
  status: string;
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
    filters: {
      itemId?: number;
      sortBy?: 'id' | 'score' | 'updatedAt';
      order?: 'asc' | 'desc';
      status?: string;
    } = {},
  ): Promise<AssessmentResponse> {
    const params = new URLSearchParams({
      dok: String(dok),
      page: String(page),
      pageSize: String(pageSize),
      detail,
    });
    if (filters.itemId != null) params.set('itemId', String(filters.itemId));
    if (filters.sortBy) params.set('sortBy', filters.sortBy);
    if (filters.order) params.set('order', filters.order);
    if (filters.status) params.set('status', filters.status);

    const response = await this.request(
      'GET',
      `/api/internal/brainlifts/${slug}/assessment?${params.toString()}`,
    );
    return (await response.json()) as AssessmentResponse;
  }

  /**
   * List all experts for a brainlift.
   * Calls GET /api/internal/brainlifts/:slug/experts.
   */
  async listExperts(slug: string): Promise<ExpertRecord[]> {
    const response = await this.request(
      'GET',
      `/api/internal/brainlifts/${slug}/experts`,
    );
    return (await response.json()) as ExpertRecord[];
  }

  /**
   * Create one or more experts for a brainlift.
   * Calls POST /api/internal/brainlifts/:slug/experts.
   */
  async createExperts(slug: string, experts: ExpertInput[]): Promise<ExpertRecord[]> {
    const response = await this.request(
      'POST',
      `/api/internal/brainlifts/${slug}/experts`,
      { experts },
    );
    return (await response.json()) as ExpertRecord[];
  }

  /**
   * Delete one expert from a brainlift.
   * Calls DELETE /api/internal/brainlifts/:slug/experts/:id.
   */
  async deleteExpert(slug: string, expertId: number): Promise<void> {
    await this.request(
      'DELETE',
      `/api/internal/brainlifts/${slug}/experts/${expertId}`,
    );
  }

  // ── Scope Breaker sprint methods ──

  /**
   * Generate a new 30-day sprint plan.
   * Calls POST /api/internal/brainlifts/:slug/plans.
   */
  async generatePlan(slug: string, input: GeneratePlanInput): Promise<GeneratedPlanResponse> {
    const response = await this.request(
      'POST',
      `/api/internal/brainlifts/${slug}/plans`,
      input,
    );
    return (await response.json()) as GeneratedPlanResponse;
  }

  /**
   * Get active sprint plan state.
   * Calls GET /api/internal/brainlifts/:slug/plans/active.
   */
  async getPlan(slug: string): Promise<GeneratedPlanResponse | null> {
    const response = await this.request(
      'GET',
      `/api/internal/brainlifts/${slug}/plans/active`,
    );
    const result = (await response.json()) as GeneratedPlanResponse | {
      plan: null;
      tasks: TaskListItem[];
    };
    if (!result.plan) return null;
    return result as GeneratedPlanResponse;
  }

  /**
   * List sprint tasks for a brainlift.
   * Calls GET /api/internal/brainlifts/:slug/tasks.
   */
  async listTasks(slug: string, query: ListTasksQuery = {}): Promise<TaskListItem[]> {
    const params = toQueryParams(query);
    const queryString = params.toString();
    const response = await this.request(
      'GET',
      `/api/internal/brainlifts/${slug}/tasks${queryString ? `?${queryString}` : ''}`,
    );
    return (await response.json()) as TaskListItem[];
  }

  /**
   * List sprint tasks across every brainlift the authenticated user has access to.
   * Calls GET /api/internal/tasks.
   */
  async listAllTasks(query: ListTasksQuery = {}): Promise<CrossBrainliftTaskListItem[]> {
    const params = toQueryParams(query);
    const queryString = params.toString();
    const response = await this.request(
      'GET',
      `/api/internal/tasks${queryString ? `?${queryString}` : ''}`,
    );
    return (await response.json()) as CrossBrainliftTaskListItem[];
  }

  /**
   * Get one sprint task detail.
   * Calls GET /api/internal/brainlifts/:slug/tasks/:taskId.
   */
  async getTask(slug: string, taskId: number): Promise<TaskDetailResponse> {
    const response = await this.request(
      'GET',
      `/api/internal/brainlifts/${slug}/tasks/${taskId}`,
    );
    return (await response.json()) as TaskDetailResponse;
  }

  /**
   * Create a deliverable for a sprint task.
   * Calls POST /api/internal/brainlifts/:slug/tasks/:taskId/deliverable.
   */
  async saveDeliverable(
    slug: string,
    taskId: number,
    input: SaveDeliverableInput,
  ): Promise<DeliverableWriteResponse> {
    const response = await this.request(
      'POST',
      `/api/internal/brainlifts/${slug}/tasks/${taskId}/deliverable`,
      input,
    );
    return (await response.json()) as DeliverableWriteResponse;
  }

  /**
   * Read the current deliverable for a sprint task.
   * Calls GET /api/internal/brainlifts/:slug/tasks/:taskId/deliverable.
   */
  async readDeliverable(slug: string, taskId: number): Promise<ReadDeliverableResponse> {
    const response = await this.request(
      'GET',
      `/api/internal/brainlifts/${slug}/tasks/${taskId}/deliverable`,
    );
    return (await response.json()) as ReadDeliverableResponse;
  }

  /**
   * Update the current deliverable for a sprint task.
   * Calls PUT /api/internal/brainlifts/:slug/tasks/:taskId/deliverable.
   */
  async updateDeliverable(
    slug: string,
    taskId: number,
    input: UpdateDeliverableInput,
  ): Promise<DeliverableWriteResponse> {
    const response = await this.request(
      'PUT',
      `/api/internal/brainlifts/${slug}/tasks/${taskId}/deliverable`,
      input,
    );
    return (await response.json()) as DeliverableWriteResponse;
  }

  /**
   * List all deliverables for a brainlift.
   * Calls GET /api/internal/brainlifts/:slug/deliverables.
   */
  async listDeliverables(
    slug: string,
    query: { planId?: number } = {},
  ): Promise<DeliverableListResponse> {
    const params = toQueryParams(query);
    const queryString = params.toString();
    const response = await this.request(
      'GET',
      `/api/internal/brainlifts/${slug}/deliverables${queryString ? `?${queryString}` : ''}`,
    );
    return (await response.json()) as DeliverableListResponse;
  }

  // ── CRUD methods ──

  /**
   * Edit the text of a DOK item. Triggers regrading.
   */
  async editDokItem(
    slug: string,
    dok: number,
    itemId: number,
    text: string,
  ): Promise<EditResponse> {
    const response = await this.request(
      'PATCH',
      `/api/internal/brainlifts/${slug}/dok/${dok}/items/${itemId}`,
      { text },
    );
    return (await response.json()) as EditResponse;
  }

  /**
   * Delete a DOK item. When preview=true, returns impact preview without deleting.
   */
  async deleteDokItem(
    slug: string,
    dok: number,
    itemId: number,
    preview: boolean,
  ): Promise<DeletePreviewResponse | DeleteResultResponse> {
    const previewParam = preview ? '?preview=true' : '';
    const response = await this.request(
      'DELETE',
      `/api/internal/brainlifts/${slug}/dok/${dok}/items/${itemId}${previewParam}`,
    );
    return (await response.json()) as DeletePreviewResponse | DeleteResultResponse;
  }

  /**
   * Create a new DOK1 fact.
   */
  async createDok1(
    slug: string,
    data: { fact: string; source: string; category?: string },
  ): Promise<CreateResponse> {
    const response = await this.request(
      'POST',
      `/api/internal/brainlifts/${slug}/dok1`,
      data,
    );
    return (await response.json()) as CreateResponse;
  }

  /**
   * Create a new DOK2 summary.
   */
  async createDok2(
    slug: string,
    data: {
      sourceName: string;
      sourceUrl?: string;
      points: string[];
      relatedFactIds: number[];
    },
  ): Promise<CreateResponse> {
    const response = await this.request(
      'POST',
      `/api/internal/brainlifts/${slug}/dok2`,
      data,
    );
    return (await response.json()) as CreateResponse;
  }

  /**
   * Create a new DOK3 insight.
   */
  async createDok3(
    slug: string,
    data: { text: string; linkedDok2Ids: number[] },
  ): Promise<CreateResponse> {
    const response = await this.request(
      'POST',
      `/api/internal/brainlifts/${slug}/dok3`,
      data,
    );
    return (await response.json()) as CreateResponse;
  }

  /**
   * Create a new DOK4 SPOV.
   */
  async createDok4(
    slug: string,
    data: { text: string; linkedDok3Ids: number[]; primaryDok3Id: number },
  ): Promise<CreateResponse> {
    const response = await this.request(
      'POST',
      `/api/internal/brainlifts/${slug}/dok4`,
      data,
    );
    return (await response.json()) as CreateResponse;
  }

  /**
   * Get all stale items in a brainlift.
   */
  async getStaleItems(slug: string): Promise<StaleResponse> {
    const response = await this.request(
      'GET',
      `/api/internal/brainlifts/${slug}/stale`,
    );
    return (await response.json()) as StaleResponse;
  }

  /**
   * Dismiss the stale flag on an item.
   */
  async dismissStale(
    slug: string,
    dok: number,
    itemId: number,
  ): Promise<DismissStaleResponse> {
    const response = await this.request(
      'POST',
      `/api/internal/brainlifts/${slug}/dok/${dok}/items/${itemId}/dismiss-stale`,
    );
    return (await response.json()) as DismissStaleResponse;
  }

  /**
   * Add DOK2 summary links to an existing DOK3 insight.
   */
  async linkDok3(
    slug: string,
    insightId: number,
    dok2Ids: number[],
  ): Promise<LinkResponse> {
    const response = await this.request(
      'POST',
      `/api/internal/brainlifts/${slug}/dok3/${insightId}/links`,
      { dok2Ids },
    );
    return (await response.json()) as LinkResponse;
  }

  /**
   * Add DOK3 insight links to an existing DOK4 SPOV.
   */
  async linkDok4(
    slug: string,
    spovId: number,
    dok3Ids: number[],
    newPrimaryDok3Id?: number,
  ): Promise<LinkResponse> {
    const response = await this.request(
      'POST',
      `/api/internal/brainlifts/${slug}/dok4/${spovId}/links`,
      { dok3Ids, ...(newPrimaryDok3Id != null ? { newPrimaryDok3Id } : {}) },
    );
    return (await response.json()) as LinkResponse;
  }

  /**
   * Make an authenticated request to DOK1Grader.
   */
  private async request(
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
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
      'X-User-Name': encodeURIComponent(this.userName || this.userEmail.split('@')[0]),
      'Content-Type': 'application/json',
    };

    const config: RequestInit = { method, headers };

    if (body && (method === 'POST' || method === 'PATCH' || method === 'PUT' || method === 'DELETE')) {
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

function toQueryParams(query: object): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query as Record<string, unknown>)) {
    if (value == null) continue;
    params.set(key, String(value));
  }
  return params;
}
