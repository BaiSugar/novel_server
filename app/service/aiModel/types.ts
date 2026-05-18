export type AiModelCapability =
  | "TEXT_CHAT"
  | "TOOL_CALLING"
  | "STREAMING"
  | "IMAGE_GENERATION"
  | "MULTI_MODAL_INPUT"
  | "JSON_MODE";

export type AiModelPublicStatus = "SMOOTH" | "CONGESTED" | "OUTAGE";

export interface AiModelPublicItem {
  id: number;
  name: string;
  description: string;
  temperature: number;
  tags: string[];
  status: AiModelPublicStatus;
}

export interface ModelDefinitionAdmin {
  id: number;
  identifier: string;
  displayName: string;
  contextWindow: number;
  maxOutputTokens: number;
  defaultTemperature: number;
  reasoningEffort: string;
  extraParams: unknown | null;
  capabilities: string[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AiModelSlotAdmin {
  id: number;
  displayName: string;
  description: string;
  tags: string[];
  sortOrder: number;
  enabled: boolean;
  failoverStrategy: string;
  defaultTemperature: number | null;
  boundModelId: number | null;
  boundModel: ModelDefinitionAdmin | null;
  status: AiModelPublicStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderAccountAdmin {
  id: number;
  platform: string;
  label: string;
  baseUrl: string;
  apiKeyMasked: string;
  extraHeaders: unknown | null;
  extraParams: unknown | null;
  priority: number;
  weight: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderAccountHealthAdmin {
  modelId: number;
  accountId: number;
  successCount: number;
  failureCount: number;
  p95LatencyMs: number | null;
  consecutiveFailures: number;
  circuitOpenUntil: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastErrorCode: string | null;
  updatedAt: string;
}

export interface ModelAccountBindingAdmin {
  modelId: number;
  accountId: number;
  priority: number;
  enabled: boolean;
  account: ProviderAccountAdmin;
  health: ProviderAccountHealthAdmin | null;
}

export interface PagedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateSlotInput {
  id: number;
  displayName: string;
  description?: string;
  tags?: string[];
  sortOrder?: number;
  enabled?: boolean;
  failoverStrategy?: string;
  defaultTemperature?: number | null;
  boundModelId?: number | null;
}

export type UpdateSlotInput = Partial<Omit<CreateSlotInput, "id">>;

export interface CreateModelDefinitionInput {
  identifier: string;
  displayName: string;
  contextWindow: number;
  maxOutputTokens: number;
  defaultTemperature: number;
  reasoningEffort?: string;
  extraParams?: unknown;
  capabilities?: string[];
  enabled?: boolean;
}

export type UpdateModelDefinitionInput = Partial<CreateModelDefinitionInput>;

export interface CreateProviderAccountInput {
  platform: string;
  label: string;
  baseUrl: string;
  apiKey: string;
  extraHeaders?: unknown;
  extraParams?: unknown;
  priority?: number;
  weight?: number;
  enabled?: boolean;
}

export interface UpdateProviderAccountInput {
  platform?: string;
  label?: string;
  baseUrl?: string;
  apiKey?: string;
  extraHeaders?: unknown;
  extraParams?: unknown;
  priority?: number;
  weight?: number;
  enabled?: boolean;
}

export interface BindAccountInput {
  accountId: number;
  priority?: number;
  enabled?: boolean;
}

export interface ReorderAccountInput {
  orders: Array<{ accountId: number; priority: number }>;
}

export interface ModelCallContext {
  slotId: number;
  model: {
    id: number;
    identifier: string;
    displayName: string;
    contextWindow: number;
    maxOutputTokens: number;
    defaultTemperature: number;
    reasoningEffort: string;
    extraParams: unknown | null;
    capabilities: string[];
  };
  account: {
    id: number;
    platform: string;
    baseUrl: string;
    apiKey: string;
    extraHeaders: unknown | null;
    extraParams: unknown | null;
  };
}
