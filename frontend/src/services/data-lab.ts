import JSZip from 'jszip'

export type DataLabFieldType = 'string' | 'integer' | 'number' | 'boolean' | 'date' | 'objectId' | 'object' | 'array'

export type DataLabForeignKey = {
  field: string
  references_collection: string
  references_field: string
}

export type DataLabCollection = {
  name: string
  primary_key: string
  fields: {
    name: string
    type: DataLabFieldType
    required: boolean
    enum?: string[]
    reference_values?: (string | number | boolean)[]
  }[]
  foreign_keys: DataLabForeignKey[]
}

export type DataLabSchema = {
  name: string
  collections: DataLabCollection[]
  warnings?: string[]
  preserved_references?: string[]
}

export type DataLabResult = {
  name: string
  created_at: string
  records_by_collection: Record<string, number>
  collections: { name: string; records: Record<string, unknown>[] }[]
}

const supportedTypes = new Set<DataLabFieldType>([
  'string', 'integer', 'number', 'boolean', 'date', 'objectId', 'object', 'array',
])
const syntheticFirstNames = [
  'Aarav', 'Aanya', 'Alex', 'Amara', 'Arjun', 'Ava', 'Dev', 'Isha', 'Jordan', 'Maya', 'Noah', 'Zoya',
]
const syntheticLastNames = [
  'Anderson', 'Bennett', 'Chen', 'Das', 'Garcia', 'Kapoor', 'Kim', 'Morgan', 'Patel', 'Rivera', 'Shah', 'Wilson',
]

export function parseDataLabJson(value: unknown, fallbackName = 'Imported design'): DataLabSchema {
  if (Array.isArray(value)) {
    return schemaFromJsonRecords(fallbackName, [{ name: fallbackName, records: value }])
  }
  if (!isRecord(value)) throw new Error('The JSON file must contain an object or an array of records.')
  const design = isRecord(value.database_design) ? value.database_design : value
  if (Array.isArray(design.collections)) {
    if (design.collections.every((item) => isRecord(item) && Array.isArray(item.fields))) {
      return parseSoftArchitectDesign(design, fallbackName)
    }
    if (design.collections.every((item) => isRecord(item) && Array.isArray(item.records))) {
      return schemaFromJsonRecords(
        typeof design.name === 'string' ? design.name : fallbackName,
        design.collections.map((item) => ({
          name: isRecord(item) && typeof item.name === 'string' ? item.name : '',
          records: isRecord(item) ? item.records : [],
        })),
      )
    }
    throw new Error('Each collection must contain either schema fields or sample records.')
  }

  if (isRecord(design.collections)) {
    const entries = Object.entries(design.collections)
    if (!entries.length) {
      throw new Error('MongoDB schema exports must contain collections with jsonSchema objects.')
    }
    const collections = entries.map(([namespace, item]) => {
      if (!isRecord(item) || !isRecord(item.jsonSchema)) {
        throw new Error(`MongoDB collection "${namespace}" must contain a jsonSchema object.`)
      }
      const collectionName = namespace.split('.').pop() || namespace
      return jsonSchemaCollection(collectionName, item.jsonSchema)
    })
    const databaseName = entries
      .map(([, item]) => isRecord(item) && typeof item.ns === 'string' ? item.ns.split('.')[0] : '')
      .find(Boolean)
    return validateDataLabSchema({
      name: databaseName || fallbackName,
      collections,
    })
  }

  if (isRecord(design.dataset) && Array.isArray(design.dataset.collections)) {
    return parseDataLabJson(design.dataset, fallbackName)
  }
  if (Array.isArray(design.data)) {
    return schemaFromJsonRecords(
      typeof design.name === 'string' ? design.name : fallbackName,
      [{ name: fallbackName, records: design.data }],
    )
  }
  const namedRecordCollections = Object.entries(design)
    .filter(([, records]) => Array.isArray(records) && records.every(isRecord))
  if (namedRecordCollections.length) {
    return schemaFromJsonRecords(
      typeof design.name === 'string' ? design.name : fallbackName,
      namedRecordCollections.map(([name, records]) => ({ name, records })),
    )
  }

  const root = design
  const definitions = isRecord(root.$defs) ? root.$defs : isRecord(root.definitions) ? root.definitions : null
  if (definitions) {
    const collections = Object.entries(definitions).map(([name, definition]) => jsonSchemaCollection(name, definition))
    return validateDataLabSchema({ name: fallbackName, collections })
  }
  if (isRecord(root.properties)) {
    const name = typeof root.title === 'string' ? root.title : fallbackName
    return validateDataLabSchema({ name, collections: [jsonSchemaCollection(name, root)] })
  }
  return schemaFromJsonRecords(fallbackName, [{ name: fallbackName, records: [design] }])
}

