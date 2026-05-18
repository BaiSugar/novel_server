import { anthropicAdapter } from "./anthropic.adapter";
import { openAiAdapter } from "./openai.adapter";
import type { ProviderAdapter } from "./types";

/**
 * 根据平台选择 Provider 适配器。
 * @param platform 平台标识。
 * @returns 适配器实例。
 */
export function resolveProviderAdapter(platform: string): ProviderAdapter {
  const normalized = platform.trim().toLowerCase();
  if (["anthropic", "claude"].includes(normalized)) return anthropicAdapter;
  return openAiAdapter;
}
