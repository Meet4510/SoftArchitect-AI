import {
  AlignmentType,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from 'docx'
import { renderMermaidDiagram } from './diagram-rendering'

export type WordDiagram = {
  title: string
  source: string
}

export function parseMarkdown(markdown: string): (Paragraph | Table)[] {
  const paragraphs: (Paragraph | Table)[] = []
  let inCodeBlock = false
  const codeLines: string[] = []

  const addCodeBlock = () => {
    if (!codeLines.length) return
    paragraphs.push(
      new Paragraph({
        children: [new TextRun({ text: codeLines.join('\n'), font: 'Consolas', size: 18 })],
        spacing: { before: 100, after: 180 },
      }),
    )
    codeLines.length = 0
  }

  const lines = markdown.split(/\r?\n/)
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (
      line.trimStart().startsWith('|')
      && index + 1 < lines.length
      && isMarkdownTableSeparator(lines[index + 1])
    ) {
      const rows = [splitMarkdownTableRow(line)]
      index += 2
      while (index < lines.length && lines[index].trimStart().startsWith('|')) {
        rows.push(splitMarkdownTableRow(lines[index]))
        index += 1
      }
      index -= 1
      paragraphs.push(createWordTable(rows))
      continue
    }
    if (line.trimStart().startsWith('```')) {
      if (inCodeBlock) addCodeBlock()
      inCodeBlock = !inCodeBlock
      continue
    }
    if (inCodeBlock) {
      codeLines.push(line)
      continue
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line)
    if (heading) {
      const level = heading[1].length
      paragraphs.push(new Paragraph({
        text: cleanInlineMarkdown(heading[2]),
        heading: level === 1 ? HeadingLevel.HEADING_1 : level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3,
        spacing: { before: 240, after: 100 },
      }))
      continue
    }
    if (!line.trim()) continue
    const bullet = /^\s*[-*]\s+(.+)$/.exec(line)
    if (bullet) {
      paragraphs.push(new Paragraph({
        text: cleanInlineMarkdown(bullet[1]),
        bullet: { level: 0 },
        indent: { left: 360 },
        spacing: { after: 60 },
      }))
      continue
    }
    if (line.trimStart().startsWith('>')) {
      paragraphs.push(new Paragraph({
        children: [new TextRun({ text: cleanInlineMarkdown(line.trim().replace(/^>\s*/, '')), italics: true })],
        spacing: { after: 140 },
      }))
      continue
    }
    paragraphs.push(new Paragraph({
      text: cleanInlineMarkdown(line),
      spacing: { after: 120 },
    }))
  }
  if (inCodeBlock) addCodeBlock()
  return paragraphs
}

function isMarkdownTableSeparator(line: string): boolean {
  return /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line)
}

function splitMarkdownTableRow(line: string): string[] {
  const cells: string[] = []
  let cell = ''
  let escaped = false
  const content = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  for (const character of content) {
    if (character === '|' && !escaped) {
      cells.push(cell.trim().replace(/\\\|/g, '|'))
      cell = ''
    } else {
      cell += character
    }
    escaped = character === '\\' && !escaped
    if (character !== '\\') escaped = false
  }
  cells.push(cell.trim().replace(/\\\|/g, '|'))
  return cells
}

function createWordTable(rows: string[][]): Table {
  const columnCount = Math.max(...rows.map((row) => row.length))
  const columnWidth = Math.floor(100 / columnCount)
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: Array.from({ length: columnCount }, () => columnWidth),
    rows: rows.map(
      (row, rowIndex) =>
        new TableRow({
          children: Array.from({ length: columnCount }, (_, columnIndex) => {
            const isHeader = rowIndex === 0
            const text = cleanInlineMarkdown(row[columnIndex] ?? '')
            return new TableCell({
              width: { size: columnWidth, type: WidthType.PERCENTAGE },
              verticalAlign: VerticalAlign.CENTER,
              margins: { top: 70, bottom: 70, left: 70, right: 70 },
              shading: isHeader
                ? { type: ShadingType.CLEAR, fill: 'DCEAF2' }
                : undefined,
              children: [
                new Paragraph({
                  children: [new TextRun({
                    text,
                    bold: isHeader,
                    size: 16,
                  })],
                  spacing: { before: 0, after: 0 },
                }),
              ],
            })
          }),
        }),
    ),
  })
}

