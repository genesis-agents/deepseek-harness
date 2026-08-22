/**
 * Local copy of ui-conversation's Tool-root lifecycle predicate.
 *
 * Not an import: the client bundle purity gate in packages/client/tsdown.client.ts
 * rejects every `@deepseek-ai/*` VALUE import outside CLIENT_EXTERNALS, and
 * ui-conversation is not on that list — so re-exporting the original from its
 * barrel would still be a hard build error here rather than a shortcut avoided.
 * Copying one boolean beats routing a type guard through a cordis service.
 */
import type { ToolCallBlock } from '@deepseek-ai/dsh-client-runtime/client'

/**
 * Test whether a Tool root has settled.
 * @param block - Tool root lifecycle value.
 * @returns whether the root carries its final result.
 */
export function isSettledTool(block: ToolCallBlock): block is Extract<ToolCallBlock, { kind: 'tool-result' }> {
  return 'kind' in block
}