function parseSoftArchitectDesign(
  design: Record<string, unknown>,
  fallbackName: string,
): DataLabSchema {
  const warnings: string[] = []
  const collections = (design.collections as unknown[]).map((item, index) => {
    if (!isRecord(item) || !Array.isArray(item.fields)) {
      throw new Error(`Collection ${index + 1} must contain a fields array.`)
    }
    const name = validName(item.name, `Collection ${index + 1}`)
    if (item.foreign_keys !== undefined && !Array.isArray(item.foreign_keys)) {
      throw new Error(`${name} foreign_keys must be an array.`)
    }
    const fields = item.fields.map((field, fieldIndex) => {
      if (!isRecord(field)) throw new Error(`${name}: field ${fieldIndex + 1} is invalid.`)
      return {
        name: validName(field.name, `field ${fieldIndex + 1}`),
        type: normalizeType(field.bson_type ?? field.type),
        required: field.required === true,
      }
    })
    const foreignKeys = (item.foreign_keys as unknown[] | undefined)?.flatMap((key) => {
      if (
        !isRecord(key)
        || typeof key.field !== 'string'
        || typeof key.references_collection !== 'string'
        || typeof key.references_field !== 'string'
      ) {
        throw new Error(`${name} contains an invalid foreign-key definition.`)
      }
      if (key.field.includes('.')) {
        warnings.push(`${name}.${key.field} is nested; nested references are not generated automatically.`)
        return []
      }
      return [{
        field: key.field,
        references_collection: key.references_collection,
        references_field: key.references_field,
      }]
    }) ?? []
    return {
      name,
      primary_key: typeof item.primary_key === 'string' ? item.primary_key : '_id',
      fields,
      foreign_keys: foreignKeys,
    }
  })
  return validateDataLabSchema({
    name: typeof design.database_name === 'string' ? design.database_name : fallbackName,
    collections,
    ...(warnings.length ? { warnings } : {}),
  })
}

function schemaFromJsonRecords(
  name: string,
  samples: { name: string; records: unknown }[],
): DataLabSchema {
  const preservedReferences: string[] = []
  const collections = samples.map(({ name: collectionName, records }) => {
    if (!Array.isArray(records) || records.length === 0 || !records.every(isRecord)) {
      throw new Error(`${collectionName || 'JSON collection'} must contain at least one object record.`)
    }
    if (records.length > 5000) throw new Error(`${collectionName} is limited to 5,000 sample rows.`)
    const recordRows = records as Record<string, unknown>[]
    const names = [...new Set(recordRows.flatMap((record) => Object.keys(record)))]
    if (!names.length || names.length > 100) {
      throw new Error(`${collectionName} must contain between 1 and 100 fields.`)
    }
    const fields = names.map((fieldName) => {
      const samplesForField = recordRows.map((record) => record[fieldName]).filter((sample) => sample !== null && sample !== undefined)
      const normalizedSamples = samplesForField.map(unwrapExtendedJsonObjectId)
      const isForeignKey = /(?:_id|Id)$/i.test(fieldName) && !/^_?id$/i.test(fieldName)
      const referenceValues = isForeignKey
        ? [...new Map(normalizedSamples
          .filter((sample): sample is string | number | boolean => (
            typeof sample === 'string' || typeof sample === 'number' || typeof sample === 'boolean'
          ))
          .map((sample) => [JSON.stringify(sample), sample])).values()]
        : []
      if (referenceValues.length) preservedReferences.push(`${collectionName}.${fieldName}`)
      return {
        name: validName(fieldName, 'Field'),
        type: inferJsonType(fieldName, samplesForField),
        required: recordRows.every((record) => record[fieldName] !== null && record[fieldName] !== undefined),
        ...(referenceValues.length ? { reference_values: referenceValues } : {}),
      }
    })
    const primaryKey = fields.some((field) => field.name === '_id')
      ? '_id'
      : fields.some((field) => field.name === 'id')
        ? 'id'
        : '_id'
    if (!fields.some((field) => field.name === primaryKey)) {
      fields.unshift({ name: '_id', type: 'objectId', required: true })
    }
    return {
      name: validName(collectionName, 'Collection'),
      primary_key: primaryKey,
      fields,
      foreign_keys: [],
    }
  })
  return validateDataLabSchema({
    name,
    collections,
    ...(preservedReferences.length ? { preserved_references: preservedReferences } : {}),
  })
}

