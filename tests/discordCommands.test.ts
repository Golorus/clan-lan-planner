import { describe, expect, it } from 'vitest'
import { commandArgs, commandChoices, commandReply, findDiscordCommand, listDiscordCommands, registerDiscordCommand } from '../server/utils/discordCommands'

describe('Slash-Befehle der Module', () => {
  it('registriert und findet Befehle', () => {
    registerDiscordCommand({ name: 'led', description: 'LEDs', handle: () => commandReply('ok') })
    expect(findDiscordCommand('led')?.description).toBe('LEDs')
    expect(findDiscordCommand('gibtsnicht')).toBeUndefined()
    expect(findDiscordCommand(undefined)).toBeUndefined()
    expect(listDiscordCommands().map(c => c.name)).toContain('led')
  })

  it('lehnt Namen ab, die Discord nicht annimmt', () => {
    expect(() => registerDiscordCommand({ name: 'LED Steuerung', description: 'x', handle: () => null })).toThrow()
  })

  it('liest Unterbefehl und Werte', () => {
    expect(commandArgs({ name: 'led', options: [{ name: 'hell', type: 1, options: [{ name: 'wert', type: 4, value: 60 }] }] }))
      .toEqual({ sub: 'hell', values: { wert: 60 }, focused: null })
    expect(commandArgs({ name: 'led', options: [{ name: 'preset', type: 1, options: [{ name: 'name', type: 3, value: 'Lo', focused: true }] }] }).focused).toBe('name')
    expect(commandArgs({ name: 'led' })).toEqual({ sub: null, values: {}, focused: null })
  })

  it('baut Antworten im Discord-Format', () => {
    expect(commandReply('hi')).toEqual({ type: 4, data: { content: 'hi', flags: 64 } })
    const many = Array.from({ length: 30 }, (_, i) => ({ name: `P${i}`, value: i }))
    expect(commandChoices(many).data.choices).toHaveLength(25)
  })
})
