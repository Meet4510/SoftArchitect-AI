import { useMemo, useState, type ChangeEvent, type ReactNode } from 'react'
import { AlertCircle, ArrowRight, Database, Download, FileJson2, FileSpreadsheet, Plus, RotateCcw, Sparkles, Trash2, WandSparkles } from 'lucide-react'
import {
  addDataLabRelationship,
  dataLabCsv,
  dataLabCsvZip,
  dataLabJson,
  dataLabMongoJsonZip,
  dataLabSchemaJson,
  generateDataLabRecords,
  parseCsvCollection,
  parseDataLabJson,
  type DataLabCollection,
  type DataLabFieldType,
  type DataLabResult,
  type DataLabSchema,
} from '../../services/data-lab'

const fieldTypes: DataLabFieldType[] = ['string', 'integer', 'number', 'boolean', 'date', 'objectId', 'object', 'array']
const inputClass = 'rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-cyan-400'

export function DataLabPage() {
  const [schema, setSchema] = useState<DataLabSchema | null>(null)
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [result, setResult] = useState<DataLabResult | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [csvExporting, setCsvExporting] = useState(false)
  const [mongoExporting, setMongoExporting] = useState(false)
  const [mode, setMode] = useState<'choose' | 'import' | 'custom'>('choose')
  const [childName, setChildName] = useState('')
  const [parentName, setParentName] = useState('')
  const [foreignKeyName, setForeignKeyName] = useState('')

  const totalRecords = useMemo(
    () => Object.values(counts).reduce((total, count) => total + count, 0),
    [counts],
  )
  const updateSchema = (next: DataLabSchema) => {
    setSchema(next)
    setCounts((current) => Object.fromEntries(
      next.collections.map((collection) => [collection.name, current[collection.name] ?? 10]),
    ))
    setResult(null)
    setError('')
  }

  const importJson = async (event: ChangeEvent<HTMLInputElement>, mode: 'schema' | 'samples') => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setError('')
    try {
      if (file.size > 5_000_000) throw new Error('Choose a JSON file no larger than 5 MB.')
      const imported = parseDataLabJson(JSON.parse(await file.text()), file.name.replace(/\.json$/i, ''))
      if (mode === 'schema' && imported.collections.length === 0) {
        throw new Error('The JSON Schema must define at least one collection.')
      }
      updateSchema(imported)
      setMode('import')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not read this JSON file.')
    }
  }

  const importCsv = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (!files.length) return
    setError('')
    setBusy(true)
    try {
      if (files.length > 30) throw new Error('Import up to 30 CSV files at a time.')
      if (files.reduce((total, file) => total + file.size, 0) > 20_000_000) {
        throw new Error('Keep the combined CSV import below 20 MB.')
      }
      const imported = await Promise.all(files.map(async (file) => {
        if (file.size > 5_000_000) throw new Error(`${file.name} exceeds the 5 MB import limit.`)
        const name = file.name.replace(/\.csv$/i, '')
        return parseCsvCollection(name, await file.text())
      }))
      updateSchema({ name: 'CSV import', collections: imported })
      setMode('import')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not read the CSV files.')
    } finally {
      setBusy(false)
    }
  }

  const addRelationship = () => {
    if (!schema) return
    try {
      updateSchema(addDataLabRelationship(schema, childName, parentName, foreignKeyName))
      setForeignKeyName('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not add this relationship.')
    }
  }

  const generate = () => {
    if (!schema) return
    setError('')
    try {
      setResult(generateDataLabRecords(schema, counts))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not generate sample data.')
    }
  }

  const downloadAllCsv = async () => {
    if (!result) return
    setCsvExporting(true)
    setError('')
    try {
      const archive = await dataLabCsvZip(result)
      const filename = result.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'synthetic-data'
      downloadFile(archive, `${filename}-csv.zip`, 'application/zip')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create the CSV archive.')
    } finally {
      setCsvExporting(false)
    }
  }

  const downloadMongoJson = async () => {
    if (!result || !schema) return
    setMongoExporting(true)
    setError('')
    try {
      const archive = await dataLabMongoJsonZip(result, schema)
      const filename = result.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'synthetic-data'
      downloadFile(archive, `${filename}-mongodb-json.zip`, 'application/zip')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create the MongoDB JSON archive.')
    } finally {
      setMongoExporting(false)
    }
  }

  const changeField = (
    collectionName: string,
    fieldName: string,
    update: { type?: DataLabFieldType; required?: boolean },
  ) => {
    if (!schema) return
    updateSchema({
      ...schema,
      collections: schema.collections.map((collection) => ({
        ...collection,
        fields: collection.fields.map((field) => field.name === fieldName && collection.name === collectionName
          ? { ...field, ...update }
          : field),
      })),
    })
  }

  const startCustomDesign = () => {
    setMode('custom')
    updateSchema({ name: 'my_database', collections: [] })
  }

  const startOver = () => {
    setSchema(null)
    setCounts({})
    setResult(null)
    setError('')
    setMode('choose')
    setChildName('')
    setParentName('')
    setForeignKeyName('')
  }

  const addCollection = () => {
    if (!schema) return
    if (schema.collections.length >= 30) {
      setError('A data design can contain at most 30 collections.')
      return
    }
    let index = schema.collections.length + 1
    let name = `collection_${index}`
    while (schema.collections.some((collection) => collection.name === name)) {
      index += 1
      name = `collection_${index}`
    }
    updateSchema({
      ...schema,
      collections: [...schema.collections, {
        name,
        primary_key: '_id',
        fields: [{ name: '_id', type: 'objectId', required: true }],
        foreign_keys: [],
      }],
    })
  }

  const addField = (collectionName: string) => {
    if (!schema) return
    const collection = schema.collections.find((item) => item.name === collectionName)
    if (!collection || collection.fields.length >= 100) {
      setError(`${collectionName} can contain at most 100 fields.`)
      return
    }
    let index = collection.fields.length + 1
    let name = `field_${index}`
    while (collection.fields.some((field) => field.name === name)) {
      index += 1
      name = `field_${index}`
    }
    updateSchema({
      ...schema,
      collections: schema.collections.map((item) => item.name !== collectionName
        ? item
        : { ...item, fields: [...item.fields, { name, type: 'string', required: false }] }),
    })
  }

  const renameCollection = (oldName: string, name: string) => {
    if (!schema) return
    updateSchema({
      ...schema,
      collections: schema.collections.map((collection) => ({
        ...collection,
        name: collection.name === oldName ? name : collection.name,
        foreign_keys: collection.foreign_keys.map((key) => ({
          ...key,
          references_collection: key.references_collection === oldName ? name : key.references_collection,
        })),
      })),
    })
  }

  const renameField = (collectionName: string, oldName: string, name: string) => {
    if (!schema) return
    updateSchema({
      ...schema,
      collections: schema.collections.map((collection) => ({
        ...collection,
        fields: collection.fields.map((field) => (
          collection.name === collectionName && field.name === oldName ? { ...field, name } : field
        )),
        primary_key: collection.name === collectionName && collection.primary_key === oldName
          ? name
          : collection.primary_key,
        foreign_keys: collection.foreign_keys.map((key) => ({
          ...key,
          field: collection.name === collectionName && key.field === oldName ? name : key.field,
          references_field: key.references_collection === collectionName && key.references_field === oldName
            ? name
            : key.references_field,
        })),
      })),
    })
  }

  const removeField = (collectionName: string, fieldName: string) => {
    if (!schema) return
    const collection = schema.collections.find((item) => item.name === collectionName)
    if (collection?.primary_key === fieldName) {
      setError('Choose a different primary key before removing this field.')
      return
    }
    updateSchema({
      ...schema,
      collections: schema.collections.map((item) => ({
        ...item,
        fields: item.name === collectionName ? item.fields.filter((field) => field.name !== fieldName) : item.fields,
        foreign_keys: item.foreign_keys.filter((key) => !(
          (item.name === collectionName && key.field === fieldName)
          || (key.references_collection === collectionName && key.references_field === fieldName)
        )),
      })),
    })
  }

  const removeCollection = (name: string) => {
    if (!schema) return
    updateSchema({
      ...schema,
      collections: schema.collections
        .filter((collection) => collection.name !== name)
        .map((collection) => ({
          ...collection,
          foreign_keys: collection.foreign_keys.filter((key) => key.references_collection !== name),
        })),
    })
  }

  const changePrimaryKey = (collectionName: string, primaryKey: string) => {
    if (!schema) return
    updateSchema({
      ...schema,
      collections: schema.collections.map((collection) => collection.name === collectionName
        ? { ...collection, primary_key: primaryKey }
        : collection),
    })
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-violet-950/30 p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">Standalone utility · No project needed</p>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <h1 className="text-2xl font-semibold text-white sm:text-3xl">Synthetic Data Lab</h1>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              Import a JSON Schema, JSON sample data, or CSV; or build a database design from scratch, then generate and download related synthetic records.
              Files stay in your browser and are not uploaded.
            </p>
          </div>
          {schema || mode !== 'choose' ? (
            <button type="button" onClick={startOver} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:border-slate-500 hover:text-white">
              <RotateCcw className="h-4 w-4" /> {schema ? 'Start over' : 'Back to options'}
            </button>
          ) : null}
        </div>
      </section>

      {error ? (
        <div role="alert" className="flex gap-2 rounded-xl border border-red-400/30 bg-red-400/5 px-4 py-3 text-sm text-red-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </div>
      ) : null}

      {!schema && mode === 'choose' ? (
        <section className="grid gap-5 lg:grid-cols-2">
          <article className="rounded-2xl border border-violet-400/30 bg-gradient-to-br from-violet-400/[0.12] to-slate-900 p-6 transition hover:border-violet-300/60">
            <div className="flex items-center gap-3 text-violet-200"><Database className="h-6 w-6" /><h2 className="text-lg font-semibold text-white">Create a custom database design</h2></div>
            <p className="mt-3 text-sm leading-6 text-slate-300">Start from an empty database. Create collections, define fields and types, select primary keys, connect relationships, and generate synthetic data from your design.</p>
            <button type="button" onClick={startCustomDesign} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-violet-300 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-violet-200">
              <Plus className="h-4 w-4" /> Start custom design
            </button>
          </article>
          <article className="rounded-2xl border border-cyan-400/20 bg-slate-900/70 p-6 transition hover:border-cyan-300/50">
            <div className="flex items-center gap-3 text-cyan-200"><FileJson2 className="h-6 w-6" /><h2 className="text-lg font-semibold text-white">Generate from existing data or schema</h2></div>
            <p className="mt-3 text-sm leading-6 text-slate-300">Import JSON Schema, a MongoDB schema export, JSON records, or CSV sample files. Review the detected design, update relationships, then generate synthetic data.</p>
            <button type="button" onClick={() => setMode('import')} className="mt-5 inline-flex items-center gap-2 rounded-xl border border-cyan-300/30 px-4 py-2.5 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-300/10">
              <FileSpreadsheet className="h-4 w-4" /> Choose an import source
            </button>
          </article>
        </section>
      ) : !schema && mode === 'import' ? (
        <section className="grid gap-5 lg:grid-cols-2">
          <div className="lg:col-span-2">
            <h2 className="text-lg font-semibold text-white">Import an existing schema or sample</h2>
            <p className="mt-1 text-sm text-slate-400">Choose one input type. Imported files stay in your browser.</p>
          </div>
          <ImportCard
            icon={<FileJson2 className="h-5 w-5" />}
            title="JSON Schema / MongoDB schema"
            description="Import JSON Schema, SoftArchitect database designs, or MongoDB collection schema exports such as the attached format."
            accept=".json,application/json"
            multiple={false}
            onChange={(event) => importJson(event, 'schema')}
            disabled={busy}
            action="Choose schema JSON"
          />
          <ImportCard
            icon={<FileJson2 className="h-5 w-5" />}
            title="JSON sample data"
            description="Import a JSON array, named collection arrays, or a previous Data Lab export. Sample values are used only to infer fields and types."
            accept=".json,application/json"
            multiple={false}
            onChange={(event) => importJson(event, 'samples')}
            disabled={busy}
            action="Choose sample JSON"
          />
          <ImportCard
            icon={<FileSpreadsheet className="h-5 w-5" />}
            title="One or more CSV samples"
            description="Each file becomes a collection. Headers and sample values are used to infer an editable schema."
            accept=".csv,text/csv"
            multiple
            onChange={importCsv}
            disabled={busy}
            action={busy ? 'Reading CSV files...' : 'Choose CSV files'}
          />
          <div className="lg:col-span-2 rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm leading-6 text-amber-100">
            <strong>Review before generating:</strong> CSVs reveal columns and likely data types, but usually do not define keys or relationships.
            Confirm required fields and connect collections below after import.
          </div>
        </section>
      ) : schema ? (
        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="rounded-xl bg-cyan-400/10 p-2 text-cyan-200"><Database className="h-5 w-5" /></span>
                <div>
                  {mode === 'custom' ? (
                    <label className="block text-xs text-slate-400">Database name<input aria-label="Database name" className={`${inputClass} mt-1 block w-full`} value={schema.name} onChange={(event) => updateSchema({ ...schema, name: event.target.value })} /></label>
                  ) : <h2 className="font-semibold text-white">{schema.name}</h2>}
                  <p className="mt-1 text-sm text-slate-400">{schema.collections.length} collection(s) · {mode === 'custom' ? 'Define the collections and fields for your design.' : 'Edit inferred field types and required fields before generation.'}</p>
                </div>
              </div>
              {mode === 'custom' ? (
                <button type="button" onClick={() => {
                  try {
                    const filename = schema.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'database-design'
                    downloadFile(dataLabSchemaJson(schema), `${filename}-design.json`, 'application/json;charset=utf-8')
                  } catch (cause) {
                    setError(cause instanceof Error ? cause.message : 'Could not export the database design.')
                  }
                }} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-3 py-2.5 text-sm text-slate-200 hover:border-slate-500 hover:text-white">
                  <Download className="h-4 w-4" /> Export design
                </button>
              ) : null}
              <button type="button" onClick={generate} disabled={!schema.collections.length} className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50">
                <WandSparkles className="h-4 w-4" /> Generate {totalRecords.toLocaleString()} records
              </button>
            </div>
            {mode === 'custom' ? (
              <button type="button" onClick={addCollection} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-violet-400/30 px-3 py-2 text-sm text-violet-100 hover:bg-violet-400/10">
                <Plus className="h-4 w-4" /> Add collection
              </button>
            ) : null}
            <div className="mt-5 grid gap-4">
              {schema.collections.map((collection, collectionIndex) => (
                <CollectionEditor
                  key={collectionIndex}
                  collection={collection}
                  count={counts[collection.name] ?? 10}
                  onCountChange={(count) => setCounts((current) => ({ ...current, [collection.name]: count }))}
                  onFieldChange={(fieldName, update) => changeField(collection.name, fieldName, update)}
                  editable={mode === 'custom'}
                  onNameChange={(name) => renameCollection(collection.name, name)}
                  onFieldNameChange={(fieldName, name) => renameField(collection.name, fieldName, name)}
                  onPrimaryKeyChange={(primaryKey) => changePrimaryKey(collection.name, primaryKey)}
                  onAddField={() => addField(collection.name)}
                  onRemoveField={(fieldName) => removeField(collection.name, fieldName)}
                  onRemove={() => removeCollection(collection.name)}
                />
              ))}
            </div>
            {mode === 'custom' && schema.collections.length === 0 ? (
              <p className="mt-4 rounded-xl border border-slate-800 p-4 text-sm text-slate-400">Add a collection to start defining your database.</p>
            ) : null}
            {schema.preserved_references?.length ? (
              <div className="mt-4 rounded-xl border border-cyan-400/20 bg-cyan-400/5 px-4 py-3 text-xs leading-5 text-cyan-100">
                <p className="font-semibold">Imported foreign-key values will be preserved</p>
                <p className="mt-1 text-cyan-100/80">
                  {schema.preserved_references.join(', ')}. Generated records will reuse these IDs so they can reference the existing documents.
                </p>
              </div>
            ) : null}
            {schema.warnings?.length ? (
              <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-xs leading-5 text-amber-100">
                <p className="font-semibold">Some imported references need manual review</p>
                <ul className="mt-1 list-inside list-disc">{schema.warnings?.map((warning) => <li key={warning}>{warning}</li>)}</ul>
              </div>
            ) : null}
            <p className={`mt-4 text-xs ${totalRecords > 5_000 ? 'text-amber-200' : 'text-slate-500'}`}>
              Maximum 500 records per collection and 5,000 generated records total.
            </p>
          </section>

          <RelationshipEditor
            collections={schema.collections}
            childName={childName}
            parentName={parentName}
            foreignKeyName={foreignKeyName}
            onChildChange={setChildName}
            onParentChange={setParentName}
            onForeignKeyChange={setForeignKeyName}
            onAdd={addRelationship}
          />

          {result ? (
            <GeneratedData
              result={result}
              onDownloadAllCsv={downloadAllCsv}
              csvExporting={csvExporting}
              onDownloadMongoJson={downloadMongoJson}
              mongoExporting={mongoExporting}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function ImportCard({
  icon, title, description, accept, multiple, onChange, disabled, action,
}: {
  icon: ReactNode
  title: string
  description: string
  accept: string
  multiple: boolean
  onChange: (event: ChangeEvent<HTMLInputElement>) => void
  disabled: boolean
  action: string
}) {
  return (
    <article className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 transition hover:border-slate-700">
      <div className="flex items-center gap-3 text-cyan-200">{icon}<h2 className="font-semibold text-white">{title}</h2></div>
      <p className="mt-3 min-h-12 text-sm leading-6 text-slate-400">{description}</p>
      <label className={`mt-4 inline-flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${disabled ? 'pointer-events-none bg-slate-700 text-slate-400' : 'bg-slate-100 text-slate-950 hover:bg-white'}`}>
        <Plus className="h-4 w-4" /> {action}
        <input className="sr-only" type="file" accept={accept} multiple={multiple} disabled={disabled} onChange={onChange} />
      </label>
    </article>
  )
}

function CollectionEditor({
  collection, count, onCountChange, onFieldChange, editable, onNameChange, onFieldNameChange,
  onPrimaryKeyChange, onAddField, onRemoveField, onRemove,
}: {
  collection: DataLabCollection
  count: number
  onCountChange: (count: number) => void
  onFieldChange: (name: string, update: { type?: DataLabFieldType; required?: boolean }) => void
  editable: boolean
  onNameChange: (name: string) => void
  onFieldNameChange: (fieldName: string, name: string) => void
  onPrimaryKeyChange: (name: string) => void
  onAddField: () => void
  onRemoveField: (name: string) => void
  onRemove: () => void
}) {
  return (
    <article className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950/50">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
        <div>
          {editable ? (
            <input aria-label={`${collection.name} collection name`} className={`${inputClass} py-1 font-medium`} value={collection.name} onChange={(event) => onNameChange(event.target.value)} />
          ) : <h3 className="font-medium text-cyan-100">{collection.name}</h3>}
          <p className="mt-0.5 text-xs text-slate-500">{collection.fields.length} fields · Primary key: {collection.primary_key}</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-slate-400">
            Records
            <input className={`${inputClass} w-24 text-right`} aria-label={`${collection.name} record count`} type="number" min={1} max={500} value={count} onChange={(event) => {
              const value = Number(event.target.value)
              onCountChange(Number.isInteger(value) ? Math.max(1, Math.min(500, value)) : 1)
            }} />
          </label>
          {editable ? <button type="button" onClick={onRemove} aria-label={`Remove ${collection.name}`} className="rounded-lg p-2 text-slate-500 hover:bg-red-400/10 hover:text-red-200"><Trash2 className="h-4 w-4" /></button> : null}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-xs">
          <thead className="text-slate-500"><tr><th className="px-4 py-2 font-medium">Field</th><th className="px-4 py-2 font-medium">Type</th><th className="px-4 py-2 font-medium">Required</th><th className="px-4 py-2 font-medium">Key</th>{editable ? <th className="px-4 py-2" /> : null}</tr></thead>
          <tbody className="divide-y divide-slate-800/70">
            {collection.fields.map((field, fieldIndex) => (
              <tr key={fieldIndex}>
                <td className="px-4 py-2 text-slate-200">
                  {editable ? <input aria-label={`${collection.name}.${field.name} field name`} className={`${inputClass} w-36 py-1 text-xs`} value={field.name} onChange={(event) => onFieldNameChange(field.name, event.target.value)} /> : field.name}
                </td>
                <td className="px-4 py-2">
                  <select aria-label={`${collection.name}.${field.name} type`} className={`${inputClass} py-1 text-xs`} value={field.type} onChange={(event) => onFieldChange(field.name, { type: event.target.value as DataLabFieldType })}>
                    {fieldTypes.map((type) => <option key={type}>{type}</option>)}
                  </select>
                </td>
                <td className="px-4 py-2"><input aria-label={`${collection.name}.${field.name} required`} type="checkbox" checked={field.required} onChange={(event) => onFieldChange(field.name, { required: event.target.checked })} className="accent-cyan-400" /></td>
                <td className="px-4 py-2 text-slate-500">
                  {editable
                    ? <input type="radio" aria-label={`${collection.name}.${field.name} primary key`} checked={field.name === collection.primary_key} onChange={() => onPrimaryKeyChange(field.name)} className="accent-cyan-400" />
                    : field.name === collection.primary_key ? 'Primary' : ''}
                </td>
                {editable ? <td className="px-4 py-2"><button type="button" disabled={field.name === collection.primary_key} onClick={() => onRemoveField(field.name)} aria-label={`Remove ${collection.name}.${field.name}`} className="rounded p-1 text-slate-500 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-30"><Trash2 className="h-3.5 w-3.5" /></button></td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editable ? <button type="button" onClick={onAddField} className="m-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300 hover:border-cyan-400/40 hover:text-cyan-100"><Plus className="h-3.5 w-3.5" /> Add field</button> : null}
      {collection.foreign_keys.length ? (
        <p className="border-t border-slate-800 px-4 py-2 text-xs text-slate-500">
          References: {collection.foreign_keys.map((key) => `${key.field} → ${key.references_collection}.${key.references_field}`).join(' · ')}
        </p>
      ) : null}
    </article>
  )
}

function RelationshipEditor({
  collections, childName, parentName, foreignKeyName, onChildChange, onParentChange, onForeignKeyChange, onAdd,
}: {
  collections: DataLabCollection[]
  childName: string
  parentName: string
  foreignKeyName: string
  onChildChange: (value: string) => void
  onParentChange: (value: string) => void
  onForeignKeyChange: (value: string) => void
  onAdd: () => void
}) {
  if (collections.length < 2) return null
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
      <div className="flex items-center gap-2"><ArrowRight className="h-4 w-4 text-violet-300" /><h2 className="font-semibold text-white">Connect collections</h2></div>
      <p className="mt-1 text-xs leading-5 text-slate-400">Add a child-to-parent reference so generated foreign keys point to real generated IDs.</p>
      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]">
        <label className="text-xs text-slate-400">Child collection<select className={`${inputClass} mt-1 w-full`} value={childName} onChange={(event) => onChildChange(event.target.value)}><option value="">Choose collection</option>{collections.map((collection) => <option key={collection.name}>{collection.name}</option>)}</select></label>
        <label className="text-xs text-slate-400">Parent collection<select className={`${inputClass} mt-1 w-full`} value={parentName} onChange={(event) => onParentChange(event.target.value)}><option value="">Choose collection</option>{collections.map((collection) => <option key={collection.name}>{collection.name}</option>)}</select></label>
        <label className="text-xs text-slate-400">Foreign key field<input className={`${inputClass} mt-1 w-full`} value={foreignKeyName} onChange={(event) => onForeignKeyChange(event.target.value)} placeholder="e.g. customer_id" /></label>
        <button type="button" onClick={onAdd} className="self-end rounded-xl border border-violet-400/30 px-3 py-2.5 text-sm text-violet-100 hover:bg-violet-400/10">Add link</button>
      </div>
    </section>
  )
}

function GeneratedData({
  result, onDownloadAllCsv, csvExporting, onDownloadMongoJson, mongoExporting,
}: {
  result: DataLabResult
  onDownloadAllCsv: () => void
  csvExporting: boolean
  onDownloadMongoJson: () => void
  mongoExporting: boolean
}) {
  const safeName = result.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'synthetic-data'
  return (
    <section className="space-y-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.03] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-200"><Sparkles className="h-4 w-4" /> Generated preview</p>
          <h2 className="mt-1 text-lg font-semibold text-white">{Object.values(result.records_by_collection).reduce((sum, count) => sum + count, 0).toLocaleString()} synthetic records</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => downloadFile(dataLabJson(result), `${safeName}.json`, 'application/json;charset=utf-8')} className="inline-flex items-center gap-2 rounded-xl bg-emerald-300 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-emerald-200"><Download className="h-4 w-4" /> Download all JSON</button>
          <button type="button" onClick={onDownloadMongoJson} disabled={mongoExporting} title="ObjectId and date fields use MongoDB Extended JSON types" className="inline-flex items-center gap-2 rounded-xl border border-emerald-300/40 px-4 py-2.5 text-sm font-semibold text-emerald-100 hover:bg-emerald-300/10 disabled:cursor-wait disabled:opacity-60"><Database className="h-4 w-4" /> {mongoExporting ? 'Preparing MongoDB JSON...' : 'MongoDB JSON (.zip)'}</button>
          <button type="button" onClick={onDownloadAllCsv} disabled={csvExporting} className="inline-flex items-center gap-2 rounded-xl border border-emerald-300/40 px-4 py-2.5 text-sm font-semibold text-emerald-100 hover:bg-emerald-300/10 disabled:cursor-wait disabled:opacity-60"><FileSpreadsheet className="h-4 w-4" /> {csvExporting ? 'Preparing CSVs...' : 'Download all CSVs (.zip)'}</button>
        </div>
      </div>
      <p className="text-xs leading-5 text-slate-400">Preview is generated locally. MongoDB JSON exports use Extended JSON so ObjectId and date fields keep their BSON types. These are illustrative records, not production-quality or real personal data.</p>
      <div className="grid gap-3 lg:grid-cols-2">
        {result.collections.map((collection) => (
          <article key={collection.name} className="min-w-0 rounded-xl border border-slate-800 bg-slate-950/70 p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="truncate font-medium text-emerald-100">{collection.name} <span className="text-xs text-slate-500">· {collection.records.length}</span></h3>
              <button type="button" onClick={() => downloadFile(dataLabCsv(collection), `${safeName}-${collection.name}.csv`, 'text/csv;charset=utf-8')} className="inline-flex shrink-0 items-center gap-1.5 text-xs text-slate-300 hover:text-white"><FileSpreadsheet className="h-3.5 w-3.5" /> CSV</button>
            </div>
            <pre className="mt-3 max-h-72 overflow-auto rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs leading-5 text-slate-300"><code>{JSON.stringify(collection.records.slice(0, 3), null, 2)}</code></pre>
          </article>
        ))}
      </div>
    </section>
  )
}

function downloadFile(contents: string | Blob, filename: string, mimeType: string) {
  const blob = contents instanceof Blob ? contents : new Blob([contents], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}
