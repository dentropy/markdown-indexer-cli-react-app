import { describe, expect, it } from 'vitest'
import { indexDocuments } from './catalog.js'
import { classifyEmbed, extractSection, hasScheme, splitVaultText } from './markdown.js'

const catalog = indexDocuments({
  documents: [
    { title: 'Other', uuid: 'other-id', path: 'notes/other-note.md' },
  ],
})

describe('schemes', () => {
  it('follows the CommonMark autolink rule', () => {
    expect(hasScheme('https://example.com/a.png')).toBe(true)
    expect(hasScheme('mailto:ada@example.com')).toBe(true)
    expect(hasScheme('ipfs://cid')).toBe(true)
    expect(hasScheme('https://example.com/a b')).toBe(true)
    expect(hasScheme('www.example.com')).toBe(false)
    expect(hasScheme('C:/Users/x')).toBe(false)
    expect(hasScheme('Design: the indexer')).toBe(false)
  })
})

describe('embeds and wikilinks', () => {
  it('resolves document embeds, including a trailing .md, and leaves asset misses', () => {
    expect(classifyEmbed('other-note', catalog)).toEqual({ type: 'doc', uuid: 'other-id' })
    expect(classifyEmbed('other-note.MD', catalog)).toEqual({ type: 'doc', uuid: 'other-id' })
    expect(classifyEmbed('gone.png', catalog)).toEqual({ type: 'asset' })
    expect(classifyEmbed('https://example.com/a.png', catalog).type).toBe('external')
  })

  it('turns a published body into links, embeds, and plain misses', () => {
    const nodes = splitVaultText(
      'See [[other-note#Setup|the setup]], [[other-note.md]], [[missing]], [[https://example.com/x|example]], ![[other-note]], and ![[gone.png|pic]].',
      catalog,
    )
    const link = nodes.find((n) => n.type === 'link' && n.children[0].value === 'the setup')
    expect(link.url).toBe('/other-id/#setup')
    expect(nodes.some((n) => n.type === 'text' && n.value === 'other-note.md')).toBe(true)
    expect(nodes.some((n) => n.type === 'text' && n.value === 'missing')).toBe(true)
    const external = nodes.find((n) => n.type === 'link' && n.url === 'https://example.com/x')
    expect(external.children[0].value).toBe('example')
    const embed = nodes.find((n) => n.type === 'wikiEmbed')
    expect(embed.data.hProperties.uuid).toBe('other-id')
    expect(nodes.some((n) => n.type === 'text' && n.value === 'pic')).toBe(true)
  })

  it('extracts a heading section', () => {
    const body = '## Setup\n\nRun the installer.\n\n## Next\n\nLater.\n'
    const section = extractSection(body, 'Setup')
    expect(section).toContain('Run the installer')
    expect(section).not.toContain('Later')
  })
})
