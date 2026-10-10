import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Boxes,
  Check,
  ChevronRight,
  CirclePlus,
  Clock3,
  FileText,
  Layers3,
  LogOut,
  Pencil,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Workflow,
  X,
  Download,
  Database,
} from 'lucide-react'
import type { Project } from '../../lib/demo-data'
import {
  analyzeProjectRequirements,
  createProject,
  deleteProject,
  fetchProjectArchitecture,
  fetchProjectDatabaseDesign,
  fetchProjectApiDesign,
  fetchProjectDiagrams,
  fetchProjectDataset,
  fetchProjectDiagramsForWord,
  fetchProjectDocumentation,
  fetchProjectRequirementAnalysis,
  fetchProjects,
  fetchProjectTechnologyRecommendation,
  buildChenEntityRelationshipDiagram,
  generateProjectArchitecture,
  generateProjectDatabaseDesign,
  generateProjectApiDesign,
  generateProjectDataset,
  generateProjectDocumentation,
  generateProjectDiagrams,
  getApiErrorMessage,
  recommendProjectTechnology,
  updateProject,
  type AuthSession,
  type ApiEndpoint,
  type ApiField,
  type MongoDatabaseDesign,
  type RestApiDesign,
  type ProjectDiagrams,
  type ProjectDraft,
  type RequirementAnalysis,
  type SoftwareArchitecture,
  type SyntheticDataset,
  type ProjectDocumentation,
  type TechnologyRecommendation,
} from '../../services/api'
import { renderMermaidDiagram } from './diagram-rendering'
import { downloadTechnicalBlueprintWord } from './word-export'

const fieldClass =
  'w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/15'

const projectsKey = (token: string) => ['projects', token]
const DEFAULT_DOCUMENTATION_PROMPT =
  'Create a clear developer handoff for the project. Include the requirements, architecture, database model, API endpoints, implementation roadmap, key risks, security and deployment guidance. Use concise professional language and organize it with useful headings.'

export function WorkspaceLayout({
  session,
  onLogout,
}: {
  session: AuthSession
  onLogout: () => void
}) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <header className="border-b border-slate-800 bg-slate-950/90">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <Link to="/dashboard" className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-500/15 ring-1 ring-cyan-400/40">
              <Sparkles className="h-5 w-5 text-cyan-300" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-xs uppercase tracking-[0.22em] text-cyan-300">SoftArchitect AI</span>
              <span className="block truncate text-sm font-semibold text-white">Blueprint workspace</span>
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden max-w-48 truncate text-sm text-slate-300 sm:block">{session.user.name}</span>
            <button
              onClick={onLogout}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-300 transition hover:border-slate-500 hover:text-white"
            >
              <LogOut className="h-4 w-4" /> <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>
      <nav aria-label="Main navigation" className="border-b border-slate-800 bg-slate-900/60">
        <div className="mx-auto flex max-w-7xl gap-2 overflow-x-auto px-4 py-2 sm:px-6 lg:px-8">
          <WorkspaceNavLink to="/dashboard" icon={<BarChart3 className="h-4 w-4" />}>Overview</WorkspaceNavLink>
          <WorkspaceNavLink to="/projects" icon={<Layers3 className="h-4 w-4" />}>Projects</WorkspaceNavLink>
          <WorkspaceNavLink to="/data-lab" icon={<Database className="h-4 w-4" />}>Data Lab</WorkspaceNavLink>
        </div>
      </nav>
      {session.token === 'demo-token' ? (
        <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6 lg:px-8">
          <div className="rounded-xl border border-amber-400/25 bg-amber-400/5 px-4 py-3 text-sm text-amber-100">
            Demo mode is active. Changes are stored in this browser and are not synced to the backend.
          </div>
        </div>
      ) : null}
      <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8"><Outlet /></main>
    </div>
  )
}

function WorkspaceNavLink({ to, icon, children }: { to: string; icon: ReactNode; children: ReactNode }) {
  return (
    <NavLink
      to={to}
      end={to === '/dashboard'}
      className={({ isActive }) =>
        `inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
          isActive ? 'bg-cyan-400/10 text-cyan-200' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
        }`
      }
    >
      {icon}{children}
    </NavLink>
  )
}

function useProjectList(session: AuthSession) {
  return useQuery({
    queryKey: projectsKey(session.token),
    queryFn: () => fetchProjects(session.token),
  })
}

export function DashboardPage({ session }: { session: AuthSession }) {
  const { data: projects = [], isLoading, error } = useProjectList(session)
  const stats = useMemo(() => ({
    total: projects.length,
    active: projects.filter((project) => project.status === 'ANALYZING').length,
    completed: projects.filter((project) => project.status === 'COMPLETED').length,
    drafts: projects.filter((project) => project.status === 'DRAFT').length,
  }), [projects])
  const recent = [...projects].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 4)

  return (
    <div className="space-y-7">
      <section className="flex flex-col gap-5 rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-cyan-950/40 p-6 sm:p-8 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">Workspace overview</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            Welcome back, {session.user.name}
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-300 sm:text-base">
            Turn a software idea into a structured blueprint, one focused project at a time.
          </p>
        </div>
        <Link to="/projects" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300">
          <CirclePlus className="h-4 w-4" /> Open projects
        </Link>
      </section>

      {error ? <ErrorNotice error={error} /> : null}
      <section aria-label="Project summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <OverviewStat label="All projects" value={stats.total} icon={<Layers3 className="h-5 w-5" />} tone="cyan" />
        <OverviewStat label="In progress" value={stats.active} icon={<Workflow className="h-5 w-5" />} tone="blue" />
        <OverviewStat label="Completed" value={stats.completed} icon={<ShieldCheck className="h-5 w-5" />} tone="green" />
        <OverviewStat label="Drafts" value={stats.drafts} icon={<FileText className="h-5 w-5" />} tone="violet" />
      </section>

      <section className="flex flex-col gap-4 rounded-2xl border border-violet-400/20 bg-gradient-to-r from-violet-500/[0.08] to-cyan-500/[0.04] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-violet-400/10 p-2.5 text-violet-200"><Database className="h-5 w-5" /></span>
          <div>
            <h2 className="font-semibold text-white">Generate data from your own schema</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-400">Import a database design or CSV samples and generate downloadable synthetic data without creating a project.</p>
          </div>
        </div>
        <Link to="/data-lab" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-violet-300/30 px-4 py-2.5 text-sm font-medium text-violet-100 transition hover:bg-violet-400/10">
          Open Data Lab <ArrowRight className="h-4 w-4" />
        </Link>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]">
        <div className="min-w-0 rounded-2xl border border-slate-800 bg-slate-900/70 p-5 sm:p-6">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-white">Recently updated</h2>
              <p className="mt-1 text-sm text-slate-400">Jump back into a blueprint.</p>
            </div>
            <Link to="/projects" className="inline-flex shrink-0 items-center gap-1 text-sm text-cyan-300 hover:text-cyan-200">
              All projects <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          {isLoading ? <LoadingState label="Loading projects..." /> : null}
          {!isLoading && recent.length === 0 ? (
            <EmptyState title="No projects yet" description="Create your first project to start a software blueprint." action={<Link to="/projects" className="text-cyan-300 hover:text-cyan-200">Create a project</Link>} />
          ) : null}
          <div className="divide-y divide-slate-800">
            {recent.map((project) => <RecentProjectRow key={project.id} project={project} />)}
          </div>
        </div>

        <aside className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-white">Blueprint workflow</h2>
          <p className="mt-1 text-sm text-slate-400">Each project has its own workspace for generated artifacts.</p>
          <ol className="mt-5 space-y-4">
            {[
              ['01', 'Requirements', 'Analyze roles, workflows, and risks.'],
              ['02', 'Technology', 'Compare recommended stack choices.'],
              ['03', 'Architecture', 'Explore system components and connections.'],
              ['04', 'MongoDB design', 'Review collections, keys, and indexes.'],
              ['05', 'REST API design', 'Inspect endpoint contracts and OpenAPI.'],
              ['06', 'UML diagrams', 'Visualize use cases, sequences, and domain classes.'],
            ].map(([number, title, description]) => (
              <li key={number} className="flex gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-950 text-xs font-semibold text-cyan-200">{number}</span>
                <span><span className="block text-sm font-medium text-slate-200">{title}</span><span className="mt-0.5 block text-xs leading-5 text-slate-500">{description}</span></span>
              </li>
            ))}
          </ol>
        </aside>
      </section>
    </div>
  )
}

