import axios, { isAxiosError } from 'axios'
import { demoProjects, demoUser, type AuthUser, type Project } from '../lib/demo-data'

export type AuthSession = {
  user: AuthUser
  token: string
}

export type ProjectDraft = {
  name: string
  description?: string
  domain?: string
  requirements?: string
  status?: Project['status']
}

export type RequirementAnalysis = {
  id?: string
  project_id: string
  source_requirements?: string
  created_at: string
  project_summary: string
  functional_requirements: string[]
  non_functional_requirements: string[]
  user_roles: string[]
  modules: string[]
  business_rules: string[]
  assumptions: string[]
  missing_information: string[]
  risks: string[]
}

export type TechnologyChoice = {
  category: string
  recommendation: string
  rationale: string
  alternatives: string[]
  trade_offs: string[]
}

export type TechnologyRecommendation = {
  id?: string
  project_id: string
  source_requirements?: string
  created_at: string
  project_summary: string
  recommendations: TechnologyChoice[]
}

export type ArchitectureComponent = {
  id: string
  name: string
  component_type: string
  description: string
  technologies: string[]
}

export type ArchitectureConnection = {
  source: string
  target: string
  label: string
}

export type SoftwareArchitecture = {
  id?: string
  project_id: string
  source_requirements?: string
  created_at: string
  project_summary: string
  architectural_style: string
  components: ArchitectureComponent[]
  connections: ArchitectureConnection[]
  design_decisions: string[]
  mermaid_diagram: string
}

export type DatabaseField = {
  name: string
  bson_type: string
  required: boolean
  description: string
}

export type CollectionDesign = {
  name: string
  purpose: string
  primary_key: string
  foreign_keys: {
    field: string
    references_collection: string
    references_field: string
    description: string
  }[]
  fields: DatabaseField[]
  indexes: string[]
  embedding_strategy: string
}

export type DatabaseRelationship = {
  from_collection: string
  to_collection: string
  cardinality: string
  description: string
}

export type MongoDatabaseDesign = {
  id?: string
  project_id: string
  source_requirements?: string
  created_at: string
  project_summary: string
  database_name: string
  collections: CollectionDesign[]
  relationships: DatabaseRelationship[]
  design_decisions: string[]
  mermaid_diagram: string
}

export type ApiField = {
  name: string
  data_type: string
  required: boolean
  description: string
}

export type ApiResponse = {
  status_code: number
  description: string
  fields: ApiField[]
}

export type ApiEndpoint = {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  path: string
  summary: string
  description: string
  auth_required: boolean
  roles: string[]
  request_fields: ApiField[]
  responses: ApiResponse[]
}

export type RestApiDesign = {
  id?: string
  project_id: string
  source_requirements?: string
  created_at: string
  project_summary: string
  api_title: string
  version: string
  base_path: string
  authentication: string
  endpoints: ApiEndpoint[]
  design_decisions: string[]
  openapi_spec: Record<string, unknown>
}

export type ProjectDiagrams = {
  id?: string
  project_id: string
  source_requirements?: string
  created_at: string
  project_summary: string
  diagrams: {
    diagram_type: 'use_case' | 'sequence' | 'class' | 'entity_relationship' | 'module_hierarchy'
    title: string
    description: string
    mermaid_source: string
  }[]
  design_decisions: string[]
}

export type SyntheticCollectionData = {
  name: string
  records: Record<string, unknown>[]
}

export type SyntheticDataset = {
  id?: string
  project_id: string
  source_requirements?: string
  created_at: string
  project_summary: string
  source_database_design_id: string
  version: number
  records_by_collection: Record<string, number>
  collections: SyntheticCollectionData[]
}

export type DocumentationRoadmapPhase = {
  title: string
  objective: string
  deliverables: string[]
  acceptance_criteria: string[]
}

export type DocumentationRisk = {
  category: string
  description: string
  likelihood: string
  impact: string
  mitigation: string
}

export type ProjectDocumentation = {
  id?: string
  project_id: string
  source_requirements?: string
  created_at: string
  project_summary: string
  generation_prompt: string
  source_artifacts: string[]
  roadmap: DocumentationRoadmapPhase[]
  risks: DocumentationRisk[]
  custom_sections: { title: string; content: string }[]
  folder_structure: string
  markdown: string
}

export function buildChenEntityRelationshipDiagram(
  collections: CollectionDesign[],
  relationships: DatabaseRelationship[],
): string {
  const lines = [
    'flowchart LR',
    '  %% Chen ERD: rectangles are entities, diamonds are relationships, ovals are attributes.',
    '  %% 1 and N labels show cardinality; PK and FK prefixes identify key attributes.',
  ]
  const entityIds = new Map(collections.map((collection, index) => [collection.name, `Entity${index + 1}`]))
  for (const [collectionIndex, collection] of collections.entries()) {
    const entityId = `Entity${collectionIndex + 1}`
    lines.push(`  ${entityId}["${erdLabel(collection.name)}"]:::erEntity`)
    const foreignKeys = new Map(collection.foreign_keys.map((key) => [key.field.split('.', 1)[0], key]))
    for (const [fieldIndex, field] of collection.fields.entries()) {
      const attributeId = `Attribute${collectionIndex + 1}_${fieldIndex + 1}`
      const foreignKey = foreignKeys.get(field.name)
      const marker = field.name === collection.primary_key ? 'PK' : foreignKey ? 'FK' : ''
      const style = marker ? 'erKey' : 'erAttribute'
      const name = foreignKey && foreignKey.field !== field.name
        ? `${foreignKey.field} -> ${foreignKey.references_collection}.${foreignKey.references_field}`
        : field.name
      const prefix = marker ? `${marker} ` : ''
      lines.push(`  ${attributeId}(["${erdLabel(`${prefix}${name}: ${field.bson_type}`)}"]):::${style}`)
      lines.push(`  ${entityId} --- ${attributeId}`)
    }
  }
  for (const [index, relationship] of relationships.entries()) {
    const sourceId = entityIds.get(relationship.from_collection)
    const targetId = entityIds.get(relationship.to_collection)
    if (!sourceId || !targetId) throw new Error('A database relationship references an unknown entity.')
    const relationshipId = `Relationship${index + 1}`
    const [sourceCardinality, targetCardinality] = erdCardinalities(relationship.cardinality)
    const label = erdLabel(relationship.description.split(/[.;]/, 1)[0]).slice(0, 48)
    lines.push(`  ${relationshipId}{"${label}"}:::erRelationship`)
    lines.push(`  ${sourceId} ---|${sourceCardinality}| ${relationshipId}`)
    lines.push(`  ${relationshipId} ---|${targetCardinality}| ${targetId}`)
  }
  lines.push(
    '  classDef erEntity fill:#0f172a,stroke:#38bdf8,stroke-width:2px,color:#f8fafc',
    '  classDef erRelationship fill:#312e81,stroke:#a5b4fc,stroke-width:2px,color:#f8fafc',
    '  classDef erAttribute fill:#1e293b,stroke:#64748b,color:#e2e8f0',
    '  classDef erKey fill:#164e63,stroke:#22d3ee,stroke-width:2px,color:#ecfeff',
  )
  return lines.join('\n')
}

function erdCardinalities(cardinality: string): [string, string] {
  const normalized = cardinality.toLowerCase().replace(/\s/g, '')
  const cardinalities: Record<string, [string, string]> = {
    'one-to-one': ['1', '1'],
    'one-to-many': ['1', 'N'],
    'many-to-one': ['N', '1'],
    'many-to-many': ['N', 'N'],
  }
  return cardinalities[normalized] ?? ['N', '1']
}

function erdLabel(value: string): string {
  return value.replace(/[^A-Za-z0-9 _.,:()/-]/g, '').trim() || 'Attribute'
}

const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
const api = axios.create({ baseURL: API_BASE_URL, timeout: 8000 })
const PROJECTS_KEY = 'softarchitect_projects'
const REQUIREMENT_ANALYSES_KEY = 'softarchitect_requirement_analyses'
const TECHNOLOGY_RECOMMENDATIONS_KEY = 'softarchitect_technology_recommendations'
const ARCHITECTURES_KEY = 'softarchitect_architectures'
const DATABASE_DESIGNS_KEY = 'softarchitect_database_designs'
const API_DESIGNS_KEY = 'softarchitect_api_designs'
const DIAGRAMS_KEY = 'softarchitect_diagrams'
const DATASETS_KEY = 'softarchitect_datasets'
const DOCUMENTATION_KEY = 'softarchitect_documentation'
const DEMO_TOKEN = 'demo-token'

function isOfflineError(error: unknown): boolean {
  return isAxiosError(error) && !error.response
}

function normalizeProject(item: Partial<Project> & { _id?: string }): Project {
  const now = new Date().toISOString()
  return {
    id: item.id ?? item._id ?? `project-${Date.now()}`,
    user_id: item.user_id ?? 'demo-user',
    name: item.name ?? 'Untitled project',
    description: item.description ?? '',
    domain: item.domain ?? 'General',
    requirements: item.requirements ?? '',
    status: item.status ?? 'DRAFT',
    created_at: item.created_at ?? now,
    updated_at: item.updated_at ?? now,
  }
}

function readDemoProjects(): Project[] {
  const stored = localStorage.getItem(PROJECTS_KEY)
  if (stored) {
    try {
      return (JSON.parse(stored) as Project[]).map(normalizeProject)
    } catch {
      localStorage.removeItem(PROJECTS_KEY)
    }
  }

  localStorage.setItem(PROJECTS_KEY, JSON.stringify(demoProjects))
  return demoProjects
}

function saveDemoProjects(projects: Project[]): void {
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects))
}

function findCurrentDemoArtifact<T extends { project_id: string; source_requirements?: string }>(
  artifacts: T[],
  projectId: string,
  requirements?: string,
): T | undefined {
  const currentRequirements = requirements
    ?? readDemoProjects().find((project) => project.id === projectId)?.requirements
  if (currentRequirements === undefined) return undefined
  return artifacts.find((artifact) => (
    artifact.project_id === projectId
    && artifact.source_requirements?.trim() === currentRequirements.trim()
  ))
}

function invalidateDemoArtifacts(projectId: string): void {
  const artifactKeys = [
    REQUIREMENT_ANALYSES_KEY,
    TECHNOLOGY_RECOMMENDATIONS_KEY,
    ARCHITECTURES_KEY,
    DATABASE_DESIGNS_KEY,
    API_DESIGNS_KEY,
    DIAGRAMS_KEY,
    DATASETS_KEY,
    DOCUMENTATION_KEY,
  ]
  for (const key of artifactKeys) {
    const stored = localStorage.getItem(key)
    if (!stored) continue
    try {
      const artifacts: unknown = JSON.parse(stored)
      if (!Array.isArray(artifacts)) throw new Error(`Saved artifacts in ${key} are invalid.`)
      localStorage.setItem(
        key,
        JSON.stringify(artifacts.filter((artifact) => artifact?.project_id !== projectId)),
      )
    } catch {
      localStorage.removeItem(key)
    }
  }
}

function toAuthUser(value: Partial<AuthUser>): AuthUser {
  if (!value.id || !value.name || !value.email) {
    throw new Error('The server returned an incomplete user profile.')
  }
  return {
    id: value.id,
    name: value.name,
    email: value.email,
    role: value.role === 'ADMIN' ? 'ADMIN' : 'USER',
  }
}

export function getApiErrorMessage(error: unknown): string {
  if (isAxiosError(error)) {
    const detail = error.response?.data?.detail
    if (typeof detail === 'string') return detail
    if (detail && typeof detail.message === 'string') return detail.message
    if (error.response?.status === 422) return 'Please check the information you entered.'
    if (!error.response) return 'Cannot connect to the API. Check that the backend is running.'
    return `Request failed (${error.response.status}).`
  }
  return error instanceof Error ? error.message : 'An unexpected error occurred.'
}

export async function fetchCurrentUser(token: string): Promise<AuthUser> {
  const response = await api.get('/api/v1/auth/me', {
    headers: { Authorization: `Bearer ${token}` },
  })
  return toAuthUser(response.data)
}

export async function loginUser(email: string, password: string): Promise<AuthSession> {
  try {
    const response = await api.post('/api/v1/auth/login', { email, password })
    const token = response.data?.access_token
    if (typeof token !== 'string' || !token) {
      throw new Error('The server did not return an access token.')
    }
    return { token, user: await fetchCurrentUser(token) }
  } catch (error) {
    if (isOfflineError(error)) {
      return {
        user: { ...demoUser, email, name: email.split('@')[0].replace(/[._-]/g, ' ') || demoUser.name },
        token: DEMO_TOKEN,
      }
    }
    throw error
  }
}

export async function registerUser(name: string, email: string, password: string): Promise<AuthSession> {
  try {
    await api.post('/api/v1/auth/register', { name, email, password })
    return loginUser(email, password)
  } catch (error) {
    if (isOfflineError(error)) {
      return { user: { ...demoUser, name, email }, token: DEMO_TOKEN }
    }
    throw error
  }
}

export async function fetchProjects(token: string): Promise<Project[]> {
  if (token === DEMO_TOKEN) return readDemoProjects()

  const response = await api.get('/api/v1/projects/', {
    params: { page: 1, limit: 100 },
    headers: { Authorization: `Bearer ${token}` },
  })
  const items = response.data?.items
  if (!Array.isArray(items)) throw new Error('The server returned an invalid project list.')
  return items.map(normalizeProject)
}

