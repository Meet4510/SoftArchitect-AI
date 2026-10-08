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
  created_at: string
  project_summary: string
  architectural_style: string
  components: ArchitectureComponent[]
  connections: ArchitectureConnection[]
  design_decisions: string[]
  mermaid_diagram: string
}

const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
const api = axios.create({ baseURL: API_BASE_URL, timeout: 8000 })
const PROJECTS_KEY = 'softarchitect_projects'
const TECHNOLOGY_RECOMMENDATIONS_KEY = 'softarchitect_technology_recommendations'
const ARCHITECTURES_KEY = 'softarchitect_architectures'
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
    return createDemoAnalysis(project)
  }

  try {
    const response = await api.post(
      `/api/v1/projects/${encodeURIComponent(project.id)}/requirements/analyze`,
      {},
      { headers: { Authorization: `Bearer ${token}` } },
    )
    return response.data as RequirementAnalysis
  } catch (error) {
    if (isOfflineError(error)) return createDemoAnalysis(project)
    throw error
  }
}

export async function fetchProjectRequirementAnalysis(
  token: string,
  projectId: string,
): Promise<RequirementAnalysis> {
  const response = await api.get(
    `/api/v1/projects/${encodeURIComponent(projectId)}/requirements/analysis`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  return response.data as RequirementAnalysis
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
    const stored = readDemoTechnologyRecommendations()
      .find((item) => item.project_id === projectId)
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
      const stored = readDemoTechnologyRecommendations()
        .find((item) => item.project_id === projectId)
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
    const saved = readDemoArchitectures().find((item) => item.project_id === projectId)
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
      const saved = readDemoArchitectures().find((item) => item.project_id === projectId)
      if (saved) return saved
    }
    throw error
  }
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
  const technologyRecommendation = readDemoTechnologyRecommendations()
    .find((item) => item.project_id === project.id)
  if (!technologyRecommendation) {
    throw new Error('Generate and save technology recommendations before the software architecture.')
  }

  const text = project.requirements.toLowerCase()
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