function OverviewStat({ label, value, icon, tone }: { label: string; value: number; icon: ReactNode; tone: string }) {
  const colors: Record<string, string> = {
    cyan: 'border-cyan-400/20 bg-cyan-400/5 text-cyan-200',
    blue: 'border-blue-400/20 bg-blue-400/5 text-blue-200',
    green: 'border-emerald-400/20 bg-emerald-400/5 text-emerald-200',
    violet: 'border-violet-400/20 bg-violet-400/5 text-violet-200',
  }
  return (
    <div className={`rounded-2xl border p-5 ${colors[tone]}`}>
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-slate-300">{label}</p>
        {icon}
      </div>
      <p className="mt-4 text-3xl font-semibold tracking-tight text-white">{value}</p>
    </div>
  )
}

function RecentProjectRow({ project }: { project: Project }) {
  return (
    <Link to={`/projects/${encodeURIComponent(project.id)}`} className="flex min-w-0 items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
      <span className="min-w-0">
        <span className="block truncate font-medium text-slate-100">{project.name}</span>
        <span className="mt-1 block truncate text-xs text-slate-500">{project.domain} · Updated {formatDate(project.updated_at)}</span>
      </span>
      <span className="flex shrink-0 items-center gap-2 text-xs text-slate-400">
        <ProjectStatus status={project.status} /><ChevronRight className="h-4 w-4" />
      </span>
    </Link>
  )
}

export function ProjectsPage({ session }: { session: AuthSession }) {
  const queryClient = useQueryClient()
  const { data: projects = [], isLoading, error } = useProjectList(session)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('ALL')
  const [showCreate, setShowCreate] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<ProjectDraft>({ name: '' })
  const [page, setPage] = useState(1)
  const pageSize = 9

  const filtered = useMemo(() => projects.filter((project) => {
    const term = search.trim().toLowerCase()
    const matchesSearch = !term || [project.name, project.description, project.domain, project.requirements]
      .some((value) => value.toLowerCase().includes(term))
    return matchesSearch && (status === 'ALL' || project.status === status)
  }), [projects, search, status])
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const visibleProjects = filtered.slice((page - 1) * pageSize, page * pageSize)

  const createMutation = useMutation({
    mutationFn: (draft: ProjectDraft) => createProject(session.token, draft),
    onSuccess: (project) => {
      queryClient.setQueryData<Project[]>(projectsKey(session.token), (current = []) => [project, ...current])
      setShowCreate(false)
      setPage(1)
    },
  })
  const updateMutation = useMutation({
    mutationFn: ({ id, draft }: { id: string; draft: ProjectDraft }) => updateProject(session.token, id, draft),
    onSuccess: (updated) => {
      queryClient.setQueryData<Project[]>(projectsKey(session.token), (current = []) =>
        current.map((project) => project.id === updated.id ? updated : project),
      )
      setEditingId(null)
    },
  })
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteProject(session.token, id),
    onSuccess: (_, id) => {
      queryClient.setQueryData<Project[]>(projectsKey(session.token), (current = []) =>
        current.filter((project) => project.id !== id),
      )
    },
  })

  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="Workspace / Projects"
        title="Projects"
        description="Manage your software ideas and open a project workspace to build its blueprint."
        action={<button onClick={() => setShowCreate((visible) => !visible)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-cyan-300"><CirclePlus className="h-4 w-4" /> New project</button>}
      />

      {error || createMutation.error || updateMutation.error || deleteMutation.error
        ? <ErrorNotice error={error || createMutation.error || updateMutation.error || deleteMutation.error} /> : null}

      {showCreate ? <CreateProjectForm
        pending={createMutation.isPending}
        onCancel={() => setShowCreate(false)}
        onSubmit={(draft) => createMutation.mutate(draft)}
      /> : null}

      <section className="grid gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 md:grid-cols-[minmax(0,1fr)_200px_auto]">
        <label className="relative block min-w-0">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} placeholder="Search name, domain, or requirements" className={`${fieldClass} pl-10`} aria-label="Search projects" />
        </label>
        <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1) }} className={fieldClass} aria-label="Filter by project status">
          <option value="ALL">All statuses</option><option value="DRAFT">Draft</option><option value="ANALYZING">Analyzing</option><option value="COMPLETED">Completed</option><option value="FAILED">Failed</option>
        </select>
        <p className="flex items-center px-1 text-sm text-slate-400">{filtered.length} {filtered.length === 1 ? 'project' : 'projects'}</p>
      </section>

      {isLoading ? <LoadingState label="Loading your projects..." /> : null}
      {!isLoading && filtered.length === 0 ? (
        <EmptyState title={search || status !== 'ALL' ? 'No matching projects' : 'Your workspace is ready'}
          description={search || status !== 'ALL' ? 'Try changing the search text or status filter.' : 'Create a project to start capturing requirements and generating a blueprint.'}
          action={!search && status === 'ALL' ? <button onClick={() => setShowCreate(true)} className="text-cyan-300 hover:text-cyan-200">Create your first project</button> : undefined}
        />
      ) : null}

      <section className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {visibleProjects.map((project) => (
          <ProjectCard
            key={project.id}
            project={project}
            ownerName={session.user.name}
            editing={editingId === project.id}
            editDraft={editDraft}
            saving={updateMutation.isPending}
            deleting={deleteMutation.isPending}
            onEdit={() => {
              setEditingId(project.id)
              setEditDraft({
                name: project.name,
                description: project.description,
                domain: project.domain,
                requirements: project.requirements,
                status: project.status,
              })
            }}
            onEditDraft={setEditDraft}
            onCancelEdit={() => setEditingId(null)}
            onSaveEdit={() => updateMutation.mutate({ id: project.id, draft: editDraft })}
            onDelete={() => {
              if (window.confirm(`Delete "${project.name}"? This cannot be undone.`)) deleteMutation.mutate(project.id)
            }}
          />
        ))}
      </section>

      {filtered.length > pageSize ? (
        <nav aria-label="Project pages" className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
          <button disabled={page <= 1} onClick={() => setPage((current) => current - 1)} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-40"><ArrowLeft className="h-4 w-4" /> Previous</button>
          <span className="text-sm text-slate-400">Page {page} of {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-40">Next <ArrowRight className="h-4 w-4" /></button>
        </nav>
      ) : null}
    </div>
  )
}

function CreateProjectForm({
  pending,
  onCancel,
  onSubmit,
}: {
  pending: boolean
  onCancel: () => void
  onSubmit: (draft: ProjectDraft) => void
}) {
  const [name, setName] = useState('')
  const [domain, setDomain] = useState('')
  const [description, setDescription] = useState('')
  const [requirements, setRequirements] = useState('')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    onSubmit({ name: name.trim(), domain: domain.trim() || 'General', description: description.trim(), requirements: requirements.trim(), status: 'DRAFT' })
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-cyan-400/20 bg-slate-900/80 p-5 sm:p-6">
      <div><h2 className="font-semibold text-white">Create a project</h2><p className="mt-1 text-sm text-slate-400">Start with the project idea and its initial requirements.</p></div>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block text-sm text-slate-300">Project name<input required minLength={3} maxLength={120} value={name} onChange={(event) => setName(event.target.value)} className={`${fieldClass} mt-2`} placeholder="e.g. QuickBite Food Delivery" /></label>
        <label className="block text-sm text-slate-300">Domain<input value={domain} onChange={(event) => setDomain(event.target.value)} className={`${fieldClass} mt-2`} placeholder="e.g. FoodTech" /></label>
      </div>
      <label className="block text-sm text-slate-300">Short description<textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={2} className={`${fieldClass} mt-2 resize-y`} placeholder="What problem will this product solve?" /></label>
      <label className="block text-sm text-slate-300">Requirements<textarea value={requirements} onChange={(event) => setRequirements(event.target.value)} rows={4} className={`${fieldClass} mt-2 resize-y`} placeholder="Describe the users, workflows, and important constraints..." /></label>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancel} className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm text-slate-300 hover:border-slate-500">Cancel</button>
        <button disabled={pending || name.trim().length < 3} className="rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50">{pending ? 'Creating...' : 'Create project'}</button>
      </div>
    </form>
  )
}