function cleanInlineMarkdown(text: string): string {
  return text
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
}

async function svgToPng(svg: string): Promise<{ data: Uint8Array; width: number; height: number }> {
  const parsed = new DOMParser().parseFromString(svg, 'image/svg+xml')
  if (parsed.querySelector('parsererror')) throw new Error('A generated diagram could not be prepared for Word export.')
  const root = parsed.documentElement
  const viewBox = root.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number)
  const widthAttribute = Number.parseFloat(root.getAttribute('width') ?? '')
  const heightAttribute = Number.parseFloat(root.getAttribute('height') ?? '')
  const sourceWidth = viewBox?.length === 4 && viewBox[2] > 0 ? viewBox[2] : widthAttribute || 1200
  const sourceHeight = viewBox?.length === 4 && viewBox[3] > 0 ? viewBox[3] : heightAttribute || 700
  const width = Math.min(1600, Math.max(500, Math.round(sourceWidth * Math.min(1, 1600 / sourceWidth))))
  const height = Math.max(250, Math.round(width * sourceHeight / sourceWidth))
  root.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  root.setAttribute('width', String(width))
  root.setAttribute('height', String(height))
  const svgBlob = new Blob([new XMLSerializer().serializeToString(root)], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(svgBlob)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error('A generated diagram could not be rasterized for Word export.'))
      element.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('The browser cannot prepare diagrams for Word export.')
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, width, height)
    context.drawImage(image, 0, 0, width, height)
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => result ? resolve(result) : reject(new Error('A generated diagram could not be encoded for Word export.')), 'image/png')
    })
    return { data: new Uint8Array(await blob.arrayBuffer()), width, height }
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function downloadTechnicalBlueprintWord(
  markdown: string,
  diagrams: WordDiagram[],
  filename: string,
): Promise<void> {
  if (!diagrams.length) throw new Error('Generate the project diagrams before exporting the Word document.')
  const children = parseMarkdown(markdown)
  children.push(new Paragraph({ text: 'Architecture and UML diagrams', heading: HeadingLevel.HEADING_1, pageBreakBefore: true }))

  for (const [index, diagram] of diagrams.entries()) {
    children.push(new Paragraph({
      text: diagram.title,
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 240, after: 120 },
    }))
    try {
      const svg = await renderMermaidDiagram(`word-export-${index}`, diagram.source, false)
      const image = await svgToPng(svg)
      const maxWidth = 600
      const maxHeight = 650
      const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1)
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new ImageRun({
            data: image.data,
            type: 'png',
            transformation: {
              width: Math.round(image.width * scale),
              height: Math.round(image.height * scale),
            },
          })],
          spacing: { after: 240 },
        }),
      )
    } catch {
      children.push(
        new Paragraph({
          children: [new TextRun({
            text: 'This diagram could not be rendered, so its Mermaid source is included for review.',
            italics: true,
          })],
          spacing: { after: 100 },
        }),
        new Paragraph({
          children: [new TextRun({
            text: diagram.source,
            font: 'Consolas',
            size: 18,
          })],
          spacing: { after: 180 },
        }),
      )
    }
  }

  const document = new Document({
    creator: 'SoftArchitect AI',
    title: 'Technical Blueprint',
    description: 'Project technical blueprint and generated architecture diagrams',
    sections: [{ properties: {}, children }],
  })
  const blob = await Packer.toBlob(document)
  const url = URL.createObjectURL(blob)
  try {
    const anchor = window.document.createElement('a')
    anchor.href = url
    anchor.download = filename
    window.document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }
}