export async function createProject(token: string, draft: ProjectDraft): Promise<Project> {
  const payload = {
    name: draft.name.trim(),
    description: draft.description ?? '',
    domain: draft.domain ?? 'General',
    requirements: draft.requirements ?? '',
    status: draft.status ?? 'DRAFT',
  }

  if (token === DEMO_TOKEN) {
    const created = normalizeProject({
      ...payload,
      id: `project-${Date.now()}`,
      user_id: demoUser.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    saveDemoProjects([created, ...readDemoProjects()])
    return created
  }

  const response = await api.post('/api/v1/projects/', payload, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return normalizeProject(response.data)
}

export async function updateProject(token: string, projectId: string, draft: ProjectDraft): Promise<Project> {
  if (token === DEMO_TOKEN) {
    const projects = readDemoProjects()
    const index = projects.findIndex((project) => project.id === projectId)
    if (index < 0) throw new Error('Project not found.')
    const updated = normalizeProject({ ...projects[index], ...draft, updated_at: new Date().toISOString() })
    if (updated.requirements.trim() !== projects[index].requirements.trim()) {
      invalidateDemoArtifacts(projectId)
    }
    projects[index] = updated
    saveDemoProjects(projects)
    return updated
  }

  const response = await api.put(`/api/v1/projects/${encodeURIComponent(projectId)}`, draft, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return normalizeProject(response.data)
}

export async function deleteProject(token: string, projectId: string): Promise<void> {
  if (token === DEMO_TOKEN) {
    const projects = readDemoProjects()
    if (!projects.some((project) => project.id === projectId)) throw new Error('Project not found.')
    saveDemoProjects(projects.filter((project) => project.id !== projectId))
    return
  }

  await api.delete(`/api/v1/projects/${encodeURIComponent(projectId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
}

export async function analyzeProjectRequirements(
  token: string,
  project: Project,
): Promise<RequirementAnalysis> {
  if (project.requirements.trim().length < 20) {
    throw new Error('Add at least 20 characters of requirements before analysis.')
  }

  if (token === DEMO_TOKEN) {
    return saveDemoAnalysis(createDemoAnalysis(project))
  }

  try {
    const response = await api.post(
      `/api/v1/projects/${encodeURIComponent(project.id)}/requirements/analyze`,
      {},
      { headers: { Authorization: `Bearer ${token}` } },
    )
    return response.data as RequirementAnalysis
  } catch (error) {
    if (isOfflineError(error)) return saveDemoAnalysis(createDemoAnalysis(project))
    throw error
  }
}

export async function fetchProjectRequirementAnalysis(
  token: string,
  projectId: string,
): Promise<RequirementAnalysis> {
  if (token === DEMO_TOKEN) {
    const saved = findCurrentDemoArtifact(readDemoAnalyses(), projectId)
    if (!saved) throw new Error('No saved requirement analysis exists for this project.')
    return saved
  }

  const response = await api.get(
    `/api/v1/projects/${encodeURIComponent(projectId)}/requirements/analysis`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  return response.data as RequirementAnalysis
}

function readDemoAnalyses(): RequirementAnalysis[] {
  const stored = localStorage.getItem(REQUIREMENT_ANALYSES_KEY)
  if (!stored) return []
  try {
    const parsed: unknown = JSON.parse(stored)
    if (!Array.isArray(parsed)) throw new Error('Saved requirement analyses are invalid.')
    return parsed as RequirementAnalysis[]
  } catch {
    localStorage.removeItem(REQUIREMENT_ANALYSES_KEY)
    return []
  }
}

function saveDemoAnalysis(analysis: RequirementAnalysis): RequirementAnalysis {
  const analyses = readDemoAnalyses()
  localStorage.setItem(
    REQUIREMENT_ANALYSES_KEY,
    JSON.stringify([analysis, ...analyses.filter((item) => item.project_id !== analysis.project_id)]),
  )
  return analysis
}

export async function recommendProjectTechnology(
  token: string,
  project: Project,
): Promise<TechnologyRecommendation> {
  if (project.requirements.trim().length < 20) {
    throw new Error('Add at least 20 characters of requirements before requesting recommendations.')
  }

  if (token === DEMO_TOKEN) return createDemoTechnologyRecommendation(project)

  try {
    const response = await api.post(
      `/api/v1/projects/${encodeURIComponent(project.id)}/technology/recommend`,
      {},
      { headers: { Authorization: ['Bearer', token].join(' ') } },
    )
    return response.data as TechnologyRecommendation
  } catch (error) {
    if (isOfflineError(error)) return createDemoTechnologyRecommendation(project)
    throw error
  }
}

export async function fetchProjectTechnologyRecommendation(
  token: string,
  projectId: string,
): Promise<TechnologyRecommendation> {
  if (token === DEMO_TOKEN) {
    const stored = findCurrentDemoArtifact(readDemoTechnologyRecommendations(), projectId)
    if (!stored) throw new Error('No saved technology recommendation exists for this project.')
    return stored
  }

  try {
    const response = await api.get(
      `/api/v1/projects/${encodeURIComponent(projectId)}/technology/recommendation`,
      { headers: { Authorization: ['Bearer', token].join(' ') } },
    )
    return response.data as TechnologyRecommendation
  } catch (error) {
    if (isOfflineError(error)) {
      const stored = findCurrentDemoArtifact(readDemoTechnologyRecommendations(), projectId)
      if (stored) return stored
    }
    throw error
  }
}

export async function generateProjectArchitecture(
  token: string,
  project: Project,
): Promise<SoftwareArchitecture> {
  if (project.requirements.trim().length < 20) {
    throw new Error('Add at least 20 characters of requirements before generating architecture.')
  }
  if (token === DEMO_TOKEN) return createDemoArchitecture(project)

  try {
    try {
      await fetchProjectTechnologyRecommendation(token, project.id)
    } catch (error) {
      if (!isMissingSavedResult(error, 'recommendation_not_found')) throw error
      await recommendProjectTechnology(token, project)
    }

    const response = await api.post(
      `/api/v1/projects/${encodeURIComponent(project.id)}/architecture/generate`,
      {},
      { headers: { Authorization: ['Bearer', token].join(' ') } },
    )
    return response.data as SoftwareArchitecture
  } catch (error) {
    if (isOfflineError(error)) return createDemoArchitecture(project)
    throw error
  }
}

export async function fetchProjectArchitecture(
  token: string,
  projectId: string,
): Promise<SoftwareArchitecture> {
  if (token === DEMO_TOKEN) {
    const saved = findCurrentDemoArtifact(readDemoArchitectures(), projectId)
    if (!saved) throw new Error('No saved software architecture exists for this project.')
    return saved
  }

  try {
    const response = await api.get(
      `/api/v1/projects/${encodeURIComponent(projectId)}/architecture`,
      { headers: { Authorization: ['Bearer', token].join(' ') } },
    )
    return response.data as SoftwareArchitecture
  } catch (error) {
    if (isOfflineError(error)) {
      const saved = findCurrentDemoArtifact(readDemoArchitectures(), projectId)
      if (saved) return saved
    }
    throw error
  }
}

export async function generateProjectDatabaseDesign(
  token: string,
  project: Project,
): Promise<MongoDatabaseDesign> {
  if (project.requirements.trim().length < 20) {
    throw new Error('Add at least 20 characters of requirements before generating the database design.')
  }
  if (token === DEMO_TOKEN) return createOfflineDatabaseDesign(project)

  try {
    try {
      await fetchProjectTechnologyRecommendation(token, project.id)
    } catch (error) {
      if (!isMissingSavedResult(error, 'recommendation_not_found')) throw error
      await recommendProjectTechnology(token, project)
    }

    try {
      await fetchProjectArchitecture(token, project.id)
    } catch (error) {
      if (!isMissingSavedResult(error, 'architecture_not_found')) throw error
      await generateProjectArchitecture(token, project)
    }

    const response = await api.post(
      `/api/v1/projects/${encodeURIComponent(project.id)}/database-design/generate`,
      {},
      { headers: { Authorization: ['Bearer', token].join(' ') } },
    )
    return response.data as MongoDatabaseDesign
  } catch (error) {
    if (isOfflineError(error)) return createOfflineDatabaseDesign(project)
    throw error
  }
}

function isMissingSavedResult(error: unknown, code: string): boolean {
  return isAxiosError(error)
    && error.response?.status === 404
    && error.response.data?.detail?.code === code
}

function createOfflineDatabaseDesign(project: Project): MongoDatabaseDesign {
  if (!findCurrentDemoArtifact(readDemoTechnologyRecommendations(), project.id, project.requirements)) {
    createDemoTechnologyRecommendation(project)
  }
  if (!findCurrentDemoArtifact(readDemoArchitectures(), project.id, project.requirements)) {
    createDemoArchitecture(project)
  }
  return createDemoDatabaseDesign(project)
}

export async function fetchProjectDatabaseDesign(
  token: string,
  projectId: string,
): Promise<MongoDatabaseDesign> {
  if (token === DEMO_TOKEN) {
    const saved = findCurrentDemoArtifact(readDemoDatabaseDesigns(), projectId)
    if (!saved) throw new Error('No saved MongoDB database design exists for this project.')
    return saved
  }

  try {
    const response = await api.get(
      `/api/v1/projects/${encodeURIComponent(projectId)}/database-design`,
      { headers: { Authorization: ['Bearer', token].join(' ') } },
    )
    return response.data as MongoDatabaseDesign
  } catch (error) {
    if (isOfflineError(error)) {
      const saved = findCurrentDemoArtifact(readDemoDatabaseDesigns(), projectId)
      if (saved) return saved
    }
    throw error
  }
}

export async function generateProjectApiDesign(token: string, project: Project): Promise<RestApiDesign> {
  if (project.requirements.trim().length < 20) {
    throw new Error('Add at least 20 characters of requirements before generating the REST API design.')
  }
  if (token === DEMO_TOKEN) {
    const databaseDesign = await generateProjectDatabaseDesign(token, project)
    return saveDemoApiDesign(createDemoApiDesign(project, databaseDesign))
  }

  try {
    try {
      await fetchProjectDatabaseDesign(token, project.id)
    } catch (error) {
      if (!isMissingSavedResult(error, 'database_design_not_found')) throw error
      await generateProjectDatabaseDesign(token, project)
    }
    const response = await api.post(
      `/api/v1/projects/${encodeURIComponent(project.id)}/api-design/generate`,
      {},
      { headers: { Authorization: ['Bearer', token].join(' ') } },
    )
    return response.data as RestApiDesign
  } catch (error) {
    if (isOfflineError(error)) {
      const databaseDesign = await generateProjectDatabaseDesign(token, project)
      return saveDemoApiDesign(createDemoApiDesign(project, databaseDesign))
    }
    throw error
  }
}

export async function fetchProjectApiDesign(token: string, projectId: string): Promise<RestApiDesign> {
  if (token === DEMO_TOKEN) {
    const saved = findCurrentDemoArtifact(readDemoApiDesigns(), projectId)
    if (!saved) throw new Error('No saved REST API design exists for this project.')
    return saved
  }

  try {
    const response = await api.get(
      `/api/v1/projects/${encodeURIComponent(projectId)}/api-design`,
      { headers: { Authorization: ['Bearer', token].join(' ') } },
    )
    return response.data as RestApiDesign
  } catch (error) {
    if (isOfflineError(error)) {
      const saved = findCurrentDemoArtifact(readDemoApiDesigns(), projectId)
      if (saved) return saved
    }
    throw error
  }
}

export async function generateProjectDiagrams(token: string, project: Project): Promise<ProjectDiagrams> {
  if (project.requirements.trim().length < 20) {
    throw new Error('Add at least 20 characters of project requirements before generating UML diagrams.')
  }
  if (token === DEMO_TOKEN) {
    return regenerateDemoDiagrams(project)
  }

  try {
    try {
      await fetchProjectArchitecture(token, project.id)
    } catch (error) {
      if (!isMissingSavedResult(error, 'architecture_not_found')) throw error
      await generateProjectArchitecture(token, project)
    }
    try {
      await fetchProjectApiDesign(token, project.id)
    } catch (error) {
      if (!isMissingSavedResult(error, 'api_design_not_found')) throw error
      await generateProjectApiDesign(token, project)
    }
    const response = await api.post(
      `/api/v1/projects/${encodeURIComponent(project.id)}/diagrams/generate`,
      {},
      { headers: { Authorization: ['Bearer', token].join(' ') } },
    )
    return response.data as ProjectDiagrams
  } catch (error) {
    if (isOfflineError(error)) {
      return regenerateDemoDiagrams(project)
    }
    throw error
  }
}

export async function fetchProjectDiagrams(token: string, projectId: string, project: Project): Promise<ProjectDiagrams> {
  if (token === DEMO_TOKEN) {
    const saved = findCurrentDemoArtifact(readDemoDiagrams(), projectId)
    if (saved && hasCompleteDiagramSet(saved)) return saved
    return regenerateDemoDiagrams(project)
  }

  try {
    const response = await api.get(
      `/api/v1/projects/${encodeURIComponent(projectId)}/diagrams`,
      { headers: { Authorization: ['Bearer', token].join(' ') } },
    )
    return response.data as ProjectDiagrams
  } catch (error) {
    if (
      isAxiosError(error)
      && error.response?.status === 409
      && error.response.data?.detail?.code === 'diagrams_outdated'
    ) {
      const response = await api.post(
        `/api/v1/projects/${encodeURIComponent(projectId)}/diagrams/generate`,
        {},
        { headers: { Authorization: ['Bearer', token].join(' ') } },
      )
      return response.data as ProjectDiagrams
    }
    if (isOfflineError(error)) {
      const saved = findCurrentDemoArtifact(readDemoDiagrams(), projectId)
      if (saved && hasCompleteDiagramSet(saved)) return saved
      return regenerateDemoDiagrams(project)
    }
    throw error
  }
}

export async function fetchProjectDiagramsForWord(
  token: string,
  project: Project,
): Promise<{ title: string; source: string }[]> {
  const getOrGenerate = async <T,>(
    fetchSaved: () => Promise<T>,
    generate: () => Promise<T>,
    missingCode: string,
    demoMissingMessage: string,
  ): Promise<T> => {
    try {
      return await fetchSaved()
    } catch (error) {
      const demoMissing = token === DEMO_TOKEN
        && error instanceof Error
        && error.message === demoMissingMessage
      if (!demoMissing && !isMissingSavedResult(error, missingCode)) throw error
      return generate()
    }
  }

  const architecture = await getOrGenerate(
    () => fetchProjectArchitecture(token, project.id),
    () => generateProjectArchitecture(token, project),
    'architecture_not_found',
    'No saved software architecture exists for this project.',
  )
  const databaseDesign = await getOrGenerate(
    () => fetchProjectDatabaseDesign(token, project.id),
    () => generateProjectDatabaseDesign(token, project),
    'database_design_not_found',
    'No saved MongoDB database design exists for this project.',
  )
  await getOrGenerate(
    () => fetchProjectApiDesign(token, project.id),
    () => generateProjectApiDesign(token, project),
    'api_design_not_found',
    'No saved REST API design exists for this project.',
  )
  const diagrams = await getOrGenerate(
    () => fetchProjectDiagrams(token, project.id, project),
    () => generateProjectDiagrams(token, project),
    'diagrams_not_found',
    'No saved UML diagrams exist for this project.',
  )

  return [
    { title: 'Software architecture', source: architecture.mermaid_diagram },
    { title: 'MongoDB entity-relationship diagram', source: databaseDesign.mermaid_diagram },
    ...diagrams.diagrams.map((diagram) => ({ title: diagram.title, source: diagram.mermaid_source })),
  ]
}

export async function generateProjectDataset(
  token: string,
  project: Project,
  recordsByCollection: Record<string, number>,
): Promise<SyntheticDataset> {
  if (Object.values(recordsByCollection).some((count) => !Number.isInteger(count) || count < 1 || count > 500)) {
    throw new Error('Choose between 1 and 500 records for each collection.')
  }
  if (token === DEMO_TOKEN) {
    const design = findCurrentDemoArtifact(readDemoDatabaseDesigns(), project.id, project.requirements)
      ?? await generateProjectDatabaseDesign(token, project)
    validateDatasetCounts(design, recordsByCollection)
    return saveDemoDataset(createDemoDataset(project, design, recordsByCollection))
  }

  try {
    let design: MongoDatabaseDesign
    try {
      design = await fetchProjectDatabaseDesign(token, project.id)
    } catch (error) {
      if (!isMissingSavedResult(error, 'database_design_not_found')) throw error
      design = await generateProjectDatabaseDesign(token, project)
    }
    validateDatasetCounts(design, recordsByCollection)
    const response = await api.post(
      `/api/v1/projects/${encodeURIComponent(project.id)}/datasets/generate`,
      { records_by_collection: recordsByCollection },
      { headers: { Authorization: ['Bearer', token].join(' ') } },
    )
    return response.data as SyntheticDataset
  } catch (error) {
    if (isOfflineError(error)) {
      const design = await fetchProjectDatabaseDesign(token, project.id)
      return saveDemoDataset(createDemoDataset(project, design, recordsByCollection))
    }
    throw error
  }
}

function validateDatasetCounts(design: MongoDatabaseDesign, counts: Record<string, number>) {
  const collectionNames = design.collections.map((collection) => collection.name)
  if (collectionNames.some((name) => !Object.hasOwn(counts, name)) || Object.keys(counts).some((name) => !collectionNames.includes(name))) {
    throw new Error('Set a record count for every collection in the saved database design.')
  }
  for (const relationship of design.relationships) {
    if (
      relationship.cardinality.toLowerCase().replace(/\s/g, '') === 'one-to-one'
      && counts[relationship.from_collection] !== counts[relationship.to_collection]
    ) {
      throw new Error(`One-to-one relationship requires equal counts for ${relationship.from_collection} and ${relationship.to_collection}.`)
    }
  }
}

export async function fetchProjectDataset(token: string, projectId: string): Promise<SyntheticDataset> {
  if (token === DEMO_TOKEN) {
    const saved = findCurrentDemoArtifact(readDemoDatasets(), projectId)
    if (!saved) throw new Error('No saved synthetic dataset exists for this project.')
    return saved
  }

  try {
    const response = await api.get(
      `/api/v1/projects/${encodeURIComponent(projectId)}/datasets/latest`,
      { headers: { Authorization: ['Bearer', token].join(' ') } },
    )
    return response.data as SyntheticDataset
  } catch (error) {
    if (isOfflineError(error)) {
      const saved = findCurrentDemoArtifact(readDemoDatasets(), projectId)
      if (saved) return saved
    }
    throw error
  }
}

export async function generateProjectDocumentation(token: string, project: Project, prompt: string): Promise<ProjectDocumentation> {
  if (project.requirements.trim().length < 20) {
    throw new Error('Add at least 20 characters of project requirements before generating documentation.')
  }
  if (prompt.trim().length < 10 || prompt.trim().length > 4000) {
    throw new Error('Describe the documentation you want using 10–4000 characters.')
  }
  if (token === DEMO_TOKEN) return saveDemoDocumentation(createDemoDocumentation(project, prompt.trim()))

  try {
    const response = await api.post(
      `/api/v1/projects/${encodeURIComponent(project.id)}/documentation/generate`,
      { prompt: prompt.trim() },
      { headers: { Authorization: ['Bearer', token].join(' ') } },
    )
    return response.data as ProjectDocumentation
  } catch (error) {
    if (isOfflineError(error)) return saveDemoDocumentation(createDemoDocumentation(project, prompt.trim()))
    throw error
  }
}

export async function fetchProjectDocumentation(token: string, projectId: string): Promise<ProjectDocumentation> {
  if (token === DEMO_TOKEN) {
    const saved = findCurrentDemoArtifact(readDemoDocumentation(), projectId)
    if (!saved) throw new Error('No technical documentation exists for this project.')
    return saved
  }

  try {
    const response = await api.get(
      `/api/v1/projects/${encodeURIComponent(projectId)}/documentation`,
      { headers: { Authorization: ['Bearer', token].join(' ') } },
    )
    return response.data as ProjectDocumentation
  } catch (error) {
    if (isOfflineError(error)) {
      const saved = findCurrentDemoArtifact(readDemoDocumentation(), projectId)
      if (saved) return saved
    }
    throw error
  }
}

function createDemoDocumentation(project: Project, prompt: string): ProjectDocumentation {
  const sourceArtifacts = ['project requirements']
  if (findCurrentDemoArtifact(readDemoTechnologyRecommendations(), project.id, project.requirements)) sourceArtifacts.push('technology recommendations')
  if (findCurrentDemoArtifact(readDemoArchitectures(), project.id, project.requirements)) sourceArtifacts.push('software architecture')
  if (findCurrentDemoArtifact(readDemoDatabaseDesigns(), project.id, project.requirements)) sourceArtifacts.push('MongoDB database design')
  if (findCurrentDemoArtifact(readDemoApiDesigns(), project.id, project.requirements)) sourceArtifacts.push('REST API design')
  const roadmap: DocumentationRoadmapPhase[] = [
    {
      title: '1. Confirm scope and acceptance criteria',
      objective: `Turn the requirements for ${project.name} into testable user stories and release boundaries.`,
      deliverables: ['Prioritized user stories', 'Functional and non-functional acceptance criteria'],
      acceptance_criteria: ['Stakeholders approve the MVP scope', 'Out-of-scope items are recorded'],
    },
    {
      title: '2. Establish the platform foundation',
      objective: 'Create the application structure, environments, authentication, and CI checks.',
      deliverables: ['Frontend and API application skeleton', 'MongoDB connection and indexes', 'CI build and test pipeline'],
      acceptance_criteria: ['Development environments start reproducibly', 'Protected routes reject unauthenticated access'],
    },
    {
      title: '3. Implement core domain workflows',
      objective: 'Deliver the highest-priority user journeys using the approved architecture and data model.',
      deliverables: ['Domain services and user-facing workflows', 'Validated persistence and API contracts'],
      acceptance_criteria: ['Primary user journeys pass integration tests', 'Authorization and ownership rules are enforced'],
    },
    {
      title: '4. Verify, harden, and prepare release',
      objective: 'Validate security, reliability, usability, and operational readiness before deployment.',
      deliverables: ['Automated unit and integration tests', 'Deployment and rollback checklist'],
      acceptance_criteria: ['Critical workflows pass regression tests', 'Production settings are externalized'],
    },
  ]
  const risks: DocumentationRisk[] = [
    {
      category: 'Security and privacy',
      description: 'User data or privileged operations may be exposed if authentication, authorization, and input validation are inconsistent.',
      likelihood: 'Medium',
      impact: 'High',
      mitigation: 'Enforce server-side role and ownership checks, validate requests, hash credentials, and test unauthorized access.',
    },
    {
      category: 'Data integrity',
      description: 'References between MongoDB documents can become inconsistent because MongoDB does not enforce foreign keys.',
      likelihood: 'Medium',
      impact: 'High',
      mitigation: 'Validate referenced IDs in application services and add integration tests for relationship changes.',
    },
    {
      category: 'Scope and requirement gaps',
      description: 'Unspecified edge cases can cause rework or incompatible assumptions between stakeholders and implementation.',
      likelihood: 'Medium',
      impact: 'Medium',
      mitigation: 'Review assumptions, missing information, and acceptance criteria with stakeholders before each release.',
    },
  ]
  const folderStructure = [
    'softarchitect-project/',
    '|-- frontend/',
    '|   |-- src/components/',
    '|   |-- src/features/',
    '|   `-- src/services/',
    '|-- backend/app/',
    '|   |-- api/',
    '|   |-- services/',
    '|   `-- models/',
    '|-- tests/',
    '|-- docker-compose.yml',
    '`-- README.md',
  ].join('\n')
  const normalizedPrompt = prompt.toLowerCase()
  const customSections: ProjectDocumentation['custom_sections'] = []
  if (/(api|endpoint|integration|openapi|rest)/.test(normalizedPrompt)) {
    customSections.push({
      title: 'API implementation details',
      content: 'Refer to the project REST API design for endpoint methods, access roles, request/response schemas, and the OpenAPI contract.',
    })
  }
  if (/(database|data model|collection|schema|mongodb)/.test(normalizedPrompt)) {
    customSections.push({
      title: 'Database implementation details',
      content: 'Refer to the MongoDB database design for collection fields, primary and foreign keys, indexes, relationships, and embedding decisions.',
    })
  }
  if (/(architecture|component|system design|module)/.test(normalizedPrompt)) {
    customSections.push({
      title: 'Architecture implementation details',
      content: 'Refer to the saved architecture for the selected architectural style, component responsibilities, technologies, and connections.',
    })
  }
  if (/(testing|test plan|quality assurance|\\bqa\\b)/.test(normalizedPrompt)) {
    customSections.push({
      title: 'Testing guidance',
      content: 'Validate domain rules with unit tests, API behavior and authorization with integration tests, and critical user journeys with end-to-end regression tests.',
    })
  }
  if (/(deployment|deploy|devops|operations|hosting)/.test(normalizedPrompt)) {
    customSections.push({
      title: 'Deployment guidance',
      content: 'Externalize secrets, deploy with health checks, persist and back up MongoDB data, and maintain a tested rollback procedure.',
    })
  }
  if (!customSections.length) {
    customSections.push({
      title: 'Prompt-specific overview',
      content: 'The requested audience, format, and scope guide this document; factual details are drawn from the project requirements and any saved blueprint artifacts.',
    })
  }
  const roadmapText = roadmap.map((phase) => (
    `### ${phase.title}\n\n${phase.objective}\n\n${phase.deliverables.map((item) => `- ${item}`).join('\n')}`
  )).join('\n\n')
  const riskText = risks.map((risk) => (
    `- **${risk.category} (${risk.likelihood} likelihood, ${risk.impact} impact):** ${risk.description} Mitigation: ${risk.mitigation}`
  )).join('\n')
  const customText = customSections.map((section) => `### ${section.title}\n\n${section.content}`).join('\n\n')
  const markdown = [
    `# ${project.name} — Technical Blueprint`,
    `> ${project.description || `Software blueprint for ${project.name}.`}`,
    '## Documentation request',
    prompt,
    '## Requirements',
    project.requirements || 'No requirements have been recorded.',
    '## Recommended technology',
    'Technology choices are documented in the project technology recommendations.',
    '## Architecture',
    'Architecture components and design decisions are documented in the saved software architecture.',
    '## Data design',
    'MongoDB collections, relationships, indexes, and embedding choices are documented in the database design.',
    '## API design',
    'REST endpoints, roles, and request/response contracts are documented in the API design.',
    '## Development roadmap',
    roadmapText,
    '## Risk register',
    riskText,
    '## Prompt-tailored content',
    customText,
    '## Project structure',
    `\`\`\`text\n${folderStructure}\n\`\`\``,
    '## Deployment and validation',
    '- Externalize secrets and environment-specific settings; do not commit credentials.',
    '- Run backend tests, frontend type-check/build, and authorization tests before release.',
    '- Deploy with health checks, persistent MongoDB storage, backups, and a documented rollback plan.',
  ].join('\n\n')
  return {
    id: crypto.randomUUID(),
    project_id: project.id,
    source_requirements: project.requirements,
    created_at: new Date().toISOString(),
    project_summary: project.description || `Software blueprint for ${project.name}.`,
    generation_prompt: prompt,
    source_artifacts: sourceArtifacts,
    roadmap,
    risks,
    custom_sections: customSections,
    folder_structure: folderStructure,
    markdown,
  }
}

function readDemoDocumentation(): ProjectDocumentation[] {
  const stored = localStorage.getItem(DOCUMENTATION_KEY)
  if (!stored) return []
  try {
    const parsed: unknown = JSON.parse(stored)
    if (!Array.isArray(parsed)) throw new Error('Saved project documentation is invalid.')
    return (parsed as ProjectDocumentation[]).map((documentation) => ({
      ...documentation,
      generation_prompt: documentation.generation_prompt
        ?? 'Create a complete technical blueprint based on the project requirements and available saved artifacts.',
      custom_sections: documentation.custom_sections ?? [],
    }))
  } catch {
    localStorage.removeItem(DOCUMENTATION_KEY)
    return []
  }
}

function saveDemoDocumentation(documentation: ProjectDocumentation): ProjectDocumentation {
  localStorage.setItem(
    DOCUMENTATION_KEY,
    JSON.stringify([
      documentation,
      ...readDemoDocumentation().filter((item) => item.project_id !== documentation.project_id),
    ]),
  )
  return documentation
}

function createDemoDataset(
  project: Project,
  design: MongoDatabaseDesign,
  recordsByCollection: Record<string, number>,
): SyntheticDataset {
  const idValues = new Map(
    design.collections.map((collection) => [
      collection.name,
      Array.from(
        { length: recordsByCollection[collection.name] },
        () => crypto.randomUUID().replace(/-/g, '').slice(0, 24),
      ),
    ]),
  )
  const collections = design.collections.map((collection) => ({
    name: collection.name,
    records: Array.from({ length: recordsByCollection[collection.name] }, (_, index) => {
      const record: Record<string, unknown> = {}
      for (const field of collection.fields) {
        const foreignKey = collection.foreign_keys.find((key) => key.field.split('.', 1)[0] === field.name)
        let value: unknown
        if (field.name === collection.primary_key) {
          value = idValues.get(collection.name)?.[index] ?? ''
        } else if (foreignKey) {
          const references = idValues.get(foreignKey.references_collection) ?? []
          value = references[index % Math.max(1, references.length)] ?? ''
        } else if (field.bson_type.toLowerCase().includes('array')) {
          if (field.name === 'items' && idValues.has('menu_items')) {
            const menuIds = idValues.get('menu_items') ?? []
            value = [{ menu_item_id: menuIds[index % menuIds.length], quantity: index % 4 + 1 }]
          } else {
            value = []
          }
        } else {
          value = demoDatasetValue(field.name, field.bson_type, collection.name, index)
        }
        setDatasetField(record, field.name, value)
      }
      return record
    }),
  }))
  return {
    id: crypto.randomUUID(),
    project_id: project.id,
    source_requirements: project.requirements,
    created_at: new Date().toISOString(),
    project_summary: project.name,
    source_database_design_id: design.id ?? 'demo-database-design',
    version: (findCurrentDemoArtifact(readDemoDatasets(), project.id, project.requirements)?.version ?? 0) + 1,
    records_by_collection: recordsByCollection,
    collections,
  }
}

function demoDatasetValue(fieldName: string, bsonType: string, collectionName: string, index: number): unknown {
  const name = fieldName.toLowerCase()
  if (name.includes('email')) return `user${index + 1}@example.test`
  if (name.includes('password')) return '$argon2id$synthetic$not-for-authentication'
  if (name === 'role') return ['CUSTOMER', 'OWNER', 'DRIVER', 'ADMIN'][index % 4]
  if (name === 'status') return ['pending', 'confirmed', 'in_progress', 'completed'][index % 4]
  if (name === 'name' && collectionName === 'restaurants') return ['Cedar Kitchen', 'Northstar Cafe', 'Copper Spoon'][index % 3]
  if (name === 'name' && collectionName === 'menu_items') return ['Garden bowl', 'Tomato pasta', 'Crispy tofu wrap'][index % 3]
  if (name === 'name') return `Sample User ${index + 1}`
  if (['price', 'amount', 'subtotal'].includes(name) || bsonType.toLowerCase() === 'decimal') return Number((8.5 + index * 3.25).toFixed(2))
  if (['quantity', 'count'].includes(name) || ['int', 'integer', 'long'].includes(bsonType.toLowerCase())) return index % 4 + 1
  if (['bool', 'boolean'].includes(bsonType.toLowerCase())) return index % 5 !== 0
  if (['objectid', 'uuid'].includes(bsonType.toLowerCase())) return crypto.randomUUID().replace(/-/g, '').slice(0, 24)
  if (bsonType.toLowerCase() === 'date' || name.endsWith('_at') || name.endsWith('_date')) {
    return new Date(Date.UTC(2025, 0, index + 1, 12)).toISOString()
  }
  if (name === 'address') {
    return { street: `${100 + index} Market Street`, city: ['Portland', 'Austin', 'Denver'][index % 3], region: 'CA', postal_code: `9000${index}` }
  }
  if (bsonType.toLowerCase() === 'object') return { source: 'synthetic', sequence: index + 1 }
  return `${fieldName.replace(/_/g, ' ')} ${index + 1}`
}

function setDatasetField(record: Record<string, unknown>, dottedName: string, value: unknown) {
  const parts = dottedName.split('.')
  let current = record
  for (const part of parts.slice(0, -1)) {
    const nested = current[part]
    if (!nested || typeof nested !== 'object' || Array.isArray(nested)) current[part] = {}
    current = current[part] as Record<string, unknown>
  }
  current[parts[parts.length - 1]] = value
}

function readDemoDatasets(): SyntheticDataset[] {
  const stored = localStorage.getItem(DATASETS_KEY)
  if (!stored) return []
  try {
    const parsed: unknown = JSON.parse(stored)
    if (!Array.isArray(parsed)) throw new Error('Saved datasets are invalid.')
    return (parsed as SyntheticDataset[]).map((dataset) => ({
      ...dataset,
      version: dataset.version ?? 1,
      records_by_collection: dataset.records_by_collection ?? Object.fromEntries(
        dataset.collections.map((collection) => [collection.name, collection.records.length]),
      ),
    }))
  } catch {
    localStorage.removeItem(DATASETS_KEY)
    return []
  }
}

function saveDemoDataset(dataset: SyntheticDataset): SyntheticDataset {
  localStorage.setItem(
    DATASETS_KEY,
    JSON.stringify([dataset, ...readDemoDatasets().filter((item) => item.project_id !== dataset.project_id)]),
  )
  return dataset
}

function hasCompleteDiagramSet(diagrams: ProjectDiagrams): boolean {
  const types = new Set(diagrams.diagrams.map((diagram) => diagram.diagram_type))
  const erd = diagrams.diagrams.find((diagram) => diagram.diagram_type === 'entity_relationship')?.mermaid_source ?? ''
  return ['use_case', 'sequence', 'class', 'entity_relationship', 'module_hierarchy']
    .every((type) => types.has(type as ProjectDiagrams['diagrams'][number]['diagram_type']))
    && erd.startsWith('flowchart')
    && ['classDef erEntity', 'classDef erRelationship', 'classDef erAttribute', 'classDef erKey']
      .every((marker) => erd.includes(marker))
}

async function regenerateDemoDiagrams(project: Project): Promise<ProjectDiagrams> {
  const savedDatabaseDesign = findCurrentDemoArtifact(readDemoDatabaseDesigns(), project.id, project.requirements)
  const databaseDesign = savedDatabaseDesign?.mermaid_diagram.includes('classDef erEntity')
    ? savedDatabaseDesign
    : await generateProjectDatabaseDesign(DEMO_TOKEN, project)
  const apiDesign = findCurrentDemoArtifact(readDemoApiDesigns(), project.id, project.requirements)
    ?? await generateProjectApiDesign(DEMO_TOKEN, project)
  const architecture = findCurrentDemoArtifact(readDemoArchitectures(), project.id, project.requirements)
    ?? await generateProjectArchitecture(DEMO_TOKEN, project)
  return saveDemoDiagrams(createDemoDiagrams(project, databaseDesign, apiDesign, architecture))
}

function readDemoDiagrams(): ProjectDiagrams[] {
  const stored = localStorage.getItem(DIAGRAMS_KEY)
  if (!stored) return []
  try {
    const parsed: unknown = JSON.parse(stored)
    if (!Array.isArray(parsed)) throw new Error('Saved diagrams are invalid.')
    return parsed as ProjectDiagrams[]
  } catch {
    localStorage.removeItem(DIAGRAMS_KEY)
    return []
  }
}

function saveDemoDiagrams(diagrams: ProjectDiagrams): ProjectDiagrams {
  localStorage.setItem(
    DIAGRAMS_KEY,
    JSON.stringify([diagrams, ...readDemoDiagrams().filter((item) => item.project_id !== diagrams.project_id)]),
  )
  return diagrams
}

function createDemoDiagrams(
  project: Project,
  databaseDesign: MongoDatabaseDesign,
  apiDesign: RestApiDesign,
  architecture: SoftwareArchitecture,
): ProjectDiagrams {
  const roles = [
    ...( /\badmins?\b|\badministrators?\b/i.test(project.requirements) ? ['Administrator'] : []),
    ...( /\bteam leads?\b|\breviewers?\b/i.test(project.requirements) ? ['Team lead'] : []),
    ...( /\bdevelopers?\b|\bengineers?\b|\bprogrammers?\b/i.test(project.requirements) ? ['Developer'] : []),
    ...( /\bworkspace owners?\b/i.test(project.requirements) ? ['Workspace owner'] : []),
    ...( /\bcustomers?\b|\bbuyers?\b|\bclients?\b/i.test(project.requirements) ? ['Customer'] : []),
    ...( /\brestaurant owners?\b|\bowners?\b|\bsellers?\b|\bvendors?\b/i.test(project.requirements) ? ['Business owner'] : []),
    ...( /\bdelivery drivers?\b|\bdrivers?\b/i.test(project.requirements) ? ['Delivery driver'] : []),
  ]
  const actors = roles.length ? roles : ['User']
  const featurePatterns: Array<[RegExp, string]> = [
    [/\b(register|sign up|log ?in|authenticate)\b/i, 'Register and sign in'],
    [/\b(workspaces?|memberships?|invite members?)\b/i, 'Manage workspaces and members'],
    [/\b(projects?|engineering instructions?)\b/i, 'Manage software projects'],
    [/\b(coding tasks?|assign work|task status|tasks?)\b/i, 'Create and manage coding tasks'],
    [/\b(repositories|git repository|connect.*git|git host)\b/i, 'Connect a Git repository'],
    [/\b(agent runs?|run.*agent|AI assistant|AI software engineer)\b/i, 'Run AI engineering workflow'],
    [/\b(proposed changes?|code diffs?|review comments?|approve|reject|code review)\b/i, 'Review and approve proposed changes'],
    [/\b(notifications?|mark.*read)\b/i, 'Review notifications'],
    [/\b(search|browse|discover|catalog|menu)\b/i, 'Browse and search'],
    [/\b(cart|basket|order|booking|reservation)\b/i, 'Manage and place orders'],
    [/\b(payments?|checkout|billing|invoice)\b/i, 'Pay for an order'],
    [/\b(delivery|deliveries|track|tracking)\b/i, 'Track a delivery'],
    [/\b(report|analytics|dashboard)\b/i, 'Review reports'],
    [/\b(notification|email|sms|alert)\b/i, 'Receive notifications'],
    [/\b(manage|update|create|restaurant|menu|product)\b/i, 'Manage business catalog'],
  ]
  const useCases = featurePatterns
    .filter(([pattern]) => pattern.test(project.requirements))
    .map(([, label]) => label)
  const resolvedUseCases = useCases.length ? useCases : ['Complete the core workflow']
  const useCaseLines = [
    'flowchart LR',
    ...actors.map((role, index) => `    Actor${index + 1}["${role}"]`),
    `    subgraph System["${project.name.replace(/[^A-Za-z0-9 .,_/-]/g, '').slice(0, 80) || 'Project'}"]`,
    ...resolvedUseCases.map((useCase, index) => `        UseCase${index + 1}((${useCase}))`),
    '    end',
    ...actors.flatMap((_, actorIndex) =>
      resolvedUseCases.map((__, caseIndex) => `    Actor${actorIndex + 1} --> UseCase${caseIndex + 1}`),
    ),
  ]
  const operations = apiDesign.endpoints
    .filter((endpoint) => ['POST', 'PATCH', 'PUT'].includes(endpoint.method) && !endpoint.path.includes('webhook'))
    .sort((left, right) => operationPriority(left) - operationPriority(right))
    .slice(0, 4)
  const sequenceLines = [
    'sequenceDiagram',
    '    actor User',
    '    participant Web as Web application',
    '    participant API as REST API',
    '    participant DB as MongoDB',
  ]
  for (const [index, endpoint] of operations.entries()) {
    const action = endpoint.summary.replace(/[^A-Za-z0-9 .,_/-]/g, '').slice(0, 80)
    const path = endpoint.path.replace(/[^A-Za-z0-9 .,_/-]/g, '').slice(0, 80)
    sequenceLines.push(
      `    User->>Web: ${action}`,
      `    Web->>API: ${endpoint.method} ${path}`,
      `    API->>DB: Validate and persist operation ${index + 1}`,
      `    DB-->>API: Return operation result ${index + 1}`,
      '    API-->>Web: Return response',
    )
  }
  const classLines = ['classDiagram']
  for (const collection of databaseDesign.collections) {
    const className = collection.name.replace(/[^A-Za-z0-9_]/g, '_')
    classLines.push(`    class ${className} {`)
    for (const field of collection.fields) {
      const name = field.name.replace(/[^A-Za-z0-9_]/g, '_')
      const type = field.bson_type.replace(/[^A-Za-z0-9_]/g, '')
      classLines.push(`        +${type} ${name}`)
    }
    classLines.push('    }')
  }
  for (const collection of databaseDesign.collections) {
    const source = collection.name.replace(/[^A-Za-z0-9_]/g, '_')
    for (const foreignKey of collection.foreign_keys) {
      const target = foreignKey.references_collection.replace(/[^A-Za-z0-9_]/g, '_')
      const label = foreignKey.field.replace(/[^A-Za-z0-9 .,_/-]/g, '').slice(0, 80)
      classLines.push(`    ${target} <|-- ${source} : ${label}`)
    }
  }
  const moduleGroups = new Map<string, ArchitectureComponent[]>()
  for (const component of architecture.components) {
    const group = moduleGroups.get(component.component_type) ?? []
    group.push(component)
    moduleGroups.set(component.component_type, group)
  }
  const hierarchyLines = [
    'flowchart TB',
    `    Project["${project.name.replace(/[^A-Za-z0-9 .,_/-]/g, '').slice(0, 80) || 'Project'}"]`,
  ]
  for (const [groupIndex, [groupName, components]] of [...moduleGroups.entries()].entries()) {
    const groupId = `Group${groupIndex + 1}`
    hierarchyLines.push(`    ${groupId}["${groupName.replace(/[^A-Za-z0-9 .,_/-]/g, '').slice(0, 80)}"]`)
    hierarchyLines.push(`    Project --> ${groupId}`)
    for (const [componentIndex, component] of components.entries()) {
      const componentId = `Module${groupIndex + 1}_${componentIndex + 1}`
      const label = component.name.replace(/[^A-Za-z0-9 .,_/-]/g, '').slice(0, 80)
      hierarchyLines.push(`    ${componentId}["${label}"]`)
      hierarchyLines.push(`    ${groupId} --> ${componentId}`)
    }
  }
  return {
    project_id: project.id,
    source_requirements: project.requirements,
    created_at: new Date().toISOString(),
    project_summary: `UML and workflow diagrams for ${project.name}, derived from its requirements, saved API contract, and MongoDB design.`,
    diagrams: [
      { diagram_type: 'use_case', title: 'Use-case diagram', description: 'Project actors and capabilities identified in the requirements.', mermaid_source: useCaseLines.join('\n') },
      { diagram_type: 'sequence', title: 'Request sequence diagram', description: 'Representative API operations flowing through the web application to MongoDB.', mermaid_source: sequenceLines.join('\n') },
      { diagram_type: 'class', title: 'Domain class diagram', description: 'MongoDB collections, declared fields, and logical references.', mermaid_source: classLines.join('\n') },
      { diagram_type: 'entity_relationship', title: 'Entity-Relationship diagram', description: 'Chen notation: entity rectangles, relationship diamonds, attribute ovals, and 1/N cardinalities.', mermaid_source: buildChenEntityRelationshipDiagram(databaseDesign.collections, databaseDesign.relationships) },
      { diagram_type: 'module_hierarchy', title: 'Module hierarchy', description: 'Architecture components grouped by their responsibility and system layer.', mermaid_source: hierarchyLines.join('\n') },
    ],
    design_decisions: [
      'Use-case actors and capabilities are selected from requirement keywords.',
      'The sequence diagram uses saved API operations and shows the application boundary before database access.',
      'The class diagram represents MongoDB documents and logical references; MongoDB does not enforce these references.',
      'The Chen-style ER diagram uses rectangles for entities, diamonds for relationships, ovals for attributes, and 1/N cardinalities; PK and FK prefixes identify key attributes.',
      'The module hierarchy groups saved architecture components by responsibility.',
    ],
  }
}

function operationPriority(endpoint: ApiEndpoint): number {
  if (endpoint.path === '/api/v1/orders' && endpoint.method === 'POST') return 0
  if (endpoint.path.startsWith('/api/v1/orders')) return 1
  if (endpoint.path.startsWith('/api/v1/payments')) return 2
  if (endpoint.path.startsWith('/api/v1/deliveries')) return 3
  if (endpoint.path.startsWith('/api/v1/auth')) return 5
  return 4
}

function readDemoApiDesigns(): RestApiDesign[] {
  const stored = localStorage.getItem(API_DESIGNS_KEY)
  if (!stored) return []
  try {
    const parsed: unknown = JSON.parse(stored)
    if (!Array.isArray(parsed)) throw new Error('Saved API designs are invalid.')
    return parsed as RestApiDesign[]
  } catch {
    localStorage.removeItem(API_DESIGNS_KEY)
    return []
  }
}

function saveDemoApiDesign(design: RestApiDesign): RestApiDesign {
  const designs = readDemoApiDesigns()
  localStorage.setItem(
    API_DESIGNS_KEY,
    JSON.stringify([design, ...designs.filter((item) => item.project_id !== design.project_id)]),
  )
  return design
}

function createDemoApiDesign(project: Project, databaseDesign: MongoDatabaseDesign): RestApiDesign {
  const endpoints: ApiEndpoint[] = [
    {
      method: 'POST', path: '/api/v1/auth/register', summary: 'Register an account',
      description: 'Create an account and return an authenticated session.', auth_required: false, roles: [],
      request_fields: [
        { name: 'name', data_type: 'string', required: true, description: 'Display name.' },
        { name: 'email', data_type: 'string', required: true, description: 'Unique email address.' },
        { name: 'password', data_type: 'string', required: true, description: 'Password meeting account policy.' },
      ],
      responses: [{ status_code: 201, description: 'Account created.', fields: [{ name: 'access_token', data_type: 'string', required: true, description: 'JWT access token.' }] }],
    },
    {
      method: 'POST', path: '/api/v1/auth/login', summary: 'Authenticate an account',
      description: 'Verify credentials and return a bearer access token.', auth_required: false, roles: [],
      request_fields: [
        { name: 'email', data_type: 'string', required: true, description: 'Registered email address.' },
        { name: 'password', data_type: 'string', required: true, description: 'Account password.' },
      ],
      responses: [{ status_code: 200, description: 'Credentials accepted.', fields: [{ name: 'access_token', data_type: 'string', required: true, description: 'JWT access token.' }] }],
    },
    {
      method: 'GET', path: '/api/v1/auth/me', summary: 'Get the current account',
      description: "Return the authenticated user's safe profile.", auth_required: true, roles: ['USER', 'ADMIN'],
      request_fields: [], responses: [{ status_code: 200, description: 'Current account profile.', fields: [{ name: 'id', data_type: 'string', required: true, description: 'Account identifier.' }] }],
    },
  ]
  const resources = databaseDesign.collections.filter((collection) => ![
    'requirements', 'technology_recommendations', 'architectures', 'database_designs',
    'api_designs', 'datasets', 'dataset_versions', 'documentation', 'audit_logs',
  ].includes(collection.name))
  for (const collection of resources) {
    const resourcePath = collection.name.replaceAll('_', '-')
    const label = collection.name.replaceAll('_', ' ').replace(/s$/, '')
    const rolesByCollection: Record<string, string[]> = {
      agent_runs: ['DEVELOPER', 'TEAM_LEAD', 'ADMIN'],
      notifications: ['USER', 'ADMIN'],
      proposed_changes: ['DEVELOPER', 'TEAM_LEAD', 'ADMIN'],
      repository_connections: ['TEAM_LEAD', 'ADMIN'],
      review_comments: ['DEVELOPER', 'TEAM_LEAD', 'ADMIN'],
      reviews: ['TEAM_LEAD', 'ADMIN'],
      tasks: ['DEVELOPER', 'TEAM_LEAD', 'ADMIN'],
      workspaces: ['WORKSPACE_OWNER', 'TEAM_LEAD', 'ADMIN'],
      workspace_memberships: ['WORKSPACE_OWNER', 'TEAM_LEAD', 'ADMIN'],
    }
    const roles = rolesByCollection[collection.name] ?? (collection.name === 'users' ? ['ADMIN'] : ['USER', 'ADMIN'])
    const requestFields = collection.fields
      .filter((field) => field.name !== collection.primary_key && field.name !== 'password_hash')
      .map((field) => ({
        name: field.name,
        data_type: field.bson_type,
        required: field.required,
        description: field.description,
      }))
    endpoints.push({
      method: 'GET', path: `/api/v1/${resourcePath}`, summary: `List ${collection.name.replaceAll('_', ' ')}`,
      description: `Return a paginated list of ${collection.name.replaceAll('_', ' ')} visible to the current account.`,
      auth_required: true, roles,
      request_fields: [
        { name: 'page', data_type: 'integer', required: false, description: '1-based page number.' },
        { name: 'limit', data_type: 'integer', required: false, description: 'Page size, maximum 100.' },
      ],
      responses: [{ status_code: 200, description: 'Paginated resource collection.', fields: [{ name: 'items', data_type: 'array<object>', required: true, description: 'Page of resources.' }] }],
    })
    endpoints.push({
      method: 'POST', path: `/api/v1/${resourcePath}`, summary: `Create ${label}`,
      description: `Create a ${label} after validating fields and referenced resources.`,
      auth_required: true, roles, request_fields: requestFields,
      responses: [{ status_code: 201, description: 'Resource created.', fields: [{ name: 'id', data_type: 'string', required: true, description: 'Created resource identifier.' }] }],
    })
    endpoints.push({
      method: 'GET', path: `/api/v1/${resourcePath}/{resource_id}`, summary: `Get ${label}`,
      description: `Return one ${label} when the account has access to it.`,
      auth_required: true, roles, request_fields: [],
      responses: [{ status_code: 200, description: 'Resource returned.', fields: [{ name: 'id', data_type: 'string', required: true, description: 'Resource identifier.' }] }],
    })
    endpoints.push({
      method: 'PATCH', path: `/api/v1/${resourcePath}/{resource_id}`, summary: `Update ${label}`,
      description: `Update allowed ${label} fields after checking ownership and role permissions.`,
      auth_required: true, roles, request_fields: requestFields.map((field) => ({ ...field, required: false })),
      responses: [{ status_code: 200, description: 'Resource updated.', fields: [{ name: 'id', data_type: 'string', required: true, description: 'Resource identifier.' }] }],
    })
    endpoints.push({
      method: 'DELETE', path: `/api/v1/${resourcePath}/{resource_id}`, summary: `Delete ${label}`,
      description: `Delete a ${label} only when permitted by resource lifecycle rules.`,
      auth_required: true, roles, request_fields: [],
      responses: [{ status_code: 204, description: 'Resource deleted.', fields: [] }],
    })
  }
  const requirements = project.requirements.toLowerCase()
  if (/\bpayment|\bcheckout|\bbilling/.test(requirements)) {
    endpoints.push({
      method: 'POST', path: '/api/v1/payments/checkout', summary: 'Create a payment checkout',
      description: 'Create a hosted payment checkout for an authorized order.',
      auth_required: true, roles: ['CUSTOMER'],
      request_fields: [{ name: 'order_id', data_type: 'ObjectId', required: true, description: 'Order to pay for.' }],
      responses: [{ status_code: 201, description: 'Hosted checkout created.', fields: [{ name: 'checkout_url', data_type: 'string', required: true, description: 'Hosted checkout URL.' }, { name: 'payment_id', data_type: 'ObjectId', required: true, description: 'Payment record identifier.' }] }],
    })
    endpoints.push({
      method: 'POST', path: '/api/v1/payments/webhooks/{provider}', summary: 'Receive a payment provider event',
      description: 'Verify the provider signature and process the event idempotently.',
      auth_required: false, roles: [],
      request_fields: [{ name: 'signature', data_type: 'string', required: true, description: 'Provider webhook signature.' }],
      responses: [{ status_code: 200, description: 'Event accepted.', fields: [{ name: 'received', data_type: 'boolean', required: true, description: 'Whether the event was accepted.' }] }],
    })
  }
  if (/\bdelivery|\bdeliveries|\btrack/.test(requirements)) {
    endpoints.push({
      method: 'PATCH', path: '/api/v1/deliveries/{delivery_id}/status', summary: 'Update delivery status',
      description: 'Allow the assigned driver to advance a delivery through valid lifecycle states.',
      auth_required: true, roles: ['DELIVERY_DRIVER', 'ADMIN'],
      request_fields: [{ name: 'status', data_type: 'string', required: true, description: 'Next valid delivery status.' }],
      responses: [{ status_code: 200, description: 'Delivery status updated.', fields: [{ name: 'id', data_type: 'ObjectId', required: true, description: 'Delivery identifier.' }, { name: 'status', data_type: 'string', required: true, description: 'Current delivery status.' }] }],
    })
  }
  const createdAt = new Date().toISOString()
  const apiTitle = `${project.name} API`
  const design: RestApiDesign = {
    project_id: project.id,
    source_requirements: project.requirements,
    created_at: createdAt,
    project_summary: `Versioned REST API for ${project.name}, derived from the validated MongoDB collection design.`,
    api_title: apiTitle,
    version: '1.0.0',
    base_path: '/api/v1',
    authentication: 'JWT bearer access token using the Authorization header.',
    endpoints,
    design_decisions: [
      'Use versioned REST paths under /api/v1 and JSON request and response bodies.',
      'Require JWT authentication for account and business data; enforce role permissions and resource ownership in the API.',
      'Use pagination for list operations and cap page size to protect service resources.',
      'Validate payloads and MongoDB references server-side; never trust client-provided ownership identifiers.',
      'Return consistent validation, authentication, authorization, and not-found errors.',
    ],
    openapi_spec: {},
  }
  const paths: Record<string, Record<string, unknown>> = {}
  for (const endpoint of endpoints) {
    const operation: Record<string, unknown> = {
      operationId: `${endpoint.method}_${endpoint.path}`.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '').toLowerCase(),
      summary: endpoint.summary,
      description: endpoint.description,
      tags: [endpoint.path.split('/')[3].replaceAll('-', ' ').replace(/\b\w/g, (character) => character.toUpperCase())],
      responses: Object.fromEntries(endpoint.responses.map((response) => [
        String(response.status_code),
        {
          description: response.description,
          ...(response.fields.length ? {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: Object.fromEntries(response.fields.map((field) => [field.name, openApiSchema(field.data_type)])),
                },
              },
            },
          } : {}),
        },
      ])),
    }
    if (endpoint.auth_required) operation.security = [{ BearerAuth: [] }]
    if (endpoint.roles.length) operation['x-required-roles'] = endpoint.roles
    const pathParameters = [...endpoint.path.matchAll(/\{([^}]+)\}/g)].map((match) => ({
      name: match[1],
      in: 'path',
      required: true,
      schema: { type: 'string' },
    }))
    const queryParameters = endpoint.method === 'GET'
      ? endpoint.request_fields.filter((field) => field.name === 'page' || field.name === 'limit').map((field) => ({
          name: field.name,
          in: 'query',
          required: field.required,
          description: field.description,
          schema: openApiSchema(field.data_type),
        }))
      : []
    if (pathParameters.length || queryParameters.length) operation.parameters = [...pathParameters, ...queryParameters]
    if (endpoint.request_fields.length && ['POST', 'PUT', 'PATCH'].includes(endpoint.method)) {
      operation.requestBody = {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: endpoint.request_fields.filter((field) => field.required).map((field) => field.name),
              properties: Object.fromEntries(endpoint.request_fields.map((field) => [
                field.name,
                { ...openApiSchema(field.data_type), description: field.description },
              ])),
            },
          },
        },
      }
    }
    paths[endpoint.path] = { ...paths[endpoint.path], [endpoint.method.toLowerCase()]: operation }
  }
  design.openapi_spec = {
    openapi: '3.0.3',
    info: { title: apiTitle, version: design.version, description: design.project_summary },
    servers: [{ url: '/' }],
    paths,
    components: { securitySchemes: { BearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } },
  }
  return design
}