function ProjectCard({
  project,
  ownerName,
  editing,
  editDraft,
  saving,
  deleting,
  onEdit,
  onEditDraft,
  onCancelEdit,
  onSaveEdit,
  onDelete,
}: {
  project: Project
  ownerName: string
  editing: boolean
  editDraft: ProjectDraft
  saving: boolean
  deleting: boolean
  onEdit: () => void
  onEditDraft: (draft: ProjectDraft) => void
  onCancelEdit: () => void
  onSaveEdit: () => void
  onDelete: () => void
}) {
  return (
    <article className="flex min-w-0 flex-col rounded-2xl border border-slate-800 bg-slate-900/75 p-5 transition hover:border-slate-700">
      {editing ? (
        <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); onSaveEdit() }}>
          <input required minLength={3} aria-label="Project name" value={editDraft.name} onChange={(event) => onEditDraft({ ...editDraft, name: event.target.value })} className={fieldClass} />
          <input aria-label="Project domain" value={editDraft.domain ?? ''} onChange={(event) => onEditDraft({ ...editDraft, domain: event.target.value })} className={fieldClass} />
          <select aria-label="Project status" value={editDraft.status ?? 'DRAFT'} onChange={(event) => onEditDraft({ ...editDraft, status: event.target.value as Project['status'] })} className={fieldClass}>
            <option value="DRAFT">Draft</option><option value="ANALYZING">Analyzing</option><option value="COMPLETED">Completed</option><option value="FAILED">Failed</option>
          </select>
          <textarea aria-label="Project description" rows={2} value={editDraft.description ?? ''} onChange={(event) => onEditDraft({ ...editDraft, description: event.target.value })} className={fieldClass} />
          <textarea aria-label="Project requirements" rows={4} value={editDraft.requirements ?? ''} onChange={(event) => onEditDraft({ ...editDraft, requirements: event.target.value })} className={fieldClass} />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onCancelEdit} className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300">Cancel</button>
            <button disabled={saving} className="rounded-lg bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50">{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </form>
      ) : (
        <>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0"><p className="truncate text-xs font-medium uppercase tracking-[0.18em] text-cyan-300">{project.domain || 'General'}</p><h2 className="mt-2 line-clamp-2 text-lg font-semibold text-white">{project.name}</h2></div>
            <ProjectStatus status={project.status} />
          </div>
          <p className="mt-3 line-clamp-2 min-h-10 text-sm leading-5 text-slate-400">{project.description || project.requirements || 'No project description yet.'}</p>
          <div className="mt-5 flex items-center justify-between gap-3 border-t border-slate-800 pt-4 text-xs text-slate-500">
            <span className="truncate">{ownerName}</span><span className="flex shrink-0 items-center gap-1"><Clock3 className="h-3.5 w-3.5" />{formatDate(project.updated_at)}</span>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <Link to={`/projects/${encodeURIComponent(project.id)}`} className="inline-flex items-center gap-2 rounded-lg bg-cyan-400/10 px-3 py-2 text-sm font-medium text-cyan-200 hover:bg-cyan-400/15">
              Open workspace <ArrowRight className="h-4 w-4" />
            </Link>
            <div className="flex gap-1">
              <button onClick={onEdit} aria-label={`Edit ${project.name}`} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"><Pencil className="h-4 w-4" /></button>
              <button disabled={deleting} onClick={onDelete} aria-label={`Delete ${project.name}`} className="rounded-lg p-2 text-slate-400 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50"><Trash2 className="h-4 w-4" /></button>
            </div>
          </div>
        </>
      )}
    </article>
  )
}

