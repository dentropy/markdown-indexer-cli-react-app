import { describe, expect, it } from 'vitest'
import { injectVaultConfig, vaultConfigFromEnv } from '../server.mjs'

const page = '<!DOCTYPE html><html><head><title>Vault</title></head><body></body></html>'

describe('vault config injection', () => {
  it('reads the compose names and falls back to Vite names', () => {
    expect(vaultConfigFromEnv({
      POSTHOG_PROJECT_TOKEN: 'phc_compose',
      VITE_POSTHOG_PROJECT_TOKEN: 'phc_vite',
      VITE_POSTHOG_HOST: 'https://eu.i.posthog.com',
      HOME_DOCUMENT_ID: '  abc  ',
    })).toEqual({
      posthogToken: 'phc_compose',
      posthogHost: 'https://eu.i.posthog.com',
      homeDocumentId: 'abc',
    })
  })

  it('injects the config once and keeps a script break out of the page', () => {
    const env = {
      POSTHOG_PROJECT_TOKEN: '</script><script>alert(1)',
      POSTHOG_HOST: 'https://us.i.posthog.com',
      HOME_DOCUMENT_ID: '123e4567-e89b-12d3-a456-426614174000',
    }
    const html = injectVaultConfig(page, env)
    expect(html.indexOf('window.__VAULT__')).toBeLessThan(html.indexOf('</head>'))
    expect(html).not.toContain('</script><script>')
    expect(html.match(/window\.__VAULT__/g)).toHaveLength(1)
    expect(injectVaultConfig(html, env)).toBe(html)
    const config = JSON.parse(html.match(/window\.__VAULT__=(.+)<\/script>/)[1])
    expect(config.posthogToken).toBe('</script><script>alert(1)')
    expect(config.homeDocumentId).toBe('123e4567-e89b-12d3-a456-426614174000')
  })
})