function inferJsonType(fieldName: string, samples: unknown[]): DataLabFieldType {
  if (!samples.length) return 'string'
  if (fieldName === '_id' && samples.every(isExtendedJsonObjectId)) return 'objectId'
  if (fieldName !== '_id' && /(?:_id|Id)$/i.test(fieldName) && samples.every(isExtendedJsonObjectId)) {
    return 'objectId'
  }
  if (fieldName !== '_id' && /(?:_id|Id)$/i.test(fieldName) && samples.every((value) => (
    typeof value === 'string' && /^[a-f\d]{24}$/i.test(value)
  ))) return 'string'
  if (fieldName === '_id' && samples.every((value) => typeof value === 'string' && /^[a-f\d]{24}$/i.test(value))) {
    return 'objectId'
  }
  if (samples.every((value) => typeof value === 'boolean')) return 'boolean'
  if (samples.every((value) => typeof value === 'number' && Number.isInteger(value))) return 'integer'
  if (samples.every((value) => typeof value === 'number')) return 'number'
  if (samples.every((value) => typeof value === 'object' && value !== null && !Array.isArray(value))) return 'object'
  if (samples.every(Array.isArray)) return 'array'
  if (samples.every((value) => typeof value === 'string')) {
    return inferType(samples as string[])
  }
  return 'string'
}

function jsonSchemaCollection(name: string, schema: unknown): DataLabCollection {
  if (!isRecord(schema) || (schema.properties !== undefined && !isRecord(schema.properties))) {
    throw new Error(`JSON Schema collection "${name}" must have an object properties field.`)
  }
  const required = new Set(Array.isArray(schema.required) ? schema.required.filter((value): value is string => typeof value === 'string') : [])
  const properties = isRecord(schema.properties) ? schema.properties : {}
  const fields = Object.entries(properties).map(([fieldName, property]) => {
    const propertySchema = isRecord(property) ? property : {}
    return {
      name: fieldName,
      type: normalizeType(propertySchema.bsonType ?? (propertySchema.format === 'date-time' ? 'date-time' : propertySchema.type)),
      required: required.has(fieldName),
      ...(Array.isArray(propertySchema.enum)
        ? { enum: propertySchema.enum.filter((value): value is string | number | boolean => (
          typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
        )).map(String) }
        : {}),
    }
  })
  if (!fields.some((field) => field.name === '_id')) {
    fields.unshift({ name: '_id', type: 'objectId', required: true })
  }
  return { name: validName(name, 'Collection'), primary_key: '_id', fields, foreign_keys: [] }
}

export function parseCsvCollection(name: string, csv: string): DataLabCollection {
  if (csv.length > 5_000_000) throw new Error(`${name} exceeds the 5 MB import limit.`)
  const rows = parseCsvRows(csv)
  if (rows.length < 2) throw new Error(`${name} needs a header and at least one data row.`)
  const headers = rows[0].map((header) => header.trim().replace(/^\uFEFF/, ''))
  if (headers.some((header) => !header)) throw new Error(`${name} contains an empty column name.`)
  if (new Set(headers).size !== headers.length) throw new Error(`${name} contains duplicate column names.`)
  if (headers.length > 100 || rows.length > 5001) throw new Error(`${name} is limited to 100 columns and 5,000 sample rows.`)

  const dataRows = rows.slice(1).filter((row) => row.some((value) => value.trim() !== ''))
  if (!dataRows.length) throw new Error(`${name} does not contain any non-empty data rows.`)
  if (dataRows.some((row) => row.length > headers.length)) {
    throw new Error(`${name} contains rows with more values than header columns.`)
  }
  const fields = headers.map((header, index) => {
    const samples = dataRows.map((row) => row[index] ?? '').filter((value) => value.trim() !== '')
    return {
      name: header,
      type: inferType(samples),
      required: samples.length === dataRows.length,
    }
  })
  const primaryKey = fields.some((field) => field.name === '_id')
    ? '_id'
    : fields.some((field) => field.name === 'id')
      ? 'id'
      : '_id'
  if (!fields.some((field) => field.name === primaryKey)) {
    fields.unshift({ name: '_id', type: 'objectId', required: true })
  }
  return { name: validName(name, 'Collection'), primary_key: primaryKey, fields, foreign_keys: [] }
}