export function ProjectWorkspacePage({ session }: { session: AuthSession }) {
  const { projectId = '' } = useParams()
  const queryClient = useQueryClient()
  const { data: projects = [], isLoading, error: projectsError } = useProjectList(session)
  const project = projects.find((item) => item.id === projectId)

  const [analysis, setAnalysis] = useState<RequirementAnalysis | null>(null)
  const [technology, setTechnology] = useState<TechnologyRecommendation | null>(null)
  const [architecture, setArchitecture] = useState<SoftwareArchitecture | null>(null)
  const [databaseDesign, setDatabaseDesign] = useState<MongoDatabaseDesign | null>(null)
  const [apiDesign, setApiDesign] = useState<RestApiDesign | null>(null)
  const [diagrams, setDiagrams] = useState<ProjectDiagrams | null>(null)
  const [dataset, setDataset] = useState<SyntheticDataset | null>(null)
  const [documentation, setDocumentation] = useState<ProjectDocumentation | null>(null)
  const [documentationPrompt, setDocumentationPrompt] = useState(DEFAULT_DOCUMENTATION_PROMPT)
  const [datasetCounts, setDatasetCounts] = useState<Record<string, number> | null>(null)
  const [wordExporting, setWordExporting] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const reportError = (cause: unknown) => setError(cause)
  const handleWordExport = async () => {
    if (!project || !documentation) return
    setWordExporting(true)
    setError(null)
    try {
      const wordDiagrams = await fetchProjectDiagramsForWord(session.token, project)
      const safeName = project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project'
      await downloadTechnicalBlueprintWord(
        documentation.markdown,
        wordDiagrams,
        `${safeName}-technical-blueprint.docx`,
      )
    } catch (cause) {
      setError(cause)
    } finally {
      setWordExporting(false)
    }
  }
  const runAnalysis = useMutation({
    mutationFn: () => analyzeProjectRequirements(session.token, project!),
    onSuccess: (result) => { setAnalysis(result); setError(null) },
    onError: reportError,
  })
  const runDataset = useMutation({
    mutationFn: (counts: Record<string, number>) => generateProjectDataset(session.token, project!, counts),
    onSuccess: (result) => { setDataset(result); setError(null) },
    onError: reportError,
  })
  const loadDataset = useMutation({
    mutationFn: () => fetchProjectDataset(session.token, projectId),
    onSuccess: (result) => { setDataset(result); setError(null) },
    onError: reportError,
  })
  const runDocumentation = useMutation({
    mutationFn: (prompt: string) => generateProjectDocumentation(session.token, project!, prompt),
    onSuccess: (result) => {
      setDocumentation(result)
      setDocumentationPrompt(result.generation_prompt)
      setError(null)
    },
    onError: reportError,
  })
  const loadDocumentation = useMutation({
    mutationFn: () => fetchProjectDocumentation(session.token, projectId),
    onSuccess: (result) => {
      setDocumentation(result)
      setDocumentationPrompt(result.generation_prompt)
      setError(null)
    },
    onError: reportError,
  })
  const loadAnalysis = useMutation({
    mutationFn: () => fetchProjectRequirementAnalysis(session.token, projectId),
    onSuccess: (result) => { setAnalysis(result); setError(null) },
    onError: reportError,
  })
  const runTechnology = useMutation({
    mutationFn: () => recommendProjectTechnology(session.token, project!),
    onSuccess: (result) => { setTechnology(result); setError(null) },
    onError: reportError,
  })
  const loadTechnology = useMutation({
    mutationFn: () => fetchProjectTechnologyRecommendation(session.token, projectId),
    onSuccess: (result) => { setTechnology(result); setError(null) },
    onError: reportError,
  })
  const runArchitecture = useMutation({
    mutationFn: () => generateProjectArchitecture(session.token, project!),
    onSuccess: (result) => { setArchitecture(result); setError(null) },
    onError: reportError,
  })
  const loadArchitecture = useMutation({
    mutationFn: () => fetchProjectArchitecture(session.token, projectId),
    onSuccess: (result) => { setArchitecture(result); setError(null) },
    onError: reportError,
  })
  const runDatabase = useMutation({
    mutationFn: () => generateProjectDatabaseDesign(session.token, project!),
    onSuccess: (result) => { setDatabaseDesign(result); setError(null) },
    onError: reportError,
  })
  const loadDatabase = useMutation({
    mutationFn: () => fetchProjectDatabaseDesign(session.token, projectId),
    onSuccess: (result) => { setDatabaseDesign(result); setError(null) },
    onError: reportError,
  })
  const runApiDesign = useMutation({
    mutationFn: () => generateProjectApiDesign(session.token, project!),
    onSuccess: (result) => { setApiDesign(result); setError(null) },
    onError: reportError,
  })
  const loadApiDesign = useMutation({
    mutationFn: () => fetchProjectApiDesign(session.token, projectId),
    onSuccess: (result) => { setApiDesign(result); setError(null) },
    onError: reportError,
  })
  const runDiagrams = useMutation({
    mutationFn: () => generateProjectDiagrams(session.token, project!),
    onSuccess: (result) => { setDiagrams(result); setError(null) },
    onError: reportError,
  })
  const loadDiagrams = useMutation({
    mutationFn: () => fetchProjectDiagrams(session.token, projectId, project!),
    onSuccess: (result) => { setDiagrams(result); setError(null) },
    onError: reportError,
  })
  const loadDatasetDesign = useMutation({
    mutationFn: () => fetchProjectDatabaseDesign(session.token, projectId),
    onSuccess: (design) => {
      setDatabaseDesign(design)
      setDatasetCounts(defaultDatasetCounts(design))
      setError(null)
    },
    onError: reportError,
  })
  const changeDatasetCount = (collectionName: string, count: number) => {
    if (!databaseDesign) return
    setDatasetCounts((current) => {
      if (!current) return current
      const next = { ...current, [collectionName]: count }
      for (const relationship of databaseDesign.relationships) {
        if (
          relationship.cardinality.toLowerCase().replace(/\s/g, '') === 'one-to-one'
          && [relationship.from_collection, relationship.to_collection].includes(collectionName)
        ) {
          const otherName = relationship.from_collection === collectionName
            ? relationship.to_collection
            : relationship.from_collection
          next[otherName] = count
        }
      }
      return next
    })
  }
  const updateRequirements = useMutation({
    mutationFn: (draft: ProjectDraft) => updateProject(session.token, projectId, draft),
    onSuccess: (updated) => {
      queryClient.setQueryData<Project[]>(projectsKey(session.token), (current = []) =>
        current.map((item) => item.id === updated.id ? updated : item),
      )
      setAnalysis(null)
      setTechnology(null)
      setArchitecture(null)
      setDatabaseDesign(null)
      setApiDesign(null)
      setDiagrams(null)
      setDataset(null)
      setDocumentation(null)
      setDatasetCounts(null)
      setError(null)
    },
    onError: reportError,
  })
  const busy = updateRequirements.isPending || runAnalysis.isPending || loadAnalysis.isPending || runTechnology.isPending || loadTechnology.isPending
    || runArchitecture.isPending || loadArchitecture.isPending || runDatabase.isPending || loadDatabase.isPending
    || runApiDesign.isPending || loadApiDesign.isPending || runDiagrams.isPending || loadDiagrams.isPending
    || runDataset.isPending || loadDataset.isPending || runDocumentation.isPending || loadDocumentation.isPending || wordExporting

  if (isLoading) return <LoadingState label="Loading project workspace..." />
  if (projectsError) return <ErrorNotice error={projectsError} />
  if (!project) return <EmptyState title="Project not found" description="It may have been deleted, or it is not available in this workspace." action={<Link to="/projects" className="text-cyan-300 hover:text-cyan-200">Return to projects</Link>} />

  const requirementsReady = project.requirements.trim().length >= 20
  const stageActions = [
    { title: 'Requirement analysis', detail: 'Functional and non-functional requirements, user roles, modules, and risks.', run: () => runAnalysis.mutate(), load: () => loadAnalysis.mutate(), runLabel: 'Analyze requirements', busy: runAnalysis.isPending || loadAnalysis.isPending, complete: Boolean(analysis), tone: 'cyan' },
    { title: 'Technology recommendations', detail: 'Recommended stack, rationale, alternatives, and trade-offs.', run: () => runTechnology.mutate(), load: () => loadTechnology.mutate(), runLabel: 'Recommend stack', busy: runTechnology.isPending || loadTechnology.isPending, complete: Boolean(technology), tone: 'violet' },
    { title: 'Software architecture', detail: 'Components, connections, design decisions, and system diagram.', run: () => runArchitecture.mutate(), load: () => loadArchitecture.mutate(), runLabel: 'Generate architecture', busy: runArchitecture.isPending || loadArchitecture.isPending, complete: Boolean(architecture), tone: 'emerald' },
    { title: 'MongoDB database design', detail: 'Collections, BSON fields, primary and foreign keys, indexes, and ER diagram.', run: () => runDatabase.mutate(), load: () => loadDatabase.mutate(), runLabel: 'Generate database design', busy: runDatabase.isPending || loadDatabase.isPending, complete: Boolean(databaseDesign), tone: 'amber' },
    { title: 'REST API design', detail: 'Versioned endpoints, access roles, request and response contracts, and OpenAPI documentation.', run: () => runApiDesign.mutate(), load: () => loadApiDesign.mutate(), runLabel: 'Generate API design', busy: runApiDesign.isPending || loadApiDesign.isPending, complete: Boolean(apiDesign), tone: 'blue' },
    { title: 'UML and workflow diagrams', detail: 'Use cases, API sequence, domain classes, entity relationships, and module hierarchy.', run: () => runDiagrams.mutate(), load: () => loadDiagrams.mutate(), runLabel: 'Generate UML diagrams', busy: runDiagrams.isPending || loadDiagrams.isPending, complete: Boolean(diagrams), tone: 'indigo' },
    { title: 'Synthetic development dataset', detail: 'Choose a realistic population per collection and generate connected records with valid references.', run: () => { if (datasetCounts) runDataset.mutate(datasetCounts) }, load: () => loadDataset.mutate(), runLabel: 'Generate sample data', busy: runDataset.isPending || loadDataset.isPending, complete: Boolean(dataset), tone: 'cyan', configure: <DatasetCountControls design={databaseDesign} counts={datasetCounts} loading={loadDatasetDesign.isPending} onLoad={() => loadDatasetDesign.mutate()} onChange={changeDatasetCount} />, runDisabled: !datasetCounts },
    { title: 'Technical documentation', detail: 'Describe the documentation you need; the blueprint will use that prompt and the saved project artifacts.', run: () => runDocumentation.mutate(documentationPrompt), load: () => loadDocumentation.mutate(), runLabel: 'Generate documentation', busy: runDocumentation.isPending || loadDocumentation.isPending, complete: Boolean(documentation), tone: 'violet', configure: <DocumentationPromptControls prompt={documentationPrompt} onChange={setDocumentationPrompt} />, runDisabled: documentationPrompt.trim().length < 10 },
  ]

  return (
    <div className="space-y-7">
      <Link to="/projects" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white"><ArrowLeft className="h-4 w-4" /> Back to projects</Link>
      <section className="rounded-3xl border border-slate-800 bg-slate-900/75 p-5 sm:p-7">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-start">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">{project.domain || 'General'} · Project workspace</p>
            <h1 className="mt-2 break-words text-2xl font-semibold text-white sm:text-3xl">{project.name}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">{project.description || 'Project blueprint workspace'}</p>
          </div>
          <ProjectStatus status={project.status} />
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <InfoTile label="Owner" value={session.user.name} />
          <InfoTile label="Updated" value={formatDate(project.updated_at)} />
          <InfoTile label="Requirements" value={`${project.requirements.trim().length} characters`} />
        </div>
        <RequirementsEditor
          requirements={project.requirements}
          saving={updateRequirements.isPending}
        onSave={async (requirements) => {
          try {
            await updateRequirements.mutateAsync({ name: project.name, requirements })
            return true
          } catch {
            return false
          }
        }}
        />
      </section>

      {error ? <ErrorNotice error={error} /> : null}
      {!requirementsReady ? <p className="rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-sm text-amber-100">Add at least 20 characters of requirements to run the blueprint workflow.</p> : null}
      {busy ? <p aria-live="polite" className="text-sm text-cyan-200">Generating your project artifact...</p> : null}

      <section>
        <div className="mb-4"><h2 className="text-xl font-semibold text-white">Blueprint workflow</h2><p className="mt-1 text-sm text-slate-400">Generate each artifact or reopen the latest saved result.</p></div>
        <div className="grid gap-4 md:grid-cols-2">
          {stageActions.map((stage, index) => (
            <WorkflowStage
              key={stage.title}
              index={index + 1}
              {...stage}
              disabled={!requirementsReady || busy}
              onRun={stage.run}
              configure={stage.configure}
              runDisabled={stage.runDisabled}
              onLoad={stage.load}
            />
          ))}
        </div>
      </section>

      {analysis ? <RequirementPanel analysis={analysis} onClose={() => setAnalysis(null)} /> : null}
      {technology ? <TechnologyPanel recommendation={technology} onClose={() => setTechnology(null)} /> : null}
      {architecture ? <ArchitecturePanel architecture={architecture} onClose={() => setArchitecture(null)} /> : null}
      {databaseDesign ? <DatabasePanel design={databaseDesign} onClose={() => setDatabaseDesign(null)} /> : null}
      {apiDesign ? <ApiDesignPanel design={apiDesign} onClose={() => setApiDesign(null)} /> : null}
      {diagrams ? <DiagramsPanel diagrams={diagrams} onClose={() => setDiagrams(null)} /> : null}
      {dataset ? <DatasetPanel dataset={dataset} onClose={() => setDataset(null)} /> : null}
      {documentation ? <DocumentationPanel documentation={documentation} onClose={() => setDocumentation(null)} onDownloadWord={() => void handleWordExport()} wordExporting={wordExporting} /> : null}
    </div>
  )
}

