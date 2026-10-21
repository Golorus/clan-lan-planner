/**
 * Slash-Befehle von Modulen (z. B. /led im CaGGtus-Planner). Der Planner hat nur einen Interactions-Endpunkt
 * (/api/discord/interactions); Module hängen ihre Befehle hier an, meist in einem Nitro-Plugin:
 *
 *   export default defineNitroPlugin(() => registerDiscordCommand({ name: 'led', description: '…', handle }))
 *
 * Angemeldet werden die Befehle in /orga › Discord („Befehle bei Discord anmelden“), nur auf unserem Server.
 */

/** Ein Wert aus den Optionen eines Befehls, Unterbefehle sind verschachtelt */
export interface CommandOption {
  name: string
  type: number
  value?: string | number | boolean
  focused?: boolean
  options?: CommandOption[]
}

export interface CommandInteraction {
  /** 2 = Befehl ausgeführt, 4 = Autovervollständigung */
  type: number
  userId: string
  data: { name: string, options?: CommandOption[] }
}

export interface DiscordCommand {
  name: string
  description: string
  /** Optionen im Format der Discord-API (application command options) */
  options?: unknown[]
  /** Antwort im Format der Discord-API (interaction response), z. B. commandReply('…') */
  handle: (it: CommandInteraction) => unknown | Promise<unknown>
}

const commands = new Map<string, DiscordCommand>()

export function registerDiscordCommand(cmd: DiscordCommand) {
  if (!/^[\da-z_-]{1,32}$/.test(cmd.name)) throw new Error(`Ungültiger Befehlsname: ${cmd.name}`)
  commands.set(cmd.name, cmd)
}

export function findDiscordCommand(name: string | undefined) {
  return name ? commands.get(name) : undefined
}

export function listDiscordCommands() {
  return [...commands.values()]
}

/** Antwort, die nur der Aufrufer sieht */
export const commandReply = (text: string) => ({ type: 4, data: { content: text.slice(0, 2000), flags: 64 } })

/** Vorschläge für die Autovervollständigung (höchstens 25, so viele zeigt Discord) */
export const commandChoices = (choices: { name: string, value: string | number }[]) =>
  ({ type: 8, data: { choices: choices.slice(0, 25).map(c => ({ name: c.name.slice(0, 100), value: c.value })) } })

/** Unterbefehl und seine Werte als flache Liste: /led hell wert:60 → { sub: 'hell', values: { wert: 60 }, focused: … } */
export function commandArgs(data: CommandInteraction['data']) {
  let opts = data.options ?? []
  let sub: string | null = null
  if (opts.length === 1 && (opts[0]!.type === 1 || opts[0]!.type === 2)) {
    sub = opts[0]!.name
    opts = opts[0]!.options ?? []
  }
  const values: Record<string, string | number | boolean> = {}
  let focused: string | null = null
  for (const o of opts) {
    if (o.value !== undefined) values[o.name] = o.value
    if (o.focused) focused = o.name
  }
  return { sub, values, focused }
}
