import { WebError } from '@deepseek-ai/dsh-web'
import type { WebSearchProvider, WebSearchRequest, WebSearchResult } from '@deepseek-ai/dsh-web'

export const SERPER_PROVIDER_ID = 'serper'
export const SERPER_DEFAULT_BASE_URL = 'https://google.serper.dev/search'

type SerperOrganic = {
  link?: string
  title?: string
  snippet?: string
  date?: string
}

type SerperResponse = {
  organic?: SerperOrganic[]
}

export interface SerperSearchProviderOptions {
  apiKey: string
  baseURL: string
}

export class SerperSearchProvider implements WebSearchProvider {
  readonly id = SERPER_PROVIDER_ID

  constructor(private readonly options: SerperSearchProviderOptions) {}

  available(): boolean {
    return this.options.apiKey.trim().length > 0
  }

  async search(request: WebSearchRequest): Promise<WebSearchResult> {
    if (!this.available()) {
      throw new WebError('WEB_PROVIDER_CREDENTIAL_MISSING', 'Serper API key is not configured')
    }
    const response = await fetch(this.options.baseURL, {
      method: 'POST',
      headers: {
        'X-API-KEY': this.options.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ q: request.query }),
      redirect: 'error',
    })
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new WebError('WEB_PROVIDER_ERROR', `Serper request failed (${response.status}): ${text.slice(0, 300)}`)
    }
    const payload = await response.json() as SerperResponse
    const sources = (payload.organic ?? []).flatMap((item) => {
      if (typeof item.link !== 'string' || item.link.trim().length === 0) return []
      return [{
        url: item.link,
        ...(typeof item.title === 'string' && item.title.length > 0 ? { title: item.title } : {}),
        ...(typeof item.snippet === 'string' && item.snippet.length > 0 ? { snippet: item.snippet } : {}),
        ...(typeof item.date === 'string' && item.date.length > 0 ? { publishedAt: item.date } : {}),
      }]
    })
    return { sources, truncated: false }
  }
}
