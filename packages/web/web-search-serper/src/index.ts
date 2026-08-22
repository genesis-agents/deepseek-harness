import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import type {} from '@deepseek-ai/dsh-web'
import { SerperSearchProvider, SERPER_DEFAULT_BASE_URL } from './provider.ts'

export { SerperSearchProvider, SERPER_DEFAULT_BASE_URL, SERPER_PROVIDER_ID } from './provider.ts'
export type { SerperSearchProviderOptions } from './provider.ts'

export const name = 'web-search-serper'
export const inject = ['web']
const DEFAULT_API_KEY_ENV = 'SERPER_API_KEY'

export interface Config {
  apiKey?: string
  apiKeyEnv?: string
  baseURL?: string
}

export const Config: z<Config> = z.object({
  apiKey: z.string(),
  apiKeyEnv: z.string().default(DEFAULT_API_KEY_ENV),
  baseURL: z.string(),
})

export function apply(ctx: Context, config: Config): void {
  const apiKey = config.apiKey ?? launchEnvironmentOf(ctx).get(config.apiKeyEnv ?? DEFAULT_API_KEY_ENV)?.value ?? ''
  ctx.web.registerSearchProvider(new SerperSearchProvider({
    apiKey,
    baseURL: config.baseURL ?? SERPER_DEFAULT_BASE_URL,
  }))
}
