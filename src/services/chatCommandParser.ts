export type ChatCommand =
  | { type: 'helpful'; targetUsername: string }
  | { type: 'goodq'; targetUsername: string }
  | { type: 'points' }
  | { type: 'streak' }
  | { type: 'leaderboard' }
  | { type: 'refer' }

const TARGETED_COMMANDS = new Set(['helpful', 'goodq'])
const SIMPLE_COMMANDS = new Set(['points', 'streak', 'leaderboard', 'refer'])

/**
 * Parses a chat message and returns a ChatCommand if it matches a known command,
 * or null otherwise.
 *
 * Rules:
 * - Commands start with `!`
 * - Targeted commands (`!helpful`, `!goodq`) require `@username` after them
 * - Simple commands (`!points`, `!streak`, `!leaderboard`, `!refer`) take no arguments
 * - Case-insensitive
 * - Returns null for non-commands and unknown commands
 */
export function parseChatCommand(message: string): ChatCommand | null {
  const trimmed = message.trim()

  if (!trimmed.startsWith('!')) return null

  const parts = trimmed.split(/\s+/)
  const commandWord = parts[0].slice(1).toLowerCase()

  if (SIMPLE_COMMANDS.has(commandWord)) {
    return { type: commandWord } as ChatCommand
  }

  if (TARGETED_COMMANDS.has(commandWord)) {
    const target = parts[1]
    if (!target || !target.startsWith('@')) return null

    const targetUsername = target.slice(1)
    if (!targetUsername) return null

    return { type: commandWord, targetUsername } as ChatCommand
  }

  return null
}
