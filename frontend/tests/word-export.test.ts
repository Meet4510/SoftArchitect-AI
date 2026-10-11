import { describe, expect, it } from 'vitest'
import { Table } from 'docx'
import { parseMarkdown } from '../src/features/workspace/word-export'

describe('Word Markdown export', () => {
  it('renders Markdown database schema rows as a Word table', () => {
    const blocks = parseMarkdown([
      '## Data design',
      '',
      '### `users` collection',
      '',
      '| Field | BSON type | Required | Description |',
      '|---|---|:---:|---|',
      '| `_id` | `ObjectId` | Yes | MongoDB document primary key. |',
      '| `email` | `string` | Yes | Normalized unique sign-in address. |',
      '',
      'Following paragraph.',
    ].join('\n'))

    expect(blocks.filter((block) => block instanceof Table)).toHaveLength(1)
    expect(blocks.at(-1)).not.toBeInstanceOf(Table)
    const table = blocks.find((block) => block instanceof Table)
    if (!(table instanceof Table)) throw new Error('Expected a Word table')
    expect(table.rows).toHaveLength(3)
    expect(table.rows[0].cells).toHaveLength(4)
  })
})
