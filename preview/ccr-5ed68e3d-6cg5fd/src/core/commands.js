// Commands (ARCHITECTURE §6.3): every change the player or an AI makes to the world goes through
// dispatch(). A command is plain JSON, { type, ...arguments }. Its definition says whether it is
// allowed (validate returns null, or a short reason code) and what it does (apply). Applied commands
// are kept in a capped log in the state, which helps debugging and, later, delegation. The UI never
// changes the state itself; it dispatches.

export const LOG_LIMIT = 100;

/**
 * @typedef {{ type: string, [argument: string]: any }} Command
 * @typedef {{ state: any, data: import('./data.js').GameData, bus: ReturnType<typeof import('./bus.js').createBus> }} CommandContext
 * @typedef {object} CommandDefinition
 * @property {(ctx: CommandContext, command: any) => string | null} validate a reason code when the command is not allowed
 * @property {(ctx: CommandContext, command: any) => void} apply
 * @typedef {{ ok: true } | { ok: false, error: { code: string, message: string } }} CommandResult
 */

/** @param {Record<string, CommandDefinition>} definitions */
export function createCommands(definitions) {
  return {
    /** @param {string} type */
    has: (type) => Object.hasOwn(definitions, type),

    /**
     * Check and apply a command.
     * @param {CommandContext} ctx the game (state, data, bus)
     * @param {Command} command
     * @returns {CommandResult}
     */
    dispatch(ctx, command) {
      if (!command || typeof command.type !== 'string' || !Object.hasOwn(definitions, command.type)) {
        return { ok: false, error: { code: 'unknown_command', message: `Unknown command "${command?.type}"` } };
      }
      const definition = definitions[command.type];
      const problem = definition.validate(ctx, command);
      if (problem) return { ok: false, error: { code: problem, message: `${command.type} refused: ${problem}` } };
      definition.apply(ctx, command);
      const { state } = ctx;
      state.log.push({ ...command, turn: state.clock.turn });
      if (state.log.length > LOG_LIMIT) state.log.splice(0, state.log.length - LOG_LIMIT);
      ctx.bus.emit('command', command);
      return { ok: true };
    },
  };
}
