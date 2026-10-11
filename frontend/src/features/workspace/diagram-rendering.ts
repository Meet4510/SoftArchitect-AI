let renderQueue: Promise<void> = Promise.resolve()

export function normalizeMermaidSource(source: string): string {
  return source.replace(
    /(\b[A-Za-z_][\w-]*)\[(?!["'(])([^\]\r\n]*\([^)\r\n]*\)[^\]\r\n]*)\]/g,
    (_match, nodeId: string, label: string) => `${nodeId}["${label.replace(/"/g, '&quot;')}"]`,
  )
}

export async function renderMermaidDiagram(id: string, source: string, htmlLabels = true): Promise<string> {
  const render = renderQueue.then(async () => {
    const { default: mermaid } = await import('mermaid')
    mermaid.initialize({
      startOnLoad: false,
      theme: 'dark',
      securityLevel: 'strict',
      htmlLabels,
      flowchart: { htmlLabels },
    })
    const result = await mermaid.render(
      id.replace(/[^a-zA-Z0-9_-]/g, ''),
      normalizeMermaidSource(source),
    )
    if (!result.svg.trim()) throw new Error('Mermaid returned an empty diagram.')
    return result.svg
  })
  renderQueue = render.then(() => undefined, () => undefined)
  return render
}
