import { describe, expect, it } from 'vitest'
import { parseEnv } from './env.ts'

describe('parseEnv', () => {
  it('fills dev defaults from an empty environment', () => {
    const env = parseEnv({})
    expect(env.NODE_ENV).toBe('development')
    expect(env.DATABASE_URL).toBe('memory://')
    expect(env.MAILER_API_KEY).toBeUndefined() // fake path
  })

  it('treats an empty string as an absent flag', () => {
    const env = parseEnv({ MAILER_API_KEY: '' })
    expect(env.MAILER_API_KEY).toBeUndefined()
  })

  it('fails fast in production when a real adapter is not configured', () => {
    expect(() =>
      parseEnv({
        NODE_ENV: 'production',
        SESSION_SECRET: 'a-very-long-session-secret-32chars!!',
      }),
    ).toThrow(/MAILER_API_KEY[\s\S]*BLOB_ENDPOINT/)
  })

  it('accepts a fully configured production environment', () => {
    const env = parseEnv({
      NODE_ENV: 'production',
      SESSION_SECRET: 'a-very-long-session-secret-32chars!!',
      MAILER_API_KEY: 'live-key',
      RENDERER_PROJECT_ID: 'proj-1',
      BLOB_ENDPOINT: 'https://blobs.example',
      BLOB_REGION: 'eu',
      BLOB_BUCKET: 'b',
      BLOB_ACCESS_KEY: 'ak',
      BLOB_SECRET_KEY: 'sk',
    })
    expect(env.NODE_ENV).toBe('production')
    expect(env.MAILER_API_KEY).toBe('live-key')
  })
})