function openApiSchema(dataType: string): Record<string, unknown> {
  const normalizedType = dataType.toLowerCase()
  if (normalizedType.startsWith('array')) return { type: 'array', items: { type: 'object' } }
  if (normalizedType === 'object' || normalizedType === 'document' || normalizedType === 'dict') return { type: 'object' }
  if (normalizedType === 'integer' || normalizedType === 'int') return { type: 'integer' }
  if (normalizedType === 'number' || normalizedType === 'float' || normalizedType === 'double') return { type: 'number' }
  if (normalizedType === 'boolean' || normalizedType === 'bool') return { type: 'boolean' }
  return { type: 'string' }
}

function readDemoDatabaseDesigns(): MongoDatabaseDesign[] {
  try {
    const stored = localStorage.getItem(DATABASE_DESIGNS_KEY)
    if (!stored) return []
    const designs = JSON.parse(stored) as MongoDatabaseDesign[]
    return designs.map((design) => ({
      ...design,
      collections: design.collections.map((collection) => ({
        ...collection,
        primary_key: collection.primary_key ?? '_id',
        foreign_keys: collection.foreign_keys ?? legacyForeignKeys(collection.name),
      })),
    }))
  } catch {
    localStorage.removeItem(DATABASE_DESIGNS_KEY)
    return []
  }
}

