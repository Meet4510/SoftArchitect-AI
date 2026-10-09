let renderQueue: Promise<void> = Promise.resolve()

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
    const result = await mermaid.render(id.replace(/[^a-zA-Z0-9_-]/g, ''), source)
    if (!result.svg.trim()) throw new Error('Mermaid returned an empty diagram.')
    return result.svg
  })
  renderQueue = render.then(() => undefined, () => undefined)
  return render
}