function RequirementsEditor({ requirements, saving, onSave }: { requirements: string; saving: boolean; onSave: (value: string) => Promise<boolean> }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(requirements)
  return (
    <section className="mt-6 border-t border-slate-800 pt-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-200">Project requirements</h2>
        <button onClick={() => { setValue(requirements); setEditing((current) => !current) }} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-slate-500"><Pencil className="h-3.5 w-3.5" />{editing ? 'Cancel' : 'Edit'}</button>
      </div>
      {editing ? (
        <form className="mt-3 space-y-3" onSubmit={(event) => { event.preventDefault(); void onSave(value).then((saved) => { if (saved) setEditing(false) }) }}>
          <textarea autoFocus rows={6} value={value} onChange={(event) => setValue(event.target.value)} className={`${fieldClass} resize-y`} aria-label="Project requirements" />
          <div className="flex justify-end"><button disabled={saving} className="rounded-lg bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50">{saving ? 'Saving...' : 'Save requirements'}</button></div>
        </form>
      ) : <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-300">{requirements || 'No requirements have been added yet.'}</p>}
    </section>
  )
}

function DocumentationPromptControls({
  prompt,
  onChange,
}: {
  prompt: string
  onChange: (prompt: string) => void
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
      <label htmlFor="documentation-prompt" className="text-xs font-semibold text-slate-200">
        Describe the documentation you want
      </label>
      <p className="mt-1 text-xs leading-5 text-slate-500">
        Specify the audience, format, sections, level of detail, or technical topics to emphasize (10–4000 characters).
      </p>
      <textarea
        id="documentation-prompt"
        value={prompt}
        onChange={(event) => onChange(event.target.value)}
        minLength={10}
        maxLength={4000}
        rows={4}
        className={`${fieldClass} mt-2 resize-y`}
        placeholder="Example: Create a concise deployment handoff for backend developers. Emphasize API contracts, MongoDB indexes, security, testing, and Docker release steps."
      />
      <p className="mt-1 text-right text-[11px] text-slate-500">{prompt.length}/4000</p>
    </div>
  )
}

function defaultDatasetCounts(design: MongoDatabaseDesign): Record<string, number> {
  const counts = Object.fromEntries(design.collections.map((collection) => [collection.name, 10]))
  for (let pass = 0; pass < design.relationships.length; pass += 1) {
    for (const relationship of design.relationships) {
      const cardinality = relationship.cardinality.toLowerCase().replace(/\s/g, '')
      if (cardinality === 'many-to-one') {
        counts[relationship.from_collection] = Math.min(
          500,
          Math.max(counts[relationship.from_collection], counts[relationship.to_collection] * 2),
        )
      } else if (cardinality === 'one-to-many') {
        counts[relationship.to_collection] = Math.min(
          500,
          Math.max(counts[relationship.to_collection], counts[relationship.from_collection] * 2),
        )
      } else if (cardinality === 'one-to-one') {
        const equalCount = Math.max(
          counts[relationship.from_collection],
          counts[relationship.to_collection],
        )
        counts[relationship.from_collection] = equalCount
        counts[relationship.to_collection] = equalCount
      }
    }
  }
  return counts
}

function DatasetCountControls({
  design,
  counts,
  loading,
  onLoad,
  onChange,
}: {
  design: MongoDatabaseDesign | null
  counts: Record<string, number> | null
  loading: boolean
  onLoad: () => void
  onChange: (collectionName: string, count: number) => void
}) {
  if (!design || !counts) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
        <p className="text-xs leading-5 text-slate-400">Set separate record counts for each collection before generating the dataset.</p>
        <button
          type="button"
          disabled={loading}
          onClick={onLoad}
          className="mt-3 rounded-lg border border-slate-700 px-3 py-2 text-xs font-medium text-slate-200 hover:border-cyan-400/40 hover:text-white disabled:opacity-50"
        >
          {loading ? 'Loading database design...' : 'Configure collection sizes'}
        </button>
      </div>
    )
  }
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0)
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs font-semibold text-slate-200">Records per collection</p>
        <p className="text-xs text-slate-500">{total.toLocaleString()} total · 1–500 each</p>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {design.collections.map((collection) => (
          <label key={collection.name} className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2">
            <span className="min-w-0 truncate text-xs text-slate-300">{collection.name}</span>
            <input
              type="number"
              min={1}
              max={500}
              step={1}
              value={counts[collection.name]}
              onChange={(event) => {
                const parsed = Number.parseInt(event.target.value, 10)
                if (Number.isInteger(parsed)) onChange(collection.name, Math.max(1, Math.min(500, parsed)))
              }}
              aria-label={`${collection.name} record count`}
              className="w-20 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-right text-xs text-white outline-none focus:border-cyan-400"
            />
          </label>
        ))}
      </div>
      {design.relationships.some((relationship) => relationship.cardinality.toLowerCase().replace(/\s/g, '') === 'one-to-one') ? (
        <p className="mt-2 text-[11px] leading-4 text-slate-500">Counts connected by a one-to-one relationship stay equal automatically.</p>
      ) : null}
    </div>
  )
}

function WorkflowStage({
  index, title, detail, runLabel, complete, busy, disabled, tone, onRun, onLoad, configure, runDisabled,
}: {
  index: number
  title: string
  detail: string
  runLabel: string
  complete: boolean
  busy: boolean
  disabled: boolean
  tone: string
  onRun: () => void
  onLoad: () => void
  configure?: ReactNode
  runDisabled?: boolean
}) {
  const colors: Record<string, string> = {
    cyan: 'border-cyan-400/20 text-cyan-200',
    violet: 'border-violet-400/20 text-violet-200',
    emerald: 'border-emerald-400/20 text-emerald-200',
    amber: 'border-amber-400/20 text-amber-200',
    blue: 'border-sky-400/20 text-sky-200',
    indigo: 'border-indigo-400/20 text-indigo-200',
  }
  return (
    <article className="flex h-full min-w-0 flex-col rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
      <div className="flex items-start gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border bg-slate-950 text-sm font-semibold ${colors[tone]}`}>{complete ? <Check className="h-4 w-4" /> : String(index).padStart(2, '0')}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-white">{title}</h3>{complete ? <span className="rounded-full bg-emerald-400/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-200">Loaded</span> : null}</div>
          <p className="mt-1 text-sm leading-5 text-slate-400">{detail}</p>
        </div>
      </div>
      {configure ? <div className="mt-4 sm:pl-12">{configure}</div> : null}
      <div className="mt-auto flex flex-wrap gap-2 pt-5 sm:pl-12">
        <button disabled={disabled || busy || runDisabled} onClick={onRun} className="inline-flex min-h-10 items-center justify-center rounded-lg bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-45">{busy ? 'Working...' : runLabel}</button>
        <button disabled={disabled || busy} onClick={onLoad} className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 transition hover:border-slate-500 hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-45">View saved</button>
      </div>
    </article>
  )
}

function RequirementPanel({ analysis, onClose }: { analysis: RequirementAnalysis; onClose: () => void }) {
  const sections: Array<{ title: string; values: string[]; display?: 'chips' }> = [
    { title: 'Functional requirements', values: analysis.functional_requirements },
    { title: 'Non-functional requirements', values: analysis.non_functional_requirements },
    { title: 'User roles', values: analysis.user_roles, display: 'chips' },
    { title: 'Modules', values: analysis.modules, display: 'chips' },
    { title: 'Business rules', values: analysis.business_rules },
    { title: 'Assumptions', values: analysis.assumptions },
    { title: 'Risks to review', values: analysis.risks },
    { title: 'Open questions', values: analysis.missing_information },
  ]
  return (
    <ArtifactPanel eyebrow="Requirement analysis · Demo agent" title="Requirement analysis" summary={analysis.project_summary} date={analysis.created_at} tone="cyan" onClose={onClose}>
      <div className="grid gap-4 md:grid-cols-2">
        {sections.map(({ title, values, display }) => (
          <ReportSection key={title} title={title} values={values} display={display} />
        ))}
      </div>
    </ArtifactPanel>
  )
}

