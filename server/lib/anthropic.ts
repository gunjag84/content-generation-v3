import Anthropic from '@anthropic-ai/sdk';

export const ANTHROPIC_MODEL = 'claude-opus-4-7';

export function makeAnthropicClient(apiKey: string): Anthropic {
  return new Anthropic({ apiKey });
}