function legacyForeignKeys(collectionName: string): CollectionDesign['foreign_keys'] {
  const knownReferences: Record<string, CollectionDesign['foreign_keys']> = {
    restaurants: [{ field: 'owner_id', references_collection: 'users', references_field: '_id', description: 'Restaurant owner account.' }],
    menu_items: [{ field: 'restaurant_id', references_collection: 'restaurants', references_field: '_id', description: 'Parent restaurant.' }],
    orders: [
      { field: 'customer_id', references_collection: 'users', references_field: '_id', description: 'Customer who placed the order.' },
      { field: 'restaurant_id', references_collection: 'restaurants', references_field: '_id', description: 'Restaurant fulfilling the order.' },
      { field: 'items.menu_item_id', references_collection: 'menu_items', references_field: '_id', description: 'Original menu item for each embedded order line, when retained.' },
    ],
    carts: [
      { field: 'customer_id', references_collection: 'users', references_field: '_id', description: 'Customer who owns the active cart.' },
      { field: 'items.menu_item_id', references_collection: 'menu_items', references_field: '_id', description: 'Menu item referenced by each cart line.' },
    ],
    payments: [{ field: 'order_id', references_collection: 'orders', references_field: '_id', description: 'Order this payment attempt belongs to.' }],
    deliveries: [
      { field: 'order_id', references_collection: 'orders', references_field: '_id', description: 'Order being delivered.' },
      { field: 'driver_id', references_collection: 'users', references_field: '_id', description: 'Assigned driver account, when assigned.' },
    ],
    notifications: [{ field: 'recipient_id', references_collection: 'users', references_field: '_id', description: 'Notification recipient account.' }],
    audit_logs: [{ field: 'actor_id', references_collection: 'users', references_field: '_id', description: 'Actor account when the action was performed by a user.' }],
  }
  return knownReferences[collectionName] ?? []
}