export function validateDataLabSchema(schema: DataLabSchema): DataLabSchema {
  const collectionNames = new Set<string>()
  for (const collection of schema.collections) {
    if (!collection.name.trim() || collectionNames.has(collection.name)) {
      throw new Error(`Collection names must be non-empty and unique: "${collection.name}".`)
    }
    collectionNames.add(collection.name)
    const fieldNames = collection.fields.map((field) => field.name)
    if (!fieldNames.length || new Set(fieldNames).size !== fieldNames.length) {
      throw new Error(`${collection.name} must have unique fields and at least one field.`)
    }
    if (!fieldNames.includes(collection.primary_key)) {
      throw new Error(`${collection.name} primary key "${collection.primary_key}" must exist as a field.`)
    }
    for (const key of collection.foreign_keys) {
      const target = schema.collections.find((candidate) => candidate.name === key.references_collection)
      if (!fieldNames.includes(key.field) || !target?.fields.some((field) => field.name === key.references_field)) {
        throw new Error(`${collection.name}.${key.field} references an unknown field or collection.`)
      }
    }
  }
  if (!schema.collections.length) throw new Error('Add at least one collection to the schema.')
  if (schema.collections.length > 30) throw new Error('A data design can contain at most 30 collections.')
  return schema
}

export function addDataLabRelationship(
  schema: DataLabSchema,
  childName: string,
  parentName: string,
  foreignKeyName: string,
): DataLabSchema {
  if (childName === parentName) throw new Error('Choose two different collections for a relationship.')
  const child = schema.collections.find((collection) => collection.name === childName)
  const parent = schema.collections.find((collection) => collection.name === parentName)
  if (!child || !parent) throw new Error('Select valid child and parent collections.')
  const parentKey = parent.fields.find((field) => field.name === parent.primary_key)
  if (!parentKey) throw new Error(`${parentName} is missing its primary key field.`)
  const fieldName = validName(foreignKeyName.trim(), 'Foreign key')
  if (child.fields.some((field) => field.name === fieldName)) {
    throw new Error(`${childName}.${fieldName} already exists.`)
  }
  const updated = {
    ...schema,
    collections: schema.collections.map((collection) => collection.name !== childName
      ? collection
      : {
        ...collection,
        fields: [...collection.fields, { name: fieldName, type: parentKey.type, required: true }],
        foreign_keys: [
          ...collection.foreign_keys,
          { field: fieldName, references_collection: parentName, references_field: parent.primary_key },
        ],
      }),
  }
  return validateDataLabSchema(updated)
}

export function generateDataLabRecords(
  schema: DataLabSchema,
  counts: Record<string, number>,
): DataLabResult {
  validateDataLabSchema(schema)
  const names = schema.collections.map((collection) => collection.name)
  if (names.some((name) => !Number.isInteger(counts[name]) || counts[name] < 1 || counts[name] > 500)) {
    throw new Error('Choose between 1 and 500 records for every collection.')
  }
  if (Object.keys(counts).some((name) => !names.includes(name))) {
    throw new Error('Record counts must match the imported collections.')
  }
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0)
  if (total > 5_000) throw new Error('Keep the total generated dataset at or below 5,000 records.')
  const ids = new Map(schema.collections.map((collection, collectionIndex) => {
    const key = collection.fields.find((field) => field.name === collection.primary_key)
    return [
      collection.name,
      Array.from({ length: counts[collection.name] }, (_, index) => (
        key ? primaryKeyValue(key, collection, collectionIndex, index) : undefined
      )),
    ]
  }))
  const collections = schema.collections.map((collection) => ({
    name: collection.name,
    records: Array.from({ length: counts[collection.name] }, (_, index) => {
      const record: Record<string, unknown> = {}
      for (const field of collection.fields) {
        const foreignKey = collection.foreign_keys.find((key) => key.field === field.name)
        const references = foreignKey ? ids.get(foreignKey.references_collection) ?? [] : []
        record[field.name] = field.name === collection.primary_key
          ? ids.get(collection.name)?.[index]
          : foreignKey
            ? references.length ? references[index % references.length] : undefined
            : valueForField(field, collection.name, index)
      }
      return record
    }),
  }))
  return {
    name: schema.name,
    created_at: new Date().toISOString(),
    records_by_collection: counts,
    collections,
  }
}