function ReportSection({ title, values, display }: { title: string; values: string[]; display?: 'chips' }) {
  if (!values.length) return null

  return (
    <section className="min-w-0 rounded-xl border border-slate-800/90 bg-slate-900/55 p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
        <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-slate-800 px-2 text-xs font-medium tabular-nums text-slate-400">
          {values.length}
        </span>
      </div>
      {display === 'chips' ? (
        <div className="flex flex-wrap gap-2">
          {values.map((value, index) => (
            <span key={`${title}-${index}`} className="max-w-full rounded-lg border border-cyan-400/15 bg-cyan-400/[0.06] px-2.5 py-1.5 text-sm leading-5 text-cyan-100">
              {value}
            </span>
          ))}
        </div>
      ) : (
        <ul className="space-y-2">
          {values.map((value, index) => (
            <li key={`${title}-${index}`} className="flex min-w-0 gap-3 rounded-lg bg-slate-950/55 px-3 py-2.5 text-sm leading-5 text-slate-300">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-400/80" aria-hidden="true" />
              <span className="min-w-0 break-words">{value}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function TechnologyPanel({ recommendation, onClose }: { recommendation: TechnologyRecommendation; onClose: () => void }) {
  return (
    <ArtifactPanel eyebrow="Technology recommendations · Demo agent" title="Suggested technology stack" summary={recommendation.project_summary} date={recommendation.created_at} tone="violet" onClose={onClose}>
      <div className="grid gap-4 lg:grid-cols-2">
        {recommendation.recommendations.map((item) => (
          <article key={item.category} className="min-w-0 rounded-xl border border-slate-800 bg-slate-900/70 p-4">
            <h4 className="font-semibold text-violet-200">{item.category}</h4><p className="mt-2 break-words text-sm font-medium text-white">{item.recommendation}</p><p className="mt-2 text-sm leading-5 text-slate-300">{item.rationale}</p>
            <p className="mt-3 text-xs font-semibold uppercase text-slate-500">Alternatives</p><p className="mt-1 break-words text-sm text-slate-300">{item.alternatives.join(' · ') || 'None listed'}</p>
            <StringList title="Trade-offs" values={item.trade_offs} />
          </article>
        ))}
      </div>
    </ArtifactPanel>
  )
}

function ArchitecturePanel({ architecture, onClose }: { architecture: SoftwareArchitecture; onClose: () => void }) {
  return (
    <ArtifactPanel eyebrow="Software architecture · Demo agent" title={architecture.architectural_style} summary={architecture.project_summary} date={architecture.created_at} tone="emerald" onClose={onClose}>
      <MermaidDiagram id={`architecture-${architecture.project_id}`} source={architecture.mermaid_diagram} label="Software architecture component diagram" />
      <h3 className="mb-3 mt-6 font-semibold text-white">Components</h3>
      <div className="grid gap-3 md:grid-cols-2">
        {architecture.components.map((component) => <article key={component.id} className="min-w-0 rounded-xl border border-slate-800 bg-slate-900/70 p-4"><div className="flex flex-wrap items-start justify-between gap-2"><h4 className="font-semibold text-emerald-200">{component.name}</h4><span className="rounded-full border border-slate-700 px-2 py-1 text-xs text-slate-400">{component.component_type}</span></div><p className="mt-2 text-sm text-slate-300">{component.description}</p><p className="mt-2 break-words text-xs text-slate-400">{component.technologies.join(' · ')}</p></article>)}
      </div>
      <StringList title="Key design decisions" values={architecture.design_decisions} />
    </ArtifactPanel>
  )
}

function DatabasePanel({ design, onClose }: { design: MongoDatabaseDesign; onClose: () => void }) {
  return (
    <ArtifactPanel eyebrow="MongoDB database design · Demo agent" title={design.database_name} summary={design.project_summary} date={design.created_at} tone="amber" onClose={onClose}>
      <MermaidDiagram id={`database-design-${design.project_id}`} source={buildChenEntityRelationshipDiagram(design.collections, design.relationships)} label="Chen-style Entity-Relationship diagram" />
      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        {design.collections.map((collection) => (
          <article key={collection.name} className="min-w-0 overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70 p-4">
            <h3 className="font-semibold text-amber-200">{collection.name}</h3><p className="mt-1 text-sm text-slate-300">{collection.purpose}</p>
            <div className="mt-3 rounded-lg border border-amber-400/20 bg-amber-400/5 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-200">Primary key</p><p className="mt-1 break-all font-mono text-sm text-slate-100">{collection.primary_key} → {collection.name}.{collection.primary_key}</p>
              <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-amber-200">Foreign keys</p>
              {collection.foreign_keys.length ? <ul className="mt-1 space-y-1 text-sm text-slate-300">{collection.foreign_keys.map((foreignKey) => <li key={`${foreignKey.field}-${foreignKey.references_collection}`} className="break-words"><span className="font-mono text-slate-100">{foreignKey.field} → {foreignKey.references_collection}.{foreignKey.references_field}</span><span className="text-slate-400"> — {foreignKey.description}</span></li>)}</ul> : <p className="mt-1 text-sm text-slate-400">None</p>}
            </div>
            <div className="mt-3 overflow-x-auto rounded-lg border border-slate-800">
              <table className="w-full min-w-[520px] text-left text-xs"><thead className="bg-slate-950 text-slate-400"><tr><th className="p-2">Field</th><th className="p-2">BSON type</th><th className="p-2">Required</th><th className="p-2">Description</th></tr></thead><tbody className="divide-y divide-slate-800 text-slate-300">{collection.fields.map((field) => <tr key={field.name}><td className="break-all p-2 font-mono text-amber-100">{field.name}</td><td className="p-2 font-mono">{field.bson_type}</td><td className="p-2">{field.required ? 'Yes' : 'No'}</td><td className="min-w-44 p-2">{field.description}</td></tr>)}</tbody></table>
            </div>
            <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Indexes</p><p className="mt-1 break-words text-sm text-slate-300">{collection.indexes.join(' · ') || 'No additional indexes specified'}</p>
            <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Embedding strategy</p><p className="mt-1 text-sm leading-5 text-slate-300">{collection.embedding_strategy}</p>
          </article>
        ))}
      </div>
      <StringList title="Design decisions" values={design.design_decisions} />
    </ArtifactPanel>
  )
}

function DatasetPanel({ dataset, onClose }: { dataset: SyntheticDataset; onClose: () => void }) {
  const download = (content: string, filename: string, mimeType: string) => {
    const url = URL.createObjectURL(new Blob([content], { type: mimeType }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }
  const safeName = dataset.project_summary.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project'
  const totalRecords = Object.values(dataset.records_by_collection).reduce((sum, count) => sum + count, 0)
  const downloadJson = () => download(
    JSON.stringify(dataset, null, 2),
    `${safeName}-synthetic-dataset.json`,
    'application/json;charset=utf-8',
  )
  const downloadCsv = () => {
    const records: Record<string, unknown>[] = []
    for (const collection of dataset.collections) {
      for (const record of collection.records) {
        records.push({ collection: collection.name, ...record })
      }
    }
    const columns = ['collection', ...new Set(records.flatMap((record) => Object.keys(record)))]
    const cell = (value: unknown) => {
      const text = value === undefined ? '' : typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value)
      return `"${text.replace(/"/g, '""')}"`
    }
    const csv = [
      columns.map(cell).join(','),
      ...records.map((record) => columns.map((column) => cell(record[column])).join(',')),
    ].join('\r\n')
    download(csv, `${safeName}-synthetic-dataset.csv`, 'text/csv;charset=utf-8')
  }

  return (
    <ArtifactPanel
      eyebrow="Synthetic development dataset · Demo agent"
      title="Generated sample data"
      summary={`${dataset.project_summary} · Version ${dataset.version} · ${totalRecords.toLocaleString()} records across ${dataset.collections.length} collections, generated from the saved MongoDB design.`}
      date={dataset.created_at}
      tone="cyan"
      onClose={onClose}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <div>
          <h3 className="text-sm font-semibold text-white">Export synthetic data</h3>
          <p className="mt-1 text-xs text-slate-400">JSON preserves nested documents; CSV flattens all rows with a collection column.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={downloadJson} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 transition hover:border-cyan-400/40 hover:text-white">
            <Download className="h-4 w-4" /> Download JSON
          </button>
          <button type="button" onClick={downloadCsv} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 transition hover:border-cyan-400/40 hover:text-white">
            <Download className="h-4 w-4" /> Download CSV
          </button>
        </div>
      </div>
      <p className="rounded-lg border border-amber-400/20 bg-amber-400/5 px-3 py-2 text-xs leading-5 text-amber-100">
        All records are synthetic. Password-hash values are explicitly non-authenticating and must never be used for login.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {dataset.collections.map((collection) => (
          <article key={collection.name} className="min-w-0 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="truncate font-semibold text-cyan-200">{collection.name}</h3>
              <span className="shrink-0 rounded-full bg-slate-800 px-2 py-1 text-xs text-slate-300">{collection.records.length} records</span>
            </div>
            <details className="mt-3">
              <summary className="cursor-pointer text-xs font-medium text-slate-400 hover:text-white">Preview first {Math.min(2, collection.records.length)} records</summary>
              <pre className="mt-2 max-h-64 overflow-auto rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs leading-5 text-slate-300"><code>{JSON.stringify(collection.records.slice(0, 2), null, 2)}</code></pre>
            </details>
          </article>
        ))}
      </div>
    </ArtifactPanel>
  )
}

function DocumentationPanel({
  documentation,
  onClose,
  onDownloadWord,
  wordExporting,
}: {
  documentation: ProjectDocumentation
  onClose: () => void
  onDownloadWord: () => void
  wordExporting: boolean
}) {
  const downloadMarkdown = () => {
    const url = URL.createObjectURL(new Blob([documentation.markdown], { type: 'text/markdown;charset=utf-8' }))
    const anchor = document.createElement('a')
    const safeName = documentation.project_summary.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project'
    anchor.href = url
    anchor.download = `${safeName}-technical-blueprint.md`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  return (
    <ArtifactPanel
      eyebrow="Technical documentation · Blueprint agent"
      title="Project technical blueprint"
      summary={documentation.project_summary}
      date={documentation.created_at}
      tone="violet"
      onClose={onClose}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <div>
          <h3 className="text-sm font-semibold text-white">Download project documentation</h3>
          <p className="mt-1 text-xs text-slate-400">Word includes the blueprint, roadmap, risk register, and generated architecture/UML diagrams.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={downloadMarkdown} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 transition hover:border-cyan-400/40 hover:text-white">
            <Download className="h-4 w-4" /> Download Markdown
          </button>
          <button type="button" onClick={onDownloadWord} disabled={wordExporting} className="inline-flex items-center gap-2 rounded-lg bg-cyan-400 px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-wait disabled:opacity-60">
            <Download className="h-4 w-4" /> {wordExporting ? 'Preparing Word file...' : 'Download Word'}
          </button>
        </div>
      </div>
      <div>
        <h3 className="text-sm font-semibold text-white">Compiled from</h3>
        <p className="mt-2 text-sm text-slate-300">{documentation.source_artifacts.join(' · ')}</p>
      </div>
      <div className="rounded-xl border border-violet-400/20 bg-violet-400/5 p-4">
        <h3 className="text-sm font-semibold text-violet-100">Your documentation prompt</h3>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-300">{documentation.generation_prompt}</p>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {documentation.custom_sections.map((section) => (
          <article key={section.title} className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <h4 className="font-semibold text-violet-200">{section.title}</h4>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-300">{section.content}</p>
          </article>
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {documentation.roadmap.map((phase) => (
          <article key={phase.title} className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <h4 className="font-semibold text-cyan-200">{phase.title}</h4>
            <p className="mt-2 text-sm leading-5 text-slate-300">{phase.objective}</p>
            <StringList title="Deliverables" values={phase.deliverables} />
            <StringList title="Acceptance criteria" values={phase.acceptance_criteria} />
          </article>
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {documentation.risks.map((risk) => (
          <article key={risk.category} className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-semibold text-amber-100">{risk.category}</h4>
              <span className="text-xs text-amber-200">{risk.likelihood} likelihood · {risk.impact} impact</span>
            </div>
            <p className="mt-2 text-sm leading-5 text-slate-300">{risk.description}</p>
            <p className="mt-2 text-xs leading-5 text-slate-400"><strong className="text-slate-300">Mitigation:</strong> {risk.mitigation}</p>
          </article>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="text-sm font-semibold text-white">Suggested project structure</h3>
          <pre className="mt-2 overflow-auto rounded-xl border border-slate-800 bg-slate-950 p-4 text-xs leading-5 text-slate-300"><code>{documentation.folder_structure}</code></pre>
        </div>
        <details className="min-w-0">
          <summary className="cursor-pointer text-sm font-semibold text-slate-200 hover:text-white">Preview complete Markdown</summary>
          <pre className="mt-2 max-h-[32rem] overflow-auto rounded-xl border border-slate-800 bg-slate-950 p-4 text-xs leading-5 text-slate-300"><code>{documentation.markdown}</code></pre>
        </details>
      </div>
    </ArtifactPanel>
  )
}

function ApiDesignPanel({ design, onClose }: { design: RestApiDesign; onClose: () => void }) {
  const downloadOpenApi = () => {
    const file = new Blob([JSON.stringify(design.openapi_spec, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(file)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${design.api_title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-openapi.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }
  const methods: Record<ApiEndpoint['method'], string> = {
    GET: 'border-sky-400/20 bg-sky-400/10 text-sky-200',
    POST: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200',
    PUT: 'border-amber-400/20 bg-amber-400/10 text-amber-200',
    PATCH: 'border-violet-400/20 bg-violet-400/10 text-violet-200',
    DELETE: 'border-red-400/20 bg-red-400/10 text-red-200',
  }

  return (
    <ArtifactPanel
      eyebrow="REST API design · Demo agent"
      title={design.api_title}
      summary={design.project_summary}
      date={design.created_at}
      tone="blue"
      onClose={onClose}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <InfoTile label="API version" value={design.version} />
        <InfoTile label="Base path" value={design.base_path} />
        <InfoTile label="Operations" value={String(design.endpoints.length)} />
      </div>
      <div className="flex flex-col justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/40 p-4 sm:flex-row sm:items-center">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-white">Authentication</h3>
          <p className="mt-1 text-sm leading-5 text-slate-400">{design.authentication}</p>
        </div>
        <button
          type="button"
          onClick={downloadOpenApi}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm font-medium text-slate-200 transition hover:border-cyan-400/40 hover:bg-cyan-400/5 hover:text-white"
        >
          <Download className="h-4 w-4" /> Download OpenAPI
        </button>
      </div>

      <section>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div><h3 className="font-semibold text-white">Endpoint catalog</h3><p className="mt-1 text-sm text-slate-400">Expand an operation to inspect its contract.</p></div>
          <span className="shrink-0 text-xs text-slate-500">{design.endpoints.length} operations</span>
        </div>
        <div className="space-y-2">
          {design.endpoints.map((endpoint) => (
            <details key={`${endpoint.method}:${endpoint.path}`} className="group min-w-0 rounded-xl border border-slate-800 bg-slate-900/45 open:border-slate-700">
              <summary className="flex cursor-pointer list-none flex-col gap-2 p-3 marker:hidden hover:bg-slate-900/70 sm:flex-row sm:items-center sm:gap-3 sm:p-4">
                <div className="flex min-w-0 items-center gap-3">
                  <span className={`inline-flex w-[4.5rem] shrink-0 justify-center rounded-md border px-2 py-1 font-mono text-[11px] font-bold ${methods[endpoint.method]}`}>{endpoint.method}</span>
                  <code className="min-w-0 break-all font-mono text-xs text-slate-200 sm:text-sm">{endpoint.path}</code>
                </div>
                <span className="flex min-w-0 items-center justify-between gap-3 sm:ml-auto sm:justify-end">
                  <span className="truncate text-xs text-slate-400 sm:max-w-56">{endpoint.summary}</span>
                  <span className={`shrink-0 transition-transform group-open:rotate-180 ${endpoint.auth_required ? 'text-slate-400' : 'text-emerald-300'}`} aria-hidden="true">⌄</span>
                </span>
              </summary>
              <div className="space-y-4 border-t border-slate-800 px-4 py-4 sm:px-5">
                <p className="text-sm leading-5 text-slate-300">{endpoint.description}</p>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className={`rounded-full px-2.5 py-1 ${endpoint.auth_required ? 'bg-slate-800 text-slate-300' : 'bg-emerald-400/10 text-emerald-200'}`}>
                    {endpoint.auth_required ? 'JWT required' : 'Public'}
                  </span>
                  {endpoint.roles.length ? <span className="text-slate-500">Roles: <span className="text-slate-300">{endpoint.roles.join(', ')}</span></span> : null}
                </div>
                <div className="grid gap-4 lg:grid-cols-2">
                  <ApiFieldList title="Request contract" fields={endpoint.request_fields} emptyText="No request body fields." />
                  <div>
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Responses</h4>
                    <div className="space-y-2">
                      {endpoint.responses.map((response) => (
                        <article key={response.status_code} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                          <div className="flex items-start gap-2"><span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-xs text-cyan-200">{response.status_code}</span><p className="text-sm text-slate-300">{response.description}</p></div>
                          {response.fields.length ? <p className="mt-2 break-words text-xs text-slate-500">Fields: {response.fields.map((field) => field.name).join(', ')}</p> : null}
                        </article>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </details>
          ))}
        </div>
      </section>
      <StringList title="API design decisions" values={design.design_decisions} />
    </ArtifactPanel>
  )
}

function DiagramsPanel({ diagrams, onClose }: { diagrams: ProjectDiagrams; onClose: () => void }) {
  return (
    <ArtifactPanel eyebrow="UML and workflow diagrams · Demo agent" title="Project diagrams" summary={diagrams.project_summary} date={diagrams.created_at} tone="indigo" onClose={onClose}>
      <div className="grid gap-4">
        {diagrams.diagrams.map((diagram) => (
          <article key={diagram.diagram_type} className="min-w-0 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <h3 className="font-semibold text-indigo-200">{diagram.title}</h3>
            <p className="mt-1 text-sm text-slate-400">{diagram.description}</p>
            <MermaidDiagram id={`uml-${diagrams.project_id}-${diagram.diagram_type}`} source={diagram.mermaid_source} label={diagram.title} />
            {diagram.diagram_type === 'entity_relationship' ? (
              <ul aria-label="Entity-Relationship diagram notation" className="mt-3 flex flex-wrap gap-2 text-xs text-slate-300">
                <li className="rounded-md border border-cyan-400/30 bg-slate-950 px-2.5 py-1.5"><span className="font-semibold text-cyan-200">Rectangle</span> · Entity</li>
                <li className="rounded-md border border-indigo-400/30 bg-slate-950 px-2.5 py-1.5"><span className="font-semibold text-indigo-200">Diamond</span> · Relationship</li>
                <li className="rounded-md border border-slate-600 bg-slate-950 px-2.5 py-1.5"><span className="font-semibold text-slate-100">Oval</span> · Attribute</li>
                <li className="rounded-md border border-cyan-400/30 bg-slate-950 px-2.5 py-1.5">PK = primary key · FK = foreign key · 1/N = cardinality</li>
              </ul>
            ) : null}
            <details className="mt-3">
              <summary className="cursor-pointer text-xs font-medium text-slate-400 hover:text-white">View Mermaid source</summary>
              <pre className="mt-2 max-h-64 overflow-auto rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs leading-5 text-slate-300"><code>{diagram.mermaid_source}</code></pre>
            </details>
          </article>
        ))}
      </div>
      <StringList title="Diagram design decisions" values={diagrams.design_decisions} />
    </ArtifactPanel>
  )
}

function ApiFieldList({ title, fields, emptyText }: { title: string; fields: ApiField[]; emptyText: string }) {
  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</h4>
      {fields.length ? (
        <div className="space-y-1.5">
          {fields.map((field) => (
            <div key={field.name} className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 rounded-lg bg-slate-950/60 px-3 py-2 text-xs">
              <code className="break-all text-cyan-100">{field.name}</code>
              <span className="text-slate-500">{field.data_type}{field.required ? ' · required' : ' · optional'}</span>
              <span className="basis-full leading-4 text-slate-400">{field.description}</span>
            </div>
          ))}
        </div>
      ) : <p className="rounded-lg bg-slate-950/60 px-3 py-2 text-sm text-slate-500">{emptyText}</p>}
    </div>
  )
}

function ArtifactPanel({ eyebrow, title, summary, date, tone, children, onClose }: { eyebrow: string; title: string; summary: string; date: string; tone: string; children: ReactNode; onClose: () => void }) {
  const styles: Record<string, { border: string; accent: string; icon: string }> = {
    cyan: { border: 'border-cyan-400/20', accent: 'bg-cyan-400', icon: 'text-cyan-200' },
    blue: { border: 'border-sky-400/20', accent: 'bg-sky-400', icon: 'text-sky-200' },
    violet: { border: 'border-violet-400/20', accent: 'bg-violet-400', icon: 'text-violet-200' },
    emerald: { border: 'border-emerald-400/20', accent: 'bg-emerald-400', icon: 'text-emerald-200' },
    amber: { border: 'border-amber-400/20', accent: 'bg-amber-400', icon: 'text-amber-200' },
    indigo: { border: 'border-indigo-400/20', accent: 'bg-indigo-400', icon: 'text-indigo-200' },
  }
  const style = styles[tone]
  return (
    <section className={`relative min-w-0 overflow-hidden rounded-2xl border ${style.border} bg-slate-950/75 shadow-xl shadow-black/10`}>
      <div className={`absolute inset-x-0 top-0 h-px ${style.accent} opacity-60`} />
      <header className="flex flex-col gap-4 border-b border-slate-800/90 px-4 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6 sm:py-6">
        <div className="flex min-w-0 gap-3">
          <span className={`mt-0.5 hidden h-9 w-1 shrink-0 rounded-full ${style.accent} opacity-70 sm:block`} aria-hidden="true" />
          <div className="min-w-0">
            <p className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${style.icon}`}>{eyebrow}</p>
            <h2 className="mt-1.5 break-words text-xl font-semibold tracking-tight text-white sm:text-2xl">{title}</h2>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 sm:justify-end">
          <time className="text-xs text-slate-500">{formatDateTime(date)}</time>
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${eyebrow.split(' · ')[0]}`}
            title="Close blueprint"
            className="rounded-lg border border-slate-700 bg-slate-900/70 p-2 text-slate-400 transition hover:border-slate-500 hover:bg-slate-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>
      <div className="space-y-5 p-4 sm:space-y-6 sm:p-6">
        <div className="rounded-xl border border-slate-800 bg-slate-900/45 px-4 py-3.5 sm:px-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Project summary</p>
          <p className="mt-1.5 max-w-5xl text-sm leading-6 text-slate-300">{summary}</p>
        </div>
        {children}
      </div>
    </section>
  )
}

function StringList({ title, values }: { title: string; values: string[] }) {
  if (!values.length) return null
  return <div className="mt-4 min-w-0"><h3 className="text-sm font-semibold text-slate-200">{title}</h3><ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-5 text-slate-300">{values.map((value, index) => <li key={`${title}-${index}`} className="break-words">{value}</li>)}</ul></div>
}

function downloadDiagramSvg(svg: string, label: string) {
  const standaloneSvg = svg.includes('xmlns=')
    ? svg
    : svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ')
  const file = new Blob([standaloneSvg], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(file)
  const anchor = document.createElement('a')
  const filename = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'diagram'
  anchor.href = url
  anchor.download = `${filename}.svg`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

function MermaidDiagram({ id, source, label }: { id: string; source: string; label: string }) {
  const [svg, setSvg] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    const render = async () => {
      try {
        const result = await renderMermaidDiagram(id, source)
        if (active) { setSvg(result); setError('') }
      } catch {
        if (active) setError('Diagram rendering is unavailable. The generated blueprint details are still shown below.')
      }
    }
    void render()
    return () => { active = false }
  }, [id, source])
  return (
    <section className="mt-4 min-w-0">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-200">{label}</h3>
        {svg ? (
          <button
            type="button"
            onClick={() => downloadDiagramSvg(svg, label)}
            aria-label={`Download ${label} as SVG`}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-cyan-400/40 hover:bg-cyan-400/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
          >
            <Download className="h-3.5 w-3.5" /> Download SVG
          </button>
        ) : null}
      </div>
      {error ? <p role="alert" className="rounded-lg border border-amber-400/20 bg-amber-400/5 p-3 text-sm text-amber-100">{error}</p> : null}
      {svg ? <div aria-label={label} className="max-w-full overflow-auto rounded-xl border border-slate-800 bg-slate-900 p-3 [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full" dangerouslySetInnerHTML={{ __html: svg }} /> : !error ? <LoadingState label="Rendering diagram..." /> : null}
    </section>
  )
}

function ProjectStatus({ status }: { status: Project['status'] }) {
  const colors: Record<Project['status'], string> = {
    DRAFT: 'border-slate-700 bg-slate-800/70 text-slate-300',
    ANALYZING: 'border-blue-400/20 bg-blue-400/10 text-blue-200',
    COMPLETED: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200',
    FAILED: 'border-red-400/20 bg-red-400/10 text-red-200',
  }
  return <span className={`inline-flex w-fit shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${colors[status]}`}>{status}</span>
}

function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">{eyebrow}</p><h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">{title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">{description}</p></div>{action}</header>
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 rounded-xl border border-slate-800 bg-slate-950/60 p-3"><p className="text-[10px] font-medium uppercase tracking-[0.16em] text-slate-500">{label}</p><p className="mt-1 truncate text-sm text-slate-200">{value}</p></div>
}

function LoadingState({ label }: { label: string }) {
  return <p role="status" className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-5 text-center text-sm text-slate-400">{label}</p>
}

function ErrorNotice({ error }: { error: unknown }) {
  return <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-200">{getApiErrorMessage(error)}</div>
}

function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 px-5 py-10 text-center"><Boxes className="mx-auto h-8 w-8 text-slate-500" /><h2 className="mt-3 font-semibold text-white">{title}</h2><p className="mx-auto mt-1 max-w-md text-sm leading-5 text-slate-400">{description}</p>{action ? <div className="mt-4 text-sm">{action}</div> : null}</div>
}

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleDateString()
}

function formatDateTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Unknown date' : date.toLocaleString()
}