function createDemoDatabaseDesign(project: Project): MongoDatabaseDesign {
  const architecture = findCurrentDemoArtifact(
    readDemoArchitectures(),
    project.id,
    project.requirements,
  )
  if (!architecture) throw new Error('Generate and save the software architecture before the MongoDB database design.')

  const text = `${project.requirements} ${architecture.components.map((component) => component.name).join(' ')}`.toLowerCase()
  if (/\b(repositor(?:y|ies)|agent runs?|proposed (?:code )?changes?|coding tasks?|workspace memberships?|AI software engineer(?:ing)?)\b/i.test(project.requirements)) {
    return createDeveloperPlatformDatabaseDesign(project)
  }
  const field = (name: string, bson_type: string, required: boolean, description: string): DatabaseField => ({
    name, bson_type, required, description,
  })
  const collections: CollectionDesign[] = [
    {
      name: 'users',
      purpose: 'Customer, operator, driver, and administrator identity and profile records.',
      primary_key: '_id',
      foreign_keys: [],
      fields: [
        field('_id', 'ObjectId', true, 'MongoDB document identifier.'),
        field('name', 'string', true, 'Display name.'),
        field('email', 'string', true, 'Normalized unique sign-in address.'),
        field('password_hash', 'string', true, 'Argon2 or bcrypt hash; never store a raw password.'),
        field('role', 'string', true, 'Role used for server-side authorization.'),
        field('created_at', 'date', true, 'Creation timestamp.'),
        field('updated_at', 'date', true, 'Last update timestamp.'),
      ],
      indexes: ['unique: email', 'role'],
      embedding_strategy: 'Store profile attributes with the user. Keep high-volume activity such as orders in separate collections.',
    },
    {
      name: 'restaurants',
      purpose: 'Restaurant profile, ownership, address, and operating state.',
      primary_key: '_id',
      foreign_keys: [{ field: 'owner_id', references_collection: 'users', references_field: '_id', description: 'Restaurant owner account.' }],
      fields: [
        field('_id', 'ObjectId', true, 'MongoDB document identifier.'),
        field('owner_id', 'ObjectId', true, 'Reference to users._id for the restaurant owner.'),
        field('name', 'string', true, 'Restaurant name.'),
        field('description', 'string', false, 'Restaurant description.'),
        field('address', 'object', true, 'Embedded structured address.'),
        field('status', 'string', true, 'Review and availability status.'),
        field('created_at', 'date', true, 'Creation timestamp.'),
        field('updated_at', 'date', true, 'Last update timestamp.'),
      ],
      indexes: ['owner_id', 'status', 'text: name, description'],
      embedding_strategy: 'Embed the bounded address value object; keep menu items separate so they can be independently queried and updated.',
    },
    {
      name: 'menu_items',
      purpose: 'Searchable restaurant menu items, prices, and availability.',
      primary_key: '_id',
      foreign_keys: [{ field: 'restaurant_id', references_collection: 'restaurants', references_field: '_id', description: 'Parent restaurant.' }],
      fields: [
        field('_id', 'ObjectId', true, 'MongoDB document identifier.'),
        field('restaurant_id', 'ObjectId', true, 'Reference to restaurants._id.'),
        field('name', 'string', true, 'Menu item name.'),
        field('description', 'string', false, 'Menu item description.'),
        field('price', 'decimal', true, 'Price stored as Decimal128 with currency.'),
        field('currency', 'string', true, 'ISO 4217 currency code.'),
        field('is_available', 'bool', true, 'Whether customers can order the item.'),
        field('created_at', 'date', true, 'Creation timestamp.'),
        field('updated_at', 'date', true, 'Last update timestamp.'),
      ],
      indexes: ['restaurant_id, is_available', 'text: name, description'],
      embedding_strategy: 'Keep menu items separate to support menu search, availability changes, and restaurant-level pagination.',
    },
    {
      name: 'orders',
      purpose: 'Order lifecycle and immutable snapshots of ordered items and prices.',
      primary_key: '_id',
      foreign_keys: [
        { field: 'customer_id', references_collection: 'users', references_field: '_id', description: 'Customer who placed the order.' },
        { field: 'restaurant_id', references_collection: 'restaurants', references_field: '_id', description: 'Restaurant fulfilling the order.' },
        { field: 'items.menu_item_id', references_collection: 'menu_items', references_field: '_id', description: 'Original menu item for each embedded order line, when retained.' },
      ],
      fields: [
        field('_id', 'ObjectId', true, 'MongoDB document identifier.'),
        field('customer_id', 'ObjectId', true, 'Reference to users._id.'),
        field('restaurant_id', 'ObjectId', true, 'Reference to restaurants._id.'),
        field('items', 'array<object>', true, 'Bounded item snapshots with menu_item_id, name, quantity, unit_price, and currency.'),
        field('delivery_address', 'object', true, 'Address snapshot so later profile edits do not change an order.'),
        field('status', 'string', true, 'Validated order-state value.'),
        field('subtotal', 'decimal', true, 'Order subtotal stored as Decimal128.'),
        field('created_at', 'date', true, 'Creation timestamp.'),
        field('updated_at', 'date', true, 'Last update timestamp.'),
      ],
      indexes: ['customer_id, created_at DESC', 'restaurant_id, status, created_at DESC'],
      embedding_strategy: 'Embed a bounded immutable line-item and delivery-address snapshot; reference user and restaurant documents.',
    },
  ]
  const relationships: DatabaseRelationship[] = [
    { from_collection: 'restaurants', to_collection: 'users', cardinality: 'many-to-one', description: 'Each restaurant has one owner; an owner may manage multiple restaurants.' },
    { from_collection: 'menu_items', to_collection: 'restaurants', cardinality: 'many-to-one', description: 'Each menu item belongs to one restaurant.' },
    { from_collection: 'orders', to_collection: 'users', cardinality: 'many-to-one', description: 'Each order belongs to one customer.' },
    { from_collection: 'orders', to_collection: 'restaurants', cardinality: 'many-to-one', description: 'Each order is placed with one restaurant.' },
  ]
  const addCollection = (collection: CollectionDesign, relations: DatabaseRelationship[] = []) => {
    if (!collections.some((item) => item.name === collection.name)) {
      collections.push(collection)
      relationships.push(...relations)
    }
  }

  if (/\b(cart|shopping cart)\b/.test(text)) {
    addCollection({
      name: 'carts',
      purpose: 'Active customer carts before checkout.',
      primary_key: '_id',
      foreign_keys: [
        { field: 'customer_id', references_collection: 'users', references_field: '_id', description: 'Customer who owns the active cart.' },
        { field: 'items.menu_item_id', references_collection: 'menu_items', references_field: '_id', description: 'Menu item referenced by each cart line.' },
      ],
      fields: [
        field('_id', 'ObjectId', true, 'MongoDB document identifier.'),
        field('customer_id', 'ObjectId', true, 'Reference to users._id.'),
        field('items', 'array<object>', true, 'Menu item references and current quantities.'),
        field('updated_at', 'date', true, 'Last cart update timestamp.'),
        field('expires_at', 'date', true, 'Expiry time for abandoned-cart cleanup.'),
      ],
      indexes: ['unique: customer_id', 'TTL: expires_at'],
      embedding_strategy: 'Embed the small bounded set of active cart lines; revalidate menu availability and prices at checkout.',
    }, [{ from_collection: 'carts', to_collection: 'users', cardinality: 'one-to-one', description: 'Each active cart belongs to one customer.' }])
  }
  if (/\b(payment|payments|checkout|billing|invoice)\b/.test(text)) {
    addCollection({
      name: 'payments',
      purpose: 'Payment provider references and payment lifecycle; never store card numbers or security codes.',
      primary_key: '_id',
      foreign_keys: [{ field: 'order_id', references_collection: 'orders', references_field: '_id', description: 'Order this payment attempt belongs to.' }],
      fields: [
        field('_id', 'ObjectId', true, 'MongoDB document identifier.'),
        field('order_id', 'ObjectId', true, 'Reference to orders._id.'),
        field('provider', 'string', true, 'Payment provider identifier.'),
        field('provider_payment_id', 'string', false, 'Opaque reference returned by the provider.'),
        field('amount', 'decimal', true, 'Payment amount as Decimal128.'),
        field('currency', 'string', true, 'ISO 4217 currency code.'),
        field('status', 'string', true, 'Payment state updated from verified provider responses.'),
        field('created_at', 'date', true, 'Creation timestamp.'),
        field('updated_at', 'date', true, 'Last update timestamp.'),
      ],
      indexes: ['order_id', 'provider_payment_id', 'status, created_at DESC'],
      embedding_strategy: 'Keep payment lifecycle isolated from order documents; only persist minimal non-sensitive provider references.',
    }, [{ from_collection: 'payments', to_collection: 'orders', cardinality: 'many-to-one', description: 'An order can have multiple payment attempts or adjustments.' }])
  }
  if (/\b(delivery|driver|tracking)\b/.test(text)) {
    addCollection({
      name: 'deliveries',
      purpose: 'Driver assignment and delivery status timeline.',
      primary_key: '_id',
      foreign_keys: [
        { field: 'order_id', references_collection: 'orders', references_field: '_id', description: 'Order being delivered.' },
        { field: 'driver_id', references_collection: 'users', references_field: '_id', description: 'Assigned driver account, when assigned.' },
      ],
      fields: [
        field('_id', 'ObjectId', true, 'MongoDB document identifier.'),
        field('order_id', 'ObjectId', true, 'Reference to orders._id.'),
        field('driver_id', 'ObjectId', false, 'Reference to users._id for the assigned driver.'),
        field('status', 'string', true, 'Validated delivery-state value.'),
        field('status_history', 'array<object>', true, 'Bounded status changes with actor and timestamp.'),
        field('created_at', 'date', true, 'Creation timestamp.'),
        field('updated_at', 'date', true, 'Last update timestamp.'),
      ],
      indexes: ['order_id', 'driver_id, status', 'updated_at DESC'],
      embedding_strategy: 'Embed a bounded status timeline in the delivery; consider a separate event collection if history volume becomes unbounded.',
    }, [
      { from_collection: 'deliveries', to_collection: 'orders', cardinality: 'one-to-one', description: 'A delivery record tracks one order.' },
      { from_collection: 'deliveries', to_collection: 'users', cardinality: 'many-to-one', description: 'A driver can be assigned multiple deliveries.' },
    ])
  }
  if (/\b(notification|email|sms|alert)\b/.test(text)) {
    addCollection({
      name: 'notifications',
      purpose: 'Queued and delivered customer or operator notifications.',
      primary_key: '_id',
      foreign_keys: [{ field: 'recipient_id', references_collection: 'users', references_field: '_id', description: 'Notification recipient account.' }],
      fields: [
        field('_id', 'ObjectId', true, 'MongoDB document identifier.'),
        field('recipient_id', 'ObjectId', true, 'Reference to users._id.'),
        field('event_type', 'string', true, 'Business event that caused the notification.'),
        field('channel', 'string', true, 'Delivery channel such as email or SMS.'),
        field('status', 'string', true, 'queued, sent, retrying, or failed.'),
        field('attempt_count', 'int', true, 'Number of delivery attempts.'),
        field('created_at', 'date', true, 'Creation timestamp.'),
        field('updated_at', 'date', true, 'Last update timestamp.'),
      ],
      indexes: ['recipient_id, created_at DESC', 'status, updated_at'],
      embedding_strategy: 'Store notifications separately for retry processing and recipient history; avoid storing unnecessary message secrets.',
    }, [{ from_collection: 'notifications', to_collection: 'users', cardinality: 'many-to-one', description: 'A user may receive multiple notifications.' }])
  }
  if (/\b(report|analytics|audit|administrator|admin)\b/.test(text)) {
    addCollection({
      name: 'audit_logs',
      purpose: 'Security-relevant actor and resource changes for audit and troubleshooting.',
      primary_key: '_id',
      foreign_keys: [{ field: 'actor_id', references_collection: 'users', references_field: '_id', description: 'Actor account when the action was performed by a user.' }],
      fields: [
        field('_id', 'ObjectId', true, 'MongoDB document identifier.'),
        field('actor_id', 'ObjectId', false, 'Authenticated user who performed the action, when applicable.'),
        field('action', 'string', true, 'Stable action code.'),
        field('resource_type', 'string', true, 'Resource category.'),
        field('resource_id', 'ObjectId', false, 'Affected resource identifier.'),
        field('occurred_at', 'date', true, 'Event timestamp.'),
        field('metadata', 'object', false, 'Allow-listed non-sensitive context; never copy passwords, tokens, or payment data.'),
      ],
      indexes: ['actor_id, occurred_at DESC', 'resource_type, resource_id, occurred_at DESC'],
      embedding_strategy: 'Use append-only records with retention controls; keep sensitive payloads out of audit metadata.',
    })
  }

  const design: MongoDatabaseDesign = {
    project_id: project.id,
    source_requirements: project.requirements,
    created_at: new Date().toISOString(),
    project_summary: `MongoDB document model for ${project.name}, derived from its functional workflows and generated architecture.`,
    database_name: 'softarchitect_ai',
    collections,
    relationships,
    design_decisions: [
      'Declare _id as each collection primary key and use ObjectId fields as logical foreign-key references.',
      'MongoDB does not enforce relational foreign keys automatically; validate referenced IDs and ownership in application services.',
      'Embed bounded value objects and immutable order line-item snapshots; avoid unbounded arrays in long-lived documents.',
      'Store monetary values as Decimal128 with an explicit ISO currency code; never use floating-point arithmetic for money.',
      'Normalize emails and enforce a unique users.email index; create query indexes that align with owner, status, and chronological access patterns.',
      'Never store plaintext passwords, raw payment card data, authentication tokens, or unnecessary personal information.',
      'Apply schema validation, retention policies, and reviewed state transitions before production writes.',
    ],
    mermaid_diagram: buildChenEntityRelationshipDiagram(collections, relationships),
  }
  localStorage.setItem(
    DATABASE_DESIGNS_KEY,
    JSON.stringify([design, ...readDemoDatabaseDesigns().filter((item) => item.project_id !== project.id)]),
  )
  return design
}

