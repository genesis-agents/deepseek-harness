# @deepseek-ai/dsh-web-search-serper

Serper-backed `WebSearchProvider` for the Harness `ctx.web` seam.

## Configuration

```yaml
- id: web
  name: '@deepseek-ai/dsh-web'
  config:
    searchProvider: serper

- id: web-search-serper
  name: '@deepseek-ai/dsh-web-search-serper'
  config:
    apiKeyEnv: SERPER_API_KEY
```

The provider reads the key from `SERPER_API_KEY` and sends queries to
`https://google.serper.dev/search`.
