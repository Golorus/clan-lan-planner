import { describe, expect, it } from 'vitest'
import { threadChanges } from '../server/utils/threadMembers'

const want = new Map([['1', 'Orga'], ['2', 'Kontakt Rot'], ['3', 'Anna (zugesagt)']])

describe('threadChanges', () => {
  it('holt Orga, Kontaktpersonen und Zugesagte dazu, die noch fehlen', () => {
    expect(threadChanges(want, ['1', '99'], '99', new Set()).add.map(a => a.discordId)).toEqual(['2', '3'])
  })
  it('entfernt nur Bekannte, die nicht (mehr) zugesagt haben', () => {
    const r = threadChanges(want, ['1', '2', '3', '4', '5'], '99', new Set(['4']))
    expect(r.remove).toEqual(['4'])
  })
  it('lässt den Bot und von Hand Dazugeholte in Ruhe', () => {
    expect(threadChanges(want, ['99', '7'], '99', new Set(['99'])).remove).toEqual([])
  })
  it('entfernt niemanden, der dazugehört, auch wenn er als entfernbar markiert ist', () => {
    expect(threadChanges(want, ['3'], null, new Set(['3'])).remove).toEqual([])
  })
})