function createDeveloperPlatformDatabaseDesign(project: Project): MongoDatabaseDesign {
  const field = (name: string, bson_type: string, required: boolean, description: string): DatabaseField => ({
    name, bson_type, required, description,
  })
  const definitions: Array<{
    name: string
    purpose: string
    references: Array<{ field: string; target: string; description: string }>
    fields: DatabaseField[]
    indexes: string[]
    embedding_strategy: string
  }> = [
    {
      name: 'users',
      purpose: 'Developer, team lead, and administrator accounts.',
      references: [],
      fields: [
        field('_id', 'ObjectId', true, 'MongoDB document primary key.'),
        field('name', 'string', true, 'Display name.'),
        field('email', 'string', true, 'Normalized unique sign-in address.'),
        field('password_hash', 'string', true, 'Password hash; never store a raw password.'),
        field('role', 'string', true, 'Global account role.'),
        field('created_at', 'date', true, 'Creation timestamp.'),
        field('updated_at', 'date', true, 'Last update timestamp.'),
      ],
      indexes: ['unique: email', 'role'],
      embedding_strategy: 'Keep identity and authentication attributes on the user document.',
    },
    {
      name: 'workspaces',
      purpose: 'Shared team spaces containing memberships and software projects.',
      references: [{ field: 'owner_id', target: 'users', description: 'Workspace owner.' }],
      fields: [
        field('_id', 'ObjectId', true, 'MongoDB document primary key.'),
        field('owner_id', 'ObjectId', true, 'Reference to users._id.'),
        field('name', 'string', true, 'Workspace name.'),
        field('settings', 'object', false, 'Workspace-level configuration.'),
        field('created_at', 'date', true, 'Creation timestamp.'),
        field('updated_at', 'date', true, 'Last update timestamp.'),
      ],
      indexes: ['owner_id', 'created_at DESC'],
      embedding_strategy: 'Keep bounded settings embedded and memberships in a separate collection.',
    },
    {
      name: 'workspace_memberships',
      purpose: 'Workspace membership, invitation state, and member role.',
      references: [
        { field: 'workspace_id', target: 'workspaces', description: 'Workspace joined by this user.' },
        { field: 'user_id', target: 'users', description: 'Member account.' },
      ],
      fields: [
        field('_id', 'ObjectId', true, 'MongoDB document primary key.'),
        field('workspace_id', 'ObjectId', true, 'Reference to workspaces._id.'),
        field('user_id', 'ObjectId', true, 'Reference to users._id.'),
        field('role', 'string', true, 'Developer, team lead, or administrator workspace role.'),
        field('status', 'string', true, 'Membership or invitation state.'),
        field('created_at', 'date', true, 'Creation timestamp.'),
        field('updated_at', 'date', true, 'Last update timestamp.'),
      ],
      indexes: ['unique: workspace_id, user_id', 'user_id, status'],
      embedding_strategy: 'Keep memberships as separate documents for efficient workspace and member queries.',
    },
    {
      name: 'projects',
      purpose: 'Software projects, engineering instructions, and project configuration.',
      references: [
        { field: 'workspace_id', target: 'workspaces', description: 'Workspace containing the project.' },
        { field: 'owner_id', target: 'users', description: 'Project creator.' },
      ],
      fields: [
        field('_id', 'ObjectId', true, 'MongoDB document primary key.'),
        field('workspace_id', 'ObjectId', true, 'Reference to workspaces._id.'),
        field('owner_id', 'ObjectId', true, 'Reference to users._id.'),
        field('name', 'string', true, 'Project name.'),
        field('description', 'string', false, 'Project purpose and scope.'),
        field('instructions', 'string', false, 'Project-specific engineering instructions.'),
        field('status', 'string', true, 'Project lifecycle status.'),
        field('created_at', 'date', true, 'Creation timestamp.'),
        field('updated_at', 'date', true, 'Last update timestamp.'),
      ],
      indexes: ['workspace_id, updated_at DESC', 'owner_id'],
      embedding_strategy: 'Keep repository connections and execution history separate from project settings.',
    },
    {
      name: 'tasks',
      purpose: 'Coding tasks, assignments, priorities, and implementation lifecycle.',
      references: [
        { field: 'project_id', target: 'projects', description: 'Project containing the task.' },
        { field: 'assignee_id', target: 'users', description: 'Assigned developer.' },
      ],
      fields: [
        field('_id', 'ObjectId', true, 'MongoDB document primary key.'),
        field('project_id', 'ObjectId', true, 'Reference to projects._id.'),
        field('assignee_id', 'ObjectId', false, 'Reference to users._id.'),
        field('title', 'string', true, 'Task title.'),
        field('description', 'string', true, 'Requested software change.'),
        field('priority', 'string', true, 'Task priority.'),
        field('status', 'string', true, 'Draft, ready, running, review required, completed, or failed.'),
        field('created_at', 'date', true, 'Creation timestamp.'),
        field('updated_at', 'date', true, 'Last update timestamp.'),
      ],
      indexes: ['project_id, status, updated_at DESC', 'assignee_id, status'],
      embedding_strategy: 'Keep execution attempts and proposals separate to retain complete task history.',
    },
    {
      name: 'repository_connections',
      purpose: 'Connected Git repositories and references to protected provider credentials.',
      references: [{ field: 'project_id', target: 'projects', description: 'Project associated with the repository.' }],
      fields: [
        field('_id', 'ObjectId', true, 'MongoDB document primary key.'),
        field('project_id', 'ObjectId', true, 'Reference to projects._id.'),
        field('provider', 'string', true, 'Git hosting provider.'),
        field('repository_url', 'string', true, 'Repository URL.'),
        field('default_branch', 'string', true, 'Configured base branch.'),
        field('credential_secret_ref', 'string', false, 'External secret-store reference; never plaintext credentials.'),
        field('created_at', 'date', true, 'Creation timestamp.'),
        field('updated_at', 'date', true, 'Last update timestamp.'),
      ],
      indexes: ['unique: project_id, repository_url'],
      embedding_strategy: 'Store credentials in an external secret manager and persist only a secret reference.',
    },
    {
      name: 'agent_runs',
      purpose: 'AI engineering executions, validated summaries, status, timing, and errors.',
      references: [
        { field: 'task_id', target: 'tasks', description: 'Task executed by the agent.' },
        { field: 'project_id', target: 'projects', description: 'Project scope for the run.' },
      ],
      fields: [
        field('_id', 'ObjectId', true, 'MongoDB document primary key.'),
        field('task_id', 'ObjectId', true, 'Reference to tasks._id.'),
        field('project_id', 'ObjectId', true, 'Reference to projects._id.'),
        field('status', 'string', true, 'Queued, running, succeeded, or failed.'),
        field('summary', 'string', false, 'Validated execution summary.'),
        field('started_at', 'date', false, 'Execution start time.'),
        field('completed_at', 'date', false, 'Execution completion time.'),
        field('error', 'object', false, 'Sanitized failure details.'),
        field('created_at', 'date', true, 'Creation timestamp.'),
        field('updated_at', 'date', true, 'Last update timestamp.'),
      ],
      indexes: ['project_id, created_at DESC', 'task_id, created_at DESC', 'status'],
      embedding_strategy: 'Append one document per run to preserve execution and failure history.',
    },
    {
      name: 'proposed_changes',
      purpose: 'Reviewable code diffs produced by an agent run.',
      references: [
        { field: 'task_id', target: 'tasks', description: 'Task associated with the proposal.' },
        { field: 'agent_run_id', target: 'agent_runs', description: 'Agent run that produced the proposal.' },
      ],
      fields: [
        field('_id', 'ObjectId', true, 'MongoDB document primary key.'),
        field('task_id', 'ObjectId', true, 'Reference to tasks._id.'),
        field('agent_run_id', 'ObjectId', true, 'Reference to agent_runs._id.'),
        field('diff', 'string', true, 'Proposed patch; apply only after approval.'),
        field('status', 'string', true, 'Pending review, accepted, or rejected.'),
        field('created_at', 'date', true, 'Creation timestamp.'),
        field('updated_at', 'date', true, 'Last update timestamp.'),
      ],
      indexes: ['task_id, created_at DESC', 'agent_run_id'],
      embedding_strategy: 'Keep proposals immutable and separate from the repository until authorized approval.',
    },
    {
      name: 'reviews',
      purpose: 'Reviewer decisions and approval history for proposed changes.',
      references: [
        { field: 'proposed_change_id', target: 'proposed_changes', description: 'Proposal under review.' },
        { field: 'reviewer_id', target: 'users', description: 'User making the decision.' },
      ],
      fields: [
        field('_id', 'ObjectId', true, 'MongoDB document primary key.'),
        field('proposed_change_id', 'ObjectId', true, 'Reference to proposed_changes._id.'),
        field('reviewer_id', 'ObjectId', true, 'Reference to users._id.'),
        field('decision', 'string', true, 'Approved or rejected.'),
        field('summary', 'string', false, 'Review summary.'),
        field('created_at', 'date', true, 'Decision timestamp.'),
        field('updated_at', 'date', true, 'Last update timestamp.'),
      ],
      indexes: ['proposed_change_id, created_at DESC', 'reviewer_id, created_at DESC'],
      embedding_strategy: 'Append decisions to preserve an auditable approval history.',
    },
    {
      name: 'review_comments',
      purpose: 'Discussion comments on proposed code changes.',
      references: [
        { field: 'proposed_change_id', target: 'proposed_changes', description: 'Proposal being discussed.' },
        { field: 'author_id', target: 'users', description: 'Comment author.' },
      ],
      fields: [
        field('_id', 'ObjectId', true, 'MongoDB document primary key.'),
        field('proposed_change_id', 'ObjectId', true, 'Reference to proposed_changes._id.'),
        field('author_id', 'ObjectId', true, 'Reference to users._id.'),
        field('body', 'string', true, 'Review comment.'),
        field('file_path', 'string', false, 'Optional path in the code proposal.'),
        field('line_number', 'int', false, 'Optional line reference.'),
        field('created_at', 'date', true, 'Creation timestamp.'),
        field('updated_at', 'date', true, 'Last update timestamp.'),
      ],
      indexes: ['proposed_change_id, created_at ASC'],
      embedding_strategy: 'Keep comments separate for pagination and per-file discussion.',
    },
    {
      name: 'notifications',
      purpose: 'In-app notifications for agent runs and review decisions.',
      references: [{ field: 'recipient_id', target: 'users', description: 'Notification recipient.' }],
      fields: [
        field('_id', 'ObjectId', true, 'MongoDB document primary key.'),
        field('recipient_id', 'ObjectId', true, 'Reference to users._id.'),
        field('event_type', 'string', true, 'Run or review event.'),
        field('resource_id', 'ObjectId', false, 'Related task, run, or proposal identifier.'),
        field('read_at', 'date', false, 'Time the notification was read.'),
        field('created_at', 'date', true, 'Creation timestamp.'),
        field('updated_at', 'date', true, 'Last update timestamp.'),
      ],
      indexes: ['recipient_id, read_at, created_at DESC'],
      embedding_strategy: 'Store notifications separately for unread counts and pagination.',
    },
  ]
  const relationships: DatabaseRelationship[] = []
  const collections = definitions.map((definition): CollectionDesign => {
    const foreign_keys = definition.references.map((reference) => ({
      field: reference.field,
      references_collection: reference.target,
      references_field: '_id',
      description: reference.description,
    }))
    relationships.push(...definition.references.map((reference) => ({
      from_collection: definition.name,
      to_collection: reference.target,
      cardinality: 'many-to-one',
      description: `Each ${definition.name.replaceAll('_', ' ')} references one ${reference.target.replaceAll('_', ' ')} through ${reference.field}.`,
    })))
    return {
      name: definition.name,
      purpose: definition.purpose,
      primary_key: '_id',
      foreign_keys,
      fields: definition.fields,
      indexes: definition.indexes,
      embedding_strategy: definition.embedding_strategy,
    }
  })
  const design: MongoDatabaseDesign = {
    project_id: project.id,
    source_requirements: project.requirements,
    created_at: new Date().toISOString(),
    project_summary: `MongoDB document model for ${project.name}, covering workspaces, coding tasks, agent runs, and reviewable changes.`,
    database_name: 'softarchitect_ai',
    collections,
    relationships,
    design_decisions: [
      'Declare _id as the primary key and ObjectId references as logical foreign keys; validate referenced IDs and workspace membership in application services.',
      'Keep agent runs, proposed changes, and review decisions as separate records to preserve history.',
      'Store repository credentials only in a managed secret store and persist a reference, never plaintext credentials.',
      'Do not apply generated code to a repository until an authorized reviewer approves the proposal.',
      'Index workspace, project, task status, reviewer, and chronological access patterns.',
    ],
    mermaid_diagram: buildChenEntityRelationshipDiagram(collections, relationships),
  }
  localStorage.setItem(
    DATABASE_DESIGNS_KEY,
    JSON.stringify([design, ...readDemoDatabaseDesigns().filter((item) => item.project_id !== project.id)]),
  )
  return design
}

