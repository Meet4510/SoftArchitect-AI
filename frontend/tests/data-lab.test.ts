import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import {
  addDataLabRelationship,
  dataLabCsv,
  dataLabCsvZip,
  dataLabJson,
  dataLabMongoJson,
  dataLabMongoJsonZip,
  dataLabSchemaJson,
  generateDataLabRecords,
  parseCsvCollection,
  parseDataLabJson,
} from '../src/services/data-lab'

describe('standalone synthetic data lab', () => {
  it('imports SoftArchitect MongoDB designs and JSON Schema collections', () => {
    const design = parseDataLabJson({
      database_design: {
        database_name: 'project_db',
        collections: [{
          name: 'users',
          primary_key: '_id',
          fields: [
            { name: '_id', bson_type: 'ObjectId', required: true },
            { name: 'email', bson_type: 'string', required: true },
          ],
          foreign_keys: [],
        }],
      },
    })
    expect(design.name).toBe('project_db')
    expect(design.collections[0].fields.map((field) => field.type)).toEqual(['objectId', 'string'])

    const nestedReference = parseDataLabJson({
      collections: [{
        name: 'orders',
        primary_key: '_id',
        fields: [
          { name: '_id', bson_type: 'ObjectId' },
          { name: 'items', bson_type: 'array<object>' },
        ],
        foreign_keys: [{
          field: 'items.product_id',
          references_collection: 'products',
          references_field: '_id',
        }],
      }, {
        name: 'products',
        primary_key: '_id',
        fields: [{ name: '_id', bson_type: 'ObjectId' }],
        foreign_keys: [],
      }],
    })
    expect(nestedReference.collections[0].foreign_keys).toEqual([])
    expect(nestedReference.warnings).toContain(
      'orders.items.product_id is nested; nested references are not generated automatically.',
    )

    const jsonSchema = parseDataLabJson({
      $defs: {
        tasks: {
          type: 'object',
          required: ['title', 'completed'],
          properties: {
            title: { type: 'string' },
            completed: { type: 'boolean' },
          },
        },
      },
    })
    expect(jsonSchema.collections[0].name).toBe('tasks')
    expect(jsonSchema.collections[0].fields).toEqual([
      { name: '_id', type: 'objectId', required: true },
      { name: 'title', type: 'string', required: true },
      { name: 'completed', type: 'boolean', required: true },
    ])
  })

  it('imports MongoDB schema exports with a collection namespace map and BSON types', () => {
    const exportedSchema = parseDataLabJson({
      collections: {
        'softarchitect_ai.users': {
          ns: 'softarchitect_ai.users',
          jsonSchema: {
            bsonType: 'object',
            required: ['_id', 'email', 'active', 'created_at'],
            properties: {
              _id: { bsonType: 'objectId' },
              email: { bsonType: 'string' },
              active: { bsonType: 'bool' },
              created_at: { bsonType: 'date' },
              roles: { bsonType: 'array', items: { bsonType: 'string' } },
            },
          },
        },
        'softarchitect_ai.agent_runs': {
          ns: 'softarchitect_ai.agent_runs',
          jsonSchema: { bsonType: 'object', properties: {} },
        },
      },
    })

    expect(exportedSchema.name).toBe('softarchitect_ai')
    expect(exportedSchema.collections.map((collection) => collection.name)).toEqual(['users', 'agent_runs'])
    expect(exportedSchema.collections[0].fields.map((field) => [field.name, field.type, field.required])).toEqual([
      ['_id', 'objectId', true],
      ['email', 'string', true],
      ['active', 'boolean', true],
      ['created_at', 'date', true],
      ['roles', 'array', false],
    ])
    expect(exportedSchema.collections[1].fields).toEqual([
      { name: '_id', type: 'objectId', required: true },
    ])
  })

  it('imports ordinary JSON records and the Data Lab JSON export format', () => {
    const records = parseDataLabJson([
      { _id: '64abcdef0123456789abcdef', name: 'Alice', age: 29, active: true },
      { _id: '64abcdef0123456789abcdee', name: 'Bob', age: 34, active: false },
    ], 'users')
    expect(records.collections[0].name).toBe('users')
    expect(records.collections[0].fields.map((field) => field.type)).toEqual([
      'objectId', 'string', 'integer', 'boolean',
    ])

    const savedExport = {
      name: 'previous-export',
      created_at: '2026-10-10T00:00:00.000Z',
      records_by_collection: { users: 2, tasks: 1 },
      collections: [
        { name: 'users', records: [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }] },
        { name: 'tasks', records: [{ id: 1, user_id: 2, title: 'Private sample title' }] },
      ],
    }
    const importedExport = parseDataLabJson(savedExport)
    expect(importedExport.name).toBe('previous-export')
    expect(importedExport.collections.map((collection) => collection.name)).toEqual(['users', 'tasks'])
    expect(importedExport.collections[1].fields.map((field) => field.name)).toEqual(['id', 'user_id', 'title'])

    const generated = generateDataLabRecords(importedExport, { users: 2, tasks: 1 })
    expect(JSON.stringify(generated)).not.toContain('Private sample title')
  })

  it('preserves foreign-key values from JSON samples when generating records', () => {
    const schema = parseDataLabJson([
      { _id: '64abcdef0123456789abcdef', user_id: '6ac7e95113465eaf82bd128e', name: 'Original A' },
      { _id: '64abcdef0123456789abcdee', user_id: '6ac7e95113465eaf82bd128e', name: 'Original B' },
      { _id: '64abcdef0123456789abcded', user_id: '6ac7ef97cf5244daa06fa11c', name: 'Original C' },
    ], 'projects')

    expect(schema.preserved_references).toEqual(['projects.user_id'])
    expect(schema.collections[0].fields.find((field) => field.name === 'user_id')?.reference_values).toEqual([
      '6ac7e95113465eaf82bd128e',
      '6ac7ef97cf5244daa06fa11c',
    ])
    const records = generateDataLabRecords(schema, { projects: 8 }).collections[0].records

    expect(new Set(records.map((record) => record.user_id))).toEqual(new Set([
      '6ac7e95113465eaf82bd128e',
      '6ac7ef97cf5244daa06fa11c',
    ]))
    expect(records.every((record) => record.user_id === '6ac7e95113465eaf82bd128e'
      || record.user_id === '6ac7ef97cf5244daa06fa11c')).toBe(true)
    expect(records[0]._id).not.toBe('64abcdef0123456789abcdef')
  })

  it('preserves ObjectId-typed foreign-key samples in MongoDB Extended JSON', () => {
    const schema = parseDataLabJson([
      { _id: { $oid: '64abcdef0123456789abcdef' }, user_id: { $oid: '6ac7e95113465eaf82bd128e' } },
      { _id: { $oid: '64abcdef0123456789abcdee' }, user_id: { $oid: '6ac7ef97cf5244daa06fa11c' } },
    ], 'projects')
    const generated = generateDataLabRecords(schema, { projects: 2 })
    const extended = JSON.parse(dataLabMongoJson(generated.collections[0], schema))

    expect(schema.collections[0].fields.find((field) => field.name === 'user_id')?.type).toBe('objectId')
    expect(extended.map((record: { user_id: { $oid: string } }) => record.user_id.$oid)).toEqual([
      '6ac7e95113465eaf82bd128e',
      '6ac7ef97cf5244daa06fa11c',
    ])
  })

  it('infers editable CSV fields and handles quoted commas', () => {
    const collection = parseCsvCollection('customers', '\uFEFFid,name,email,age,active\r\n1,"Doe, Jane",jane@example.test,34,true\r\n2,Sam,sam@example.test,29,false')

    expect(collection.primary_key).toBe('id')
    expect(collection.fields.map((field) => field.type)).toEqual([
      'integer', 'string', 'string', 'integer', 'boolean',
    ])
    expect(collection.fields.find((field) => field.name === 'email')?.required).toBe(true)
    expect(() => parseCsvCollection('invalid', 'a,b\n1,2,3')).toThrow(
      'more values than header columns',
    )

    const schema = parseDataLabJson({
      type: 'object',
      title: 'quoted',
      properties: { value: { type: 'string' } },
    })
    expect(schema.collections).toHaveLength(1)
  })

  it('generates related foreign keys and exports JSON and collection CSV', () => {
    const parent = parseCsvCollection('users', 'id,name\n1,Ada\n2,Lin')
    const child = parseCsvCollection('tasks', 'id,title\n1,Review\n2,Build')
    const schema = addDataLabRelationship(
      { name: 'workspace', collections: [parent, child] },
      'tasks',
      'users',
      'user_id',
    )
    const result = generateDataLabRecords(schema, { users: 2, tasks: 4 })
    const ids = new Set(result.collections[0].records.map((record) => record.id))

    expect(result.collections[1].records.every((record) => ids.has(record.user_id))).toBe(true)
    expect(result.collections[0].records.map((record) => record.id)).toEqual([1, 2])
    expect(schema.collections[1].fields.find((field) => field.name === 'user_id')?.type).toBe('integer')
    expect(JSON.parse(dataLabJson(result)).collections).toHaveLength(2)
    expect(dataLabCsv(result.collections[1])).toContain('"user_id"')
    expect(dataLabCsv(result.collections[1])).toContain('"title_1"')
  })

  it('downloads one CSV per collection in a ZIP archive', async () => {
    const users = parseCsvCollection('users', 'id,name\n1,Ada')
    const tasks = parseCsvCollection('tasks', 'id,title\n1,Review')
    const result = generateDataLabRecords(
      { name: 'workspace', collections: [users, tasks] },
      { users: 2, tasks: 3 },
    )

    const archive = await JSZip.loadAsync(await dataLabCsvZip(result))

    expect(Object.keys(archive.files)).toEqual(['01-users.csv', '02-tasks.csv'])
    expect(await archive.file('01-users.csv')?.async('string')).toContain('"name"')
    expect(await archive.file('02-tasks.csv')?.async('string')).toContain('"title"')
    const sanitizedArchive = await JSZip.loadAsync(await dataLabCsvZip({
      ...result,
      collections: [{ ...result.collections[0], name: 'bad/name' }],
    }))
    expect(Object.keys(sanitizedArchive.files)).toEqual(['01-bad_name.csv'])
  })

  it('exports MongoDB Extended JSON ObjectIds with matching foreign-key references', async () => {
    const schema = addDataLabRelationship({
      name: 'school',
      collections: [
        {
          name: 'students',
          primary_key: '_id',
          fields: [
            { name: '_id', type: 'objectId', required: true },
            { name: 'name', type: 'string', required: true },
          ],
          foreign_keys: [],
        },
        {
          name: 'courses',
          primary_key: '_id',
          fields: [
            { name: '_id', type: 'objectId', required: true },
            { name: 'title', type: 'string', required: true },
          ],
          foreign_keys: [],
        },
      ],
    }, 'courses', 'students', 'student_id')
    const result = generateDataLabRecords(schema, { students: 2, courses: 3 })
    const studentsJson = JSON.parse(dataLabMongoJson(result.collections[0], schema))
    const coursesJson = JSON.parse(dataLabMongoJson(result.collections[1], schema))
    const studentIds = new Set(studentsJson.map((student: { _id: { $oid: string } }) => student._id.$oid))

    expect(studentsJson[0]._id.$oid).toMatch(/^[a-f\d]{24}$/i)
    expect(coursesJson[0]._id).toHaveProperty('$oid')
    expect(coursesJson[0].student_id).toHaveProperty('$oid')
    expect(studentIds.has(coursesJson[0].student_id.$oid)).toBe(true)
    expect(studentIds.has(coursesJson[1].student_id.$oid)).toBe(true)

    const archive = await JSZip.loadAsync(await dataLabMongoJsonZip(result, schema))
    expect(Object.keys(archive.files)).toEqual(['01-students.json', '02-courses.json'])
    expect(JSON.parse(await archive.file('02-courses.json')?.async('string') ?? '[]')[0].student_id).toHaveProperty('$oid')
  })

  it('generates plausible synthetic people names instead of placeholder labels', () => {
    const schema = parseDataLabJson({
      database_name: 'school',
      collections: [{
        name: 'collection_1',
        primary_key: 'stdprn',
        fields: [
          { name: 'stdprn', bson_type: 'string', required: true },
          { name: 'std_name', bson_type: 'string', required: true },
          { name: 'first_name', bson_type: 'string', required: true },
          { name: 'lastName', bson_type: 'string', required: true },
        ],
        foreign_keys: [],
      }],
    })
    const { records } = generateDataLabRecords(schema, { collection_1: 10 }).collections[0]

    expect(records[0].std_name).toBe('Aarav Anderson')
    expect(records[0].first_name).toBe('Aarav')
    expect(records[0].lastName).toBe('Anderson')
    expect(new Set(records.map((record) => record.std_name)).size).toBe(10)
    expect(records.every((record) => !String(record.std_name).startsWith('Sample '))).toBe(true)
  })

  it('exports a custom database design that can be imported again', () => {
    const schema = addDataLabRelationship({
      name: 'shop_db',
      collections: [
        {
          name: 'customers',
          primary_key: '_id',
          fields: [
            { name: '_id', type: 'objectId', required: true },
            { name: 'email', type: 'string', required: true },
          ],
          foreign_keys: [],
        },
        {
          name: 'orders',
          primary_key: 'order_number',
          fields: [
            { name: 'order_number', type: 'integer', required: true },
            { name: 'total', type: 'number', required: true },
          ],
          foreign_keys: [],
        },
      ],
    }, 'orders', 'customers', 'customer_id')

    const exported = JSON.parse(dataLabSchemaJson(schema))
    const imported = parseDataLabJson(exported)

    expect(imported).toEqual(schema)
  })

  it('rejects invalid schemas and oversized record requests', () => {
    expect(() => parseDataLabJson({ collections: [{ name: 'invalid', fields: [] }] })).toThrow(
      'must have unique fields and at least one field',
    )
    const collections = Array.from({ length: 11 }, (_, index) => parseCsvCollection(
      `items_${index}`,
      'name\none',
    ))
    const counts = Object.fromEntries(collections.map((collection) => [collection.name, 500]))
    expect(() => generateDataLabRecords({ name: 'large', collections }, counts)).toThrow(
      'at or below 5,000',
    )
  })
})
