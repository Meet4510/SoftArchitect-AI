import { describe, expect, it } from 'vitest'
import { normalizeMermaidSource } from '../src/features/workspace/diagram-rendering'

describe('normalizeMermaidSource', () => {
  it('quotes unquoted node labels containing parentheses', () => {
    const source = 'graph TD\n  Web[Frontend (React)] --> Gateway[API Gateway]'

    expect(normalizeMermaidSource(source)).toBe(
      'graph TD\n  Web["Frontend (React)"] --> Gateway[API Gateway]',
    )
  })

  it('preserves quoted labels and non-label shape syntax', () => {
    const source = [
      'flowchart LR',
      '  Web["Frontend (React)"] --> Database[(MongoDB)]',
      '  User((User)) --> Web[Frontend]',
    ].join('\n')

    expect(normalizeMermaidSource(source)).toBe(source)
  })
})