function primaryKeyValue(
  field: DataLabCollection['fields'][number],
  collection: DataLabCollection,
  collectionIndex: number,
  index: number,
): unknown {
  if (field.type === 'objectId' || field.name === '_id') {
    return `64${collectionIndex.toString(16).padStart(4, '0')}${(index + 1).toString(16).padStart(18, '0')}`
  }
  return valueForField(field, collection.name, index)
}

export function dataLabJson(result: DataLabResult): string {
  return JSON.stringify(result, null, 2)
}

export function dataLabMongoJson(collection: DataLabResult['collections'][number], schema: DataLabSchema): string {
  const definition = schema.collections.find((item) => item.name === collection.name)
  if (!definition) throw new Error(`No schema found for collection "${collection.name}".`)
  const objectIdFields = new Set(
    definition.fields.filter((field) => field.type === 'objectId').map((field) => field.name),
  )
  const dateFields = new Set(
    definition.fields.filter((field) => field.type === 'date').map((field) => field.name),
  )
  return JSON.stringify(collection.records.map((record) => Object.fromEntries(
    Object.entries(record).map(([field, value]) => [
      field,
      value === null || value === undefined
        ? value
        : objectIdFields.has(field)
          ? { $oid: String(value) }
          : dateFields.has(field)
            ? { $date: String(value) }
            : value,
    ]),
  )), null, 2)
}

export function dataLabSchemaJson(schema: DataLabSchema): string {
  validateDataLabSchema(schema)
  return JSON.stringify({
    database_name: schema.name,
    collections: schema.collections.map((collection) => ({
      name: collection.name,
      primary_key: collection.primary_key,
      fields: collection.fields.map((field) => ({
        name: field.name,
        bson_type: field.type,
        required: field.required,
      })),
      foreign_keys: collection.foreign_keys,
    })),
  }, null, 2)
}

export function dataLabCsv(collection: DataLabResult['collections'][number]): string {
  const columns = [...new Set(collection.records.flatMap((record) => Object.keys(record)))]
  const escape = (value: unknown) => {
    const text = value === null || value === undefined
      ? ''
      : typeof value === 'object'
        ? JSON.stringify(value)
        : String(value)
    return `"${text.replace(/"/g, '""')}"`
  }
  return [
    columns.map(escape).join(','),
    ...collection.records.map((record) => columns.map((column) => escape(record[column])).join(',')),
  ].join('\r\n')
}

export async function dataLabCsvZip(result: DataLabResult): Promise<Blob> {
  if (!result.collections.length) throw new Error('Generate at least one collection before exporting CSV files.')
  const archive = new JSZip()
  result.collections.forEach((collection, index) => {
    const safeName = collection.name
      .split('')
      .map((character) => character.charCodeAt(0) < 32 || '<>:"/\\|?*'.includes(character) ? '_' : character)
      .join('')
      .replace(/[. ]+$/g, '')
      .trim() || `collection-${index + 1}`
    archive.file(`${String(index + 1).padStart(2, '0')}-${safeName}.csv`, dataLabCsv(collection))
  })
  return archive.generateAsync({ type: 'blob', mimeType: 'application/zip' })
}

export async function dataLabMongoJsonZip(result: DataLabResult, schema: DataLabSchema): Promise<Blob> {
  if (!result.collections.length) throw new Error('Generate at least one collection before exporting MongoDB JSON.')
  const archive = new JSZip()
  result.collections.forEach((collection, index) => {
    const safeName = collection.name
      .split('')
      .map((character) => character.charCodeAt(0) < 32 || '<>:"/\\|?*'.includes(character) ? '_' : character)
      .join('')
      .replace(/[. ]+$/g, '')
      .trim() || `collection-${index + 1}`
    archive.file(`${String(index + 1).padStart(2, '0')}-${safeName}.json`, dataLabMongoJson(collection, schema))
  })
  return archive.generateAsync({ type: 'blob', mimeType: 'application/zip' })
}