function readDemoArchitectures(): SoftwareArchitecture[] {
  try {
    const stored = localStorage.getItem(ARCHITECTURES_KEY)
    return stored ? JSON.parse(stored) as SoftwareArchitecture[] : []
  } catch {
    localStorage.removeItem(ARCHITECTURES_KEY)
    return []
  }
}

function createDemoArchitecture(project: Project): SoftwareArchitecture {
  const technologyRecommendation = findCurrentDemoArtifact(
    readDemoTechnologyRecommendations(),
    project.id,
    project.requirements,
  )
  if (!technologyRecommendation) {
    throw new Error('Generate and save technology recommendations before the software architecture.')
  }

  const text = project.requirements.toLowerCase()
  if (/\b(repositor(?:y|ies)|agent runs?|proposed (?:code )?changes?|coding tasks?|workspace memberships?|AI software engineer(?:ing)?)\b/i.test(text)) {
    return createDeveloperPlatformArchitecture(project, technologyRecommendation)
  }
  const stack = new Map(technologyRecommendation.recommendations.map((item) => [item.category.toLowerCase(), item.recommendation]))
  const technologies = (category: string, fallback: string) => [stack.get(category.toLowerCase()) ?? fallback]
  const components: ArchitectureComponent[] = [
    { id: 'web-app', name: 'Web application', component_type: 'Frontend', description: 'Responsive interfaces for customers, restaurant owners, delivery drivers, and administrators.', technologies: technologies('Frontend', 'React and TypeScript') },
    { id: 'api', name: 'REST API', component_type: 'Application entry point', description: 'Authenticates requests, validates payloads, applies authorization, and routes requests to domain modules.', technologies: technologies('Backend API', 'FastAPI and Pydantic') },
    { id: 'identity', name: 'Identity and access', component_type: 'Domain module', description: 'Registration, login, JWT verification, role checks, and resource ownership enforcement.', technologies: technologies('Authentication and authorization', 'JWT and role-based access control') },
    { id: 'catalog', name: 'Restaurant and menu catalog', component_type: 'Domain module', description: 'Restaurant profiles, searchable menus, item availability, and pricing.', technologies: ['FastAPI module'] },
    { id: 'orders', name: 'Cart and order management', component_type: 'Domain module', description: 'Cart validation, order lifecycle, restaurant order handling, and order status.', technologies: ['FastAPI module'] },
    { id: 'database', name: 'Primary document database', component_type: 'Persistence', description: 'Stores users, restaurants, menus, orders, payment references, delivery assignments, and audit records.', technologies: technologies('Primary database', 'MongoDB Atlas') },
  ]
  const connections: ArchitectureConnection[] = [
    { source: 'web-app', target: 'api', label: 'HTTPS REST / JSON' },
    { source: 'api', target: 'identity', label: 'authenticate and authorize' },
    { source: 'api', target: 'catalog', label: 'catalog requests' },
    { source: 'api', target: 'orders', label: 'cart and order requests' },
    { source: 'identity', target: 'database', label: 'users and roles' },
    { source: 'catalog', target: 'database', label: 'restaurants and menus' },
    { source: 'orders', target: 'database', label: 'orders and status' },
  ]
  const diagram = [
    'flowchart LR',
    '  client["Responsive web application"] -->|"HTTPS REST / JSON"| api["FastAPI REST API"]',
    '  api --> identity["Identity and access"]',
    '  api --> catalog["Restaurant and menu catalog"]',
    '  api --> orders["Cart and order management"]',
    '  identity --> db[("MongoDB Atlas")]',
    '  catalog --> db',
    '  orders --> db',
  ]

  if (/\b(payment|payments|checkout|billing|invoice)\b/.test(text)) {
    components.push(
      { id: 'payments', name: 'Payment adapter', component_type: 'Domain module', description: 'Creates provider checkout sessions, verifies signed webhooks, and stores payment references without card data.', technologies: technologies('Payments', 'Hosted payment provider adapter') },
      { id: 'payment-provider', name: 'External payment provider', component_type: 'External system', description: 'Hosted checkout and payment processing; provider selection remains a project decision.', technologies: technologies('Payments', 'Provider to be selected') },
    )
    connections.push(
      { source: 'api', target: 'payments', label: 'payment requests' },
      { source: 'payments', target: 'database', label: 'payment references' },
      { source: 'payments', target: 'payment-provider', label: 'hosted checkout and signed webhooks' },
    )
    diagram.push('  api --> payments["Payment adapter"]', '  payments --> db', '  payments <-->|"Checkout / signed webhook"| gateway["External payment provider"]')
  }
  if (/\b(delivery|driver|track|tracking)\b/.test(text)) {
    components.push({ id: 'delivery', name: 'Delivery and tracking', component_type: 'Domain module', description: 'Assigns deliveries to drivers and records delivery status updates for customer tracking.', technologies: ['FastAPI module'] })
    connections.push({ source: 'api', target: 'delivery', label: 'assignments and status updates' }, { source: 'delivery', target: 'database', label: 'assignments and tracking state' })
    diagram.push('  api --> delivery["Delivery and tracking"]', '  delivery --> db')
  }
  if (/\b(notification|email|sms|alert)\b/.test(text)) {
    components.push(
      { id: 'notifications', name: 'Notification worker', component_type: 'Background processing', description: 'Sends order and account notifications asynchronously with retryable, idempotent delivery.', technologies: technologies('Notifications', 'Provider adapter and durable job queue') },
      { id: 'messaging-provider', name: 'Email or SMS provider', component_type: 'External system', description: 'Delivers messages through a replaceable provider integration.', technologies: ['Provider to be selected'] },
    )
    connections.push(
      { source: 'orders', target: 'notifications', label: 'enqueue order events' },
      { source: 'notifications', target: 'database', label: 'jobs and delivery status' },
      { source: 'notifications', target: 'messaging-provider', label: 'send messages' },
    )
    diagram.push('  orders -->|"Order events"| worker["Notification worker"]', '  worker --> db', '  worker --> messaging["Email or SMS provider"]')
  }

  const architecture: SoftwareArchitecture = {
    project_id: project.id,
    source_requirements: project.requirements,
    created_at: new Date().toISOString(),
    project_summary: `Proposed system architecture for ${project.name}, grounded in the project requirements and saved technology recommendations.`,
    architectural_style: 'Modular monolith with a responsive web client, authenticated REST API, domain modules, MongoDB persistence, and replaceable external-service adapters.',
    components,
    connections,
    design_decisions: [
      'Use a modular monolith: domain modules share one API deployment and are separated by clear service boundaries.',
      'Keep MongoDB as the primary datastore and persist provider references rather than sensitive card data.',
      'Enforce role-based access and resource ownership in the API; the frontend is not an authorization boundary.',
      'Use HTTPS for client traffic and verify signatures on external payment webhooks.',
      'Move slow or retryable notifications to background processing; begin with a durable job collection and add a dedicated broker when measured load justifies it.',
    ],
    mermaid_diagram: diagram.join('\n'),
  }
  localStorage.setItem(
    ARCHITECTURES_KEY,
    JSON.stringify([architecture, ...readDemoArchitectures().filter((item) => item.project_id !== project.id)]),
  )
  return architecture
}

