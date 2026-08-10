import logger from '../logger.js';
import { anthropicProvider } from './anthropic.js';
import { openaiProvider } from './openai.js';
import type { LlmProvider } from './types.js';

export * from './types.js';

/**
 * Select the LLM provider from `LLM_PROVIDER` ('openai' | 'anthropic').
 * Defaults to 'anthropic' when unset so existing deployments keep working
 * without an OpenAI key.
 */
export function getLlmProvider(): LlmProvider {
  const name = (process.env.LLM_PROVIDER || 'anthropic').trim().toLowerCase();
  if (name === 'openai') return openaiProvider;
  if (name !== 'anthropic') {
    logger.warn({ provider: name }, 'Unknown LLM_PROVIDER — falling back to anthropic');
  }
  return anthropicProvider;
}