function valueForField(field: DataLabCollection['fields'][number], collectionName: string, index: number): unknown {
  if (field.enum?.length) return field.enum[index % field.enum.length]
  if (field.reference_values?.length) return field.reference_values[index % field.reference_values.length]
  const fieldName = field.name.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().replace(/[_-]+/g, ' ')
  const normalized = `${collectionName} ${fieldName}`.toLowerCase().replace(/[_-]+/g, ' ')
  if (field.name === '_id' || field.type === 'objectId') return `65${(index + 1).toString(16).padStart(22, '0')}`
  if (field.type === 'integer') return index + 1
  if (field.type === 'number') return Number((index + 1) * 12.5)
  if (field.type === 'boolean') return index % 2 === 0
  if (field.type === 'date') return new Date(Date.UTC(2025, index % 12, (index % 28) + 1)).toISOString()
  if (field.type === 'array') return []
  if (field.type === 'object') return {}
  if (/\b(password|token|secret|credential)\b/.test(normalized)) {
    return `$synthetic$not-for-authentication$${index + 1}`
  }
  if (normalized.includes('email')) return `user${index + 1}@example.test`
  if (/\b(first|given) name\b/.test(fieldName)) return syntheticFirstNames[index % syntheticFirstNames.length]
  if (/\b(last|family|sur) name\b/.test(fieldName)) return syntheticLastNames[index % syntheticLastNames.length]
  if (/\b(name|student|std|user|customer|teacher|instructor|employee|person|member)\b/.test(normalized)) {
    const firstName = syntheticFirstNames[index % syntheticFirstNames.length]
    const lastName = syntheticLastNames[(index * 5) % syntheticLastNames.length]
    return `${firstName} ${lastName}`
  }
  if (normalized.includes('phone')) return `+1555000${String(index + 1).padStart(4, '0')}`
  if (normalized.includes('status')) return ['active', 'pending', 'completed'][index % 3]
  return `${field.name}_${index + 1}`
}

function unwrapExtendedJsonObjectId(value: unknown): unknown {
  if (isExtendedJsonObjectId(value)) {
    return value.$oid
  }
  return value
}

function isExtendedJsonObjectId(value: unknown): value is { $oid: string } {
  return isRecord(value) && typeof value.$oid === 'string' && /^[a-f\d]{24}$/i.test(value.$oid)
}

function inferType(samples: string[]): DataLabFieldType {
  if (!samples.length) return 'string'
  if (samples.every((value) => /^(true|false)$/i.test(value.trim()))) return 'boolean'
  if (samples.every((value) => /^-?\d+$/.test(value.trim()))) return 'integer'
  if (samples.every((value) => /^-?(?:\d+\.?\d*|\.\d+)$/.test(value.trim()))) return 'number'
  if (samples.every((value) => !Number.isNaN(Date.parse(value)) && /[-/:T]/.test(value))) return 'date'
  return 'string'
}

function normalizeType(value: unknown): DataLabFieldType {
  if (Array.isArray(value)) {
    const nonNullType = value.find((candidate) => candidate !== 'null')
    return normalizeType(nonNullType)
  }
  const normalized = typeof value === 'string' ? value.toLowerCase() : 'string'
  if (normalized === 'objectid' || normalized === 'objectid()') return 'objectId'
  if (normalized === 'object') return 'object'
  if (normalized.startsWith('array')) return 'array'
  if (normalized === 'int' || normalized === 'long' || normalized === 'integer') return 'integer'
  if (normalized === 'double' || normalized === 'decimal' || normalized === 'float' || normalized === 'number') return 'number'
  if (normalized === 'bool') return 'boolean'
  if (normalized === 'date-time' || normalized === 'datetime') return 'date'
  if (supportedTypes.has(normalized as DataLabFieldType)) return normalized as DataLabFieldType
  return 'string'
}

function parseCsvRows(source: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let value = ''
  let quoted = false
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        value += '"'
        index += 1
      } else if (char === '"') {
        quoted = false
      } else {
        value += char
      }
    } else if (char === '"' && value === '') {
      quoted = true
    } else if (char === ',') {
      row.push(value)
      value = ''
    } else if (char === '\n') {
      row.push(value.replace(/\r$/, ''))
      rows.push(row)
      row = []
      value = ''
    } else {
      value += char
    }
  }
  if (quoted) throw new Error('CSV contains an unclosed quoted value.')
  if (value.length || row.length) {
    row.push(value.replace(/\r$/, ''))
    rows.push(row)
  }
  return rows
}

function validName(value: unknown, fallback: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 80) {
    throw new Error(`${fallback} must have a name between 1 and 80 characters.`)
  }
  return value.trim()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