function createDeveloperPlatformArchitecture(
  project: Project,
  recommendation: TechnologyRecommendation,
): SoftwareArchitecture {
  const stack = new Map(recommendation.recommendations.map((item) => [item.category.toLowerCase(), item.recommendation]))
  const technology = (category: string, fallback: string) => [stack.get(category.toLowerCase()) ?? fallback]
  const components: ArchitectureComponent[] = [
    { id: 'web-app', name: 'Engineering workspace', component_type: 'Frontend', description: 'Workspace for software projects, coding tasks, agent runs, and change reviews.', technologies: technology('Frontend', 'React and TypeScript') },
    { id: 'api', name: 'REST API', component_type: 'Application entry point', description: 'Validates requests and enforces workspace membership, project ownership, and role permissions.', technologies: technology('Backend API', 'FastAPI and Pydantic') },
    { id: 'identity', name: 'Identity and workspace access', component_type: 'Domain module', description: 'Authentication, workspace memberships, role checks, and project authorization.', technologies: technology('Authentication and authorization', 'JWT and role-based access control') },
    { id: 'projects', name: 'Workspace and project management', component_type: 'Domain module', description: 'Manages workspaces, membership, project instructions, settings, and task assignments.', technologies: ['FastAPI module'] },
    { id: 'tasks', name: 'Coding task lifecycle', component_type: 'Domain module', description: 'Manages task validation, priority, assignment, and execution status transitions.', technologies: ['FastAPI module'] },
    { id: 'repository', name: 'Repository integration', component_type: 'Integration', description: 'Connects Git repositories using credentials protected by an external secret manager.', technologies: ['Git provider adapter'] },
    { id: 'agent', name: 'AI engineering orchestrator', component_type: 'Agent workflow', description: 'Runs engineering steps, validates outputs, records errors, and creates reviewable change proposals.', technologies: technology('AI provider', 'Provider abstraction with Demo Mode and optional Gemini') },
    { id: 'review', name: 'Code proposal and review', component_type: 'Domain module', description: 'Stores diffs, review comments, and approval decisions; never applies a diff before authorized approval.', technologies: ['FastAPI module'] },
    { id: 'database', name: 'Primary document database', component_type: 'Persistence', description: 'Stores workspaces, tasks, repository references, agent runs, proposals, reviews, and notifications.', technologies: technology('Primary database', 'MongoDB Atlas') },
  ]
  const connections: ArchitectureConnection[] = [
    { source: 'web-app', target: 'api', label: 'HTTPS REST / JSON' },
    { source: 'api', target: 'identity', label: 'authenticate and authorize' },
    { source: 'api', target: 'projects', label: 'workspace and project operations' },
    { source: 'api', target: 'tasks', label: 'task lifecycle' },
    { source: 'api', target: 'agent', label: 'validated agent run' },
    { source: 'tasks', target: 'agent', label: 'authorized task input' },
    { source: 'agent', target: 'repository', label: 'read repository context' },
    { source: 'agent', target: 'review', label: 'create reviewable proposal' },
    { source: 'review', target: 'repository', label: 'apply changes only after approval' },
    { source: 'identity', target: 'database', label: 'users and memberships' },
    { source: 'projects', target: 'database', label: 'workspaces and projects' },
    { source: 'tasks', target: 'database', label: 'tasks and assignments' },
    { source: 'agent', target: 'database', label: 'runs and validated results' },
    { source: 'review', target: 'database', label: 'proposals and review history' },
  ]
  const diagram = [
    'flowchart LR',
    '  client["Engineering workspace"] -->|"HTTPS REST / JSON"| api["REST API"]',
    '  api --> identity["Identity and workspace access"]',
    '  api --> projects["Workspace and project management"]',
    '  api --> tasks["Coding task lifecycle"]',
    '  api --> agent["AI engineering orchestrator"]',
    '  agent -->|"Read repository context"| repository["Git provider adapter"]',
    '  agent -->|"Reviewable diff"| review["Code proposal and review"]',
    '  review -->|"Approved changes only"| repository',
    '  identity --> db[("MongoDB")]',
    '  projects --> db',
    '  tasks --> db',
    '  agent -->|"Runs and validated output"| db',
    '  review -->|"Proposals and decisions"| db',
  ].join('\n')
  const architecture: SoftwareArchitecture = {
    project_id: project.id,
    source_requirements: project.requirements,
    created_at: new Date().toISOString(),
    project_summary: `AI software engineering architecture for ${project.name}, based on its workspace, coding-task, agent-run, and code-review requirements.`,
    architectural_style: 'Modular monolith with an authenticated engineering workspace, validated agent workflow, Git provider adapter, approval-gated code proposals, and MongoDB persistence.',
    components,
    connections,
    design_decisions: [
      'Enforce workspace membership, project ownership, and role permissions at the API boundary.',
      'A run is successful only after its required outputs pass validation.',
      'Do not apply generated changes to a repository before an authorized reviewer approves the proposal.',
      'Store repository credentials in a managed secret store and persist only a secret reference.',
      'Use MongoDB as the primary datastore and index workspace, project, task status, and event chronology.',
    ],
    mermaid_diagram: diagram,
  }
  localStorage.setItem(
    ARCHITECTURES_KEY,
    JSON.stringify([architecture, ...readDemoArchitectures().filter((item) => item.project_id !== project.id)]),
  )
  return architecture
}

function readDemoTechnologyRecommendations(): TechnologyRecommendation[] {
  try {
    const stored = localStorage.getItem(TECHNOLOGY_RECOMMENDATIONS_KEY)
    return stored ? JSON.parse(stored) as TechnologyRecommendation[] : []
  } catch {
    localStorage.removeItem(TECHNOLOGY_RECOMMENDATIONS_KEY)
    return []
  }
}

function createDemoTechnologyRecommendation(project: Project): TechnologyRecommendation {
  const text = `${project.requirements} ${project.domain}`.toLowerCase()
  const choices: TechnologyChoice[] = [
    {
      category: 'Frontend',
      recommendation: 'React, TypeScript, Vite, and Tailwind CSS',
      rationale: 'A component-based UI with strict typing supports responsive customer, operator, driver, and administrator workflows.',
      alternatives: ['Vue 3 with TypeScript', 'Angular'],
      trade_offs: ['The team must maintain a separate frontend build and coordinate API contracts with the backend.'],
    },
    {
      category: 'Backend API',
      recommendation: 'Python 3.11+, FastAPI, and Pydantic',
      rationale: 'FastAPI provides typed REST endpoints, request validation, and generated OpenAPI documentation for a modular monolith.',
      alternatives: ['Django REST Framework', 'NestJS'],
      trade_offs: ['Python typing and asynchronous database access need consistent conventions as the codebase grows.'],
    },
    {
      category: 'Primary database',
      recommendation: 'MongoDB Atlas with PyMongo Async or Motor',
      rationale: 'MongoDB is the required primary database and supports evolving project, order, menu, and blueprint documents.',
      alternatives: ['Local MongoDB for development'],
      trade_offs: ['Schema validation, indexes, and transaction boundaries must be designed explicitly; Atlas requires network and credential configuration.'],
    },
    {
      category: 'Authentication and authorization',
      recommendation: 'JWT access tokens, Argon2 password hashing, and role-based access control',
      rationale: 'Authenticated requests can enforce separate permissions for customers, business operators, delivery drivers, and administrators.',
      alternatives: ['Secure server-side sessions'],
      trade_offs: ['JWT expiration, refresh, revocation, and secret rotation require deliberate handling.'],
    },
    {
      category: 'AI provider',
      recommendation: 'Deterministic Demo Mode by default, with an optional Gemini provider behind a provider interface',
      rationale: 'The product remains demonstrable without external credentials while allowing an online model to be added without changing workflow contracts.',
      alternatives: ['Other providers implementing the same interface'],
      trade_offs: ['Demo recommendations are rule-based; online provider calls add latency, cost, and output-validation requirements.'],
    },
    {
      category: 'Deployment',
      recommendation: 'Docker and Docker Compose for the modular monolith',
      rationale: 'Containerized frontend and API services provide a repeatable local demo and a straightforward path to hosted deployment.',
      alternatives: ['Managed container platform'],
      trade_offs: ['Production deployment still needs managed secrets, monitoring, backups, and a TLS-terminating ingress.'],
    },
  ]

  if (/\b(payment|payments|checkout|billing|invoice)\b/.test(text)) {
    choices.push({
      category: 'Payments',
      recommendation: 'Integrate a hosted payment provider through a backend payment adapter; keep card data out of the application',
      rationale: 'A provider-hosted checkout reduces direct handling of sensitive payment data and isolates provider-specific APIs.',
      alternatives: ['Stripe Checkout', 'Razorpay Checkout'],
      trade_offs: ['Provider selection, regional availability, fees, webhook verification, and refund workflows must be confirmed.'],
    })
  }
  if (/\b(notification|notifications|email|sms|alert)\b/.test(text)) {
    choices.push({
      category: 'Notifications',
      recommendation: 'Use a provider adapter with a durable notification queue and retryable delivery jobs',
      rationale: 'Order and account notifications should remain decoupled from request processing and tolerate temporary provider outages.',
      alternatives: ['Email-only provider integration for the initial release'],
      trade_offs: ['A queue and delivery-status tracking add operational components and require idempotent retry handling.'],
    })
  }

  const recommendation: TechnologyRecommendation = {
    project_id: project.id,
    source_requirements: project.requirements,
    created_at: new Date().toISOString(),
    project_summary: `Recommended implementation stack for ${project.name}, selected for the stated workflows and the MongoDB-based modular monolith.`,
    recommendations: choices,
  }
  const allRecommendations = readDemoTechnologyRecommendations()
  localStorage.setItem(
    TECHNOLOGY_RECOMMENDATIONS_KEY,
    JSON.stringify([recommendation, ...allRecommendations.filter((item) => item.project_id !== project.id)]),
  )
  return recommendation
}

function createDemoAnalysis(project: Project): RequirementAnalysis {
  const requirements = project.requirements.trim()
  const featurePatterns: Record<string, RegExp[]> = {
    authentication: [/\bregister\b/i, /\blog\s?in\b/i, /\bsign in\b/i, /\bauthentication\b/i, /\bpassword\b/i],
    'user profile management': [/\bprofile\b/i, /\baccount settings\b/i, /\buser details\b/i],
    'search and discovery': [/\bsearch\b/i, /\bfilter\b/i, /\bbrowse\b/i, /\bdiscover\b/i],
    'payments and billing': [/\bpayments?\b/i, /\bcheckout\b/i, /\bbilling\b/i, /\binvoice\b/i, /\bpay\b/i],
    notifications: [/\bnotifications?\b/i, /\balerts?\b/i, /\bemail\b/i, /\bsms\b/i],
    'reporting and analytics': [/\breports?\b/i, /\banalytics\b/i, /\bdashboards?\b/i, /\bmetrics\b/i],
    'order management': [/\borders?\b/i, /\bbookings?\b/i, /\breservations?\b/i, /\bcart\b/i],
    'catalog management': [/\bcatalog\b/i, /\bproducts?\b/i, /\bmenus?\b/i, /\binventory\b/i],
    'delivery tracking': [/\btrack(?:ing)?\b/i, /\bdeliver(?:y|ies)\b/i, /\blocation\b/i],
    administration: [/\badmins?\b/i, /\badministrators?\b/i, /\bmoderators?\b/i, /\bmanage users\b/i],
  }
  const features = Object.entries(featurePatterns)
    .filter(([, patterns]) => patterns.some((pattern) => pattern.test(requirements)))
    .map(([feature]) => feature)
  const resolvedFeatures = features.length ? features : ['core workflow management']
  const statements = requirements
    .split(/(?<=[.!?])\s+|[\n;]+/)
    .map((statement) => statement.trim().replace(/^[\s.-]+|[\s.-]+$/g, ''))
    .filter(Boolean)
  const functionalRequirements = statements.length
    ? statements.slice(0, 12).map((statement) => `${statement.replace(/[.!?]+$/, '')}.`)
    : ['The system shall support the core workflow management described for the project.']
  const hasRole = (pattern: RegExp) => pattern.test(requirements)
  const roles = [
    ...(hasRole(/\badmins?\b|\badministrators?\b/i) ? ['Administrator'] : []),
    ...(hasRole(/\bcustomers?\b|\bbuyers?\b|\bclients?\b/i) ? ['Customer'] : []),
    ...(hasRole(/\brestaurant owners?\b/i) ? ['Restaurant owner'] : []),
    ...(!hasRole(/\brestaurant owners?\b/i) && hasRole(/\bowners?\b|\bsellers?\b|\bvendors?\b|\bstaff\b/i) ? ['Business owner'] : []),
    ...(hasRole(/\bdelivery drivers?\b|\bdrivers?\b/i) ? ['Delivery driver'] : []),
    ...(hasRole(/\bproviders?\b|\bagents?\b/i) ? ['Service provider'] : []),
    ...(hasRole(/\bend users?\b|\bmembers?\b/i) ? ['End user'] : []),
  ]
  if (roles.length === 0) roles.push('End user', 'Administrator')
  const summary = `${project.name} is a software solution for ${requirements}`

  return {
    project_id: project.id,
    source_requirements: project.requirements,
    created_at: new Date().toISOString(),
    project_summary: summary.length > 620 ? `${summary.slice(0, 617).replace(/\s+\S*$/, '')}...` : summary,
    functional_requirements: functionalRequirements,
    non_functional_requirements: [
      'Protect user and business data with authenticated, role-appropriate access.',
      'Validate user input and return clear, actionable errors.',
      'Keep core workflows responsive under the expected project workload.',
      'Record relevant changes and failures for troubleshooting and auditability.',
    ],
    user_roles: roles,
    modules: [...resolvedFeatures.map((feature) => feature.replace(/\b\w/g, (char) => char.toUpperCase())), 'Identity and access', 'Audit and operational settings'],
    business_rules: [
      'Users may perform actions only when permitted by their role and resource ownership.',
      'Persisted records must include creation and last-updated timestamps.',
    ],
    assumptions: [
      'The initial release is a responsive web application.',
      'MongoDB is the primary application database.',
      'External services require credentials and integration decisions.',
    ],
    missing_information: [
      'Expected user volume, peak request rate, and availability target are unspecified.',
      'Data retention, privacy, and regulatory requirements are unspecified.',
      'Required external integrations and failure-handling rules are unspecified.',
    ],
    risks: [
      'Broad requirements may cause inconsistent behavior unless workflows and acceptance criteria are clarified.',
      'Third-party outages may interrupt dependent workflows without fallback procedures.',
      'Undefined data-protection requirements may create privacy or access-control risks.',
    ],
  }
}
