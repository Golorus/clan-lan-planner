/**
 * Slash-Befehle und Knöpfe von Modulen (z. B. /led, /spielen). Der Planner hat nur einen Interactions-Endpunkt
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
  /** Kanal, in dem der Befehl getippt wurde */
  channelId?: string
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

/** Ein Knopf (Message Component), den ein Modul selbst unter seine Nachrichten setzt */
export interface ButtonPress {
  userId: string
  customId: string
  /** Kanal und Nachricht, an der der Knopf hängt */
  channelId?: string
  messageId?: string
}

export interface DiscordButtons {
  /** custom_id beginnt mit „<prefix>:“ (z. B. sr:dabei:7); Buchstaben, höchstens 8 */
  prefix: string
  /** Antwort im Format der Discord-API, z. B. { type: 7, data: … } (Nachricht ersetzen) */
  handle: (p: ButtonPress) => unknown | Promise<unknown>
}

const buttons = new Map<string, DiscordButtons>()
/** vom Planner selbst belegt (server/utils/buttons.ts) */
const CORE_PREFIXES = ['st', 'bk', 'bkm', 'of', 'rem', 'fg', 'test', 'tsm']

/** Knöpfe eines Moduls anmelden; sie kommen über /api/discord/interactions zurück */
export function registerDiscordButtons(b: DiscordButtons) {
  if (!/^[a-z]{1,8}$/.test(b.prefix) || CORE_PREFIXES.includes(b.prefix)) throw new Error(`Ungültiges Knopf-Präfix: ${b.prefix}`)
  buttons.set(b.prefix, b)
}

export function findDiscordButtons(customId: string | undefined) {
  const prefix = /^([a-z]{1,8}):/.exec(customId ?? '')?.[1]
  return prefix ? buttons.get(prefix) : undefined
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
