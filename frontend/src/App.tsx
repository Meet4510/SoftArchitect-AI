import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import {
  BarChart3,
  Briefcase,
  Building2,
  LayoutDashboard,
  LogOut,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { type Project } from './lib/demo-data'
import {
  createProject,
  deleteProject,
  analyzeProjectRequirements,
  fetchCurrentUser,
  fetchProjectArchitecture,
  fetchProjectRequirementAnalysis,
  fetchProjects,
  getApiErrorMessage,
  loginUser,
  fetchProjectTechnologyRecommendation,
  generateProjectArchitecture,
  registerUser,
  recommendProjectTechnology,
  updateProject,
  type AuthSession,
  type ProjectDraft,
  type RequirementAnalysis,
  type SoftwareArchitecture,
  type TechnologyRecommendation,
} from './services/api'

const AUTH_KEY = 'softarchitect_auth'

function App() {
  const [session, setSession] = useState<AuthSession | null>(() => {
    const stored = localStorage.getItem(AUTH_KEY)
    if (!stored) return null
    try {
      return JSON.parse(stored) as AuthSession
    } catch {
      localStorage.removeItem(AUTH_KEY)
      return null
    }
  })
  const [isRestoring, setIsRestoring] = useState(true)

  const handleAuth = (nextSession: AuthSession | null) => {
    setSession(nextSession)
    if (nextSession) {
      localStorage.setItem(AUTH_KEY, JSON.stringify(nextSession))
      return
    }
    localStorage.removeItem(AUTH_KEY)
  }

  useEffect(() => {
    let active = true
    if (!session || session.token === 'demo-token') {
      setIsRestoring(false)
      return
    }

    fetchCurrentUser(session.token)
      .then((user) => {
        if (!active) return
        const restoredSession = { ...session, user }
        setSession(restoredSession)
        localStorage.setItem(AUTH_KEY, JSON.stringify(restoredSession))
      })
      .catch((error: unknown) => {
        if (!active) return
        if (isAxiosError(error) && error.response?.status === 401) {
          handleAuth(null)
        }
      })
      .finally(() => {
        if (active) setIsRestoring(false)
      })

    return () => {
      active = false
    }
  }, [session?.token])

  if (isRestoring) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-300">Restoring your session...</div>
  }

  return (
    <Routes>
      <Route path="/" element={<Navigate to={session ? '/dashboard' : '/login'} replace />} />
      <Route path="/login" element={<LoginPage onAuth={handleAuth} />} />
      <Route path="/register" element={<RegisterPage onAuth={handleAuth} />} />
      <Route
        path="/dashboard"
        element={session ? <DashboardPage session={session} onLogout={() => handleAuth(null)} /> : <Navigate to="/login" replace />}
      />
      <Route path="*" element={<Navigate to={session ? '/dashboard' : '/login'} replace />} />
    </Routes>
  )
}

function LoginPage({ onAuth }: { onAuth: (session: AuthSession | null) => void }) {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      const authSession = await loginUser(email, password)
      onAuth(authSession)
      navigate('/dashboard')
    } catch (loginError) {
      setError(getApiErrorMessage(loginError))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 px-6 py-12 text-slate-50">
      <div className="mx-auto max-w-6xl">
        <div className="mb-10 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500/15 ring-1 ring-cyan-400/40">
            <Sparkles className="h-6 w-6 text-cyan-300" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-cyan-300">SoftArchitect AI</p>
            <h1 className="text-2xl font-semibold">Product blueprint studio</h1>
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-8 shadow-2xl shadow-cyan-950/20">
            <p className="mb-3 text-sm font-medium uppercase tracking-[0.2em] text-cyan-300">Demo mode</p>
            <h2 className="text-4xl font-bold leading-tight">Turn business requirements into a technical roadmap.</h2>
            <p className="mt-4 max-w-xl text-base text-slate-300">
              Capture ideas, analyze requirements, generate architecture decisions, MongoDB schemas, API specifications, and delivery plans in one platform.
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              {[
                ['Requirement analysis', 'NLP + structured insight'],
                ['Architecture blueprint', 'System design and modules'],
                ['Synthetic data', 'Mongo-ready datasets'],
              ].map(([title, text]) => (
                <div key={title} className="rounded-2xl border border-slate-700 bg-slate-950/60 p-4">
                  <p className="text-sm font-semibold text-white">{title}</p>
                  <p className="mt-2 text-sm text-slate-400">{text}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-xl shadow-slate-950/40">
            <div className="mb-5">
              <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Welcome back</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">Sign in</h2>
            </div>

            <form className="space-y-4" onSubmit={submit}>
              <label className="block">
                <span className="mb-2 block text-sm text-slate-300">Email</span>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-50 outline-none ring-0 transition focus:border-cyan-400"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="name@company.com"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm text-slate-300">Password</span>
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-50 outline-none transition focus:border-cyan-400"
                  type="password"
                  autoComplete="current-password"
                  required
                  placeholder="••••••••"
                />
              </label>

              {error ? <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div> : null}

              <button disabled={isLoading} className="w-full rounded-xl bg-cyan-500 px-4 py-3 font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-70">
                {isLoading ? 'Signing in...' : 'Sign in to workspace'}
              </button>
            </form>

            <p className="mt-4 text-xs text-slate-500">
              No account is pre-seeded. Create one below, or use an account registered with this backend.
            </p>
            <div className="mt-5 text-sm text-slate-400">
              Need an account?{' '}
              <Link to="/register" className="font-medium text-cyan-300 hover:text-cyan-200">
                Create one
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function RegisterPage({ onAuth }: { onAuth: (session: AuthSession | null) => void }) {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      const authSession = await registerUser(name, email, password)
      onAuth(authSession)
      navigate('/dashboard')
    } catch (registrationError) {
      setError(getApiErrorMessage(registrationError))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 px-6 py-12 text-slate-50">
      <div className="mx-auto max-w-xl rounded-3xl border border-slate-800 bg-slate-900 p-8">
        <p className="text-sm uppercase tracking-[0.2em] text-cyan-300">Create account</p>
        <h2 className="mt-2 text-3xl font-semibold text-white">Start with a blueprint workspace</h2>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block">
            <span className="mb-2 block text-sm text-slate-300">Full name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-50" autoComplete="name" required minLength={2} />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm text-slate-300">Email</span>
            <input value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-50" type="email" autoComplete="email" required />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm text-slate-300">Password</span>
            <input value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-50" type="password" autoComplete="new-password" required minLength={8} />
          </label>

          {error ? <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div> : null}

          <button disabled={isLoading} className="w-full rounded-xl bg-violet-500 px-4 py-3 font-semibold text-white transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-70">
            {isLoading ? 'Creating workspace...' : 'Create workspace'}
          </button>
        </form>

        <div className="mt-5 text-sm text-slate-400">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-cyan-300 hover:text-cyan-200">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  )
}

function DashboardPage({ session, onLogout }: { session: AuthSession; onLogout: () => void }) {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('ALL')
  const [draft, setDraft] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<ProjectDraft>({ name: '' })
  const [analysisProjectId, setAnalysisProjectId] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<RequirementAnalysis | null>(null)
  const [technologyProjectId, setTechnologyProjectId] = useState<string | null>(null)
  const [technologyRecommendation, setTechnologyRecommendation] = useState<TechnologyRecommendation | null>(null)
  const [architectureProjectId, setArchitectureProjectId] = useState<string | null>(null)
  const [architecture, setArchitecture] = useState<SoftwareArchitecture | null>(null)

  const queryKey = ['projects', session.token]

  const { data: projects = [], isLoading, error: projectsError } = useQuery({
    queryKey,
    queryFn: () => fetchProjects(session.token),
  })

  const filteredProjects = useMemo(() => {
    return projects.filter((project) => {
      const searchTerm = search.toLowerCase()
      const matchSearch = !search || [
        project.name,
        project.description,
        project.domain,
        project.requirements,
      ].some((value) => value.toLowerCase().includes(searchTerm))
      const matchStatus = status === 'ALL' || project.status === status
      return matchSearch && matchStatus
    })
  }, [projects, search, status])

  const createProjectMutation = useMutation({
    mutationFn: async () =>
      createProject(session.token, {
        name: draft.trim() || 'New product concept',
        description: 'Generated from a fresh requirement brief and ready for architecture review.',
        domain: 'SaaS',
        requirements: 'User management, workflow automation, analytics dashboard, and stakeholder reporting.',
        status: 'DRAFT',
      }),
    onSuccess: (createdProject) => {
      queryClient.setQueryData<Project[]>(queryKey, (current = []) => [createdProject, ...current])
      setDraft('')
    },
  })

  const updateProjectMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ProjectDraft }) =>
      updateProject(session.token, id, payload),
    onSuccess: (updatedProject) => {
      queryClient.setQueryData<Project[]>(queryKey, (current = []) =>
        current.map((project) => project.id === updatedProject.id ? updatedProject : project),
      )
      setEditingId(null)
    },
  })

  const deleteProjectMutation = useMutation({
    mutationFn: (projectId: string) => deleteProject(session.token, projectId),
    onSuccess: (_, projectId) => {
      queryClient.setQueryData<Project[]>(queryKey, (current = []) =>
        current.filter((project) => project.id !== projectId),
      )
    },
  })

  const analyzeMutation = useMutation({
    mutationFn: (project: Project) => analyzeProjectRequirements(session.token, project),
    onSuccess: (result) => {
      setAnalysis(result)
      setAnalysisProjectId(result.project_id)
    },
  })

  const loadAnalysisMutation = useMutation({
    mutationFn: (projectId: string) => fetchProjectRequirementAnalysis(session.token, projectId),
    onSuccess: (result) => {
      setAnalysis(result)
      setAnalysisProjectId(result.project_id)
    },
  })

  const recommendTechnologyMutation = useMutation({
    mutationFn: (project: Project) => recommendProjectTechnology(session.token, project),
    onSuccess: (result) => {
      setTechnologyRecommendation(result)
      setTechnologyProjectId(result.project_id)
    },
  })

  const loadTechnologyRecommendationMutation = useMutation({
    mutationFn: (projectId: string) => fetchProjectTechnologyRecommendation(session.token, projectId),
    onSuccess: (result) => {
      setTechnologyRecommendation(result)
      setTechnologyProjectId(result.project_id)
    },
  })

  const generateArchitectureMutation = useMutation({
    mutationFn: (project: Project) => generateProjectArchitecture(session.token, project),
    onSuccess: (result) => {
      setArchitecture(result)
      setArchitectureProjectId(result.project_id)
    },
  })

  const loadArchitectureMutation = useMutation({
    mutationFn: (projectId: string) => fetchProjectArchitecture(session.token, projectId),
    onSuccess: (result) => {
      setArchitecture(result)
      setArchitectureProjectId(result.project_id)
    },
  })

  const startEditing = (project: Project) => {
    setEditingId(project.id)
    setEditDraft({
      name: project.name,
      description: project.description,
      domain: project.domain,
      requirements: project.requirements,
      status: project.status,
    })
  }

  const stats = useMemo(() => {
    const active = projects.filter((p) => p.status !== 'FAILED').length
    const completed = projects.filter((p) => p.status === 'COMPLETED').length
    const drafts = projects.filter((p) => p.status === 'DRAFT').length
    return { active, completed, drafts }
  }, [projects])

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-8 flex flex-col gap-6 rounded-3xl border border-slate-800 bg-slate-900/80 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500/15 ring-1 ring-cyan-400/40">
              <Sparkles className="h-5 w-5 text-cyan-300" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-cyan-300">Workspace</p>
              <h1 className="text-2xl font-semibold text-white">SoftArchitect AI</h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Signed in</p>
              <p className="font-medium text-slate-100">{session.user.name}</p>
            </div>
            <button onClick={onLogout} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 hover:border-slate-500">
              <LogOut className="h-4 w-4" /> Logout
            </button>
          </div>
        </header>

        {session.token === 'demo-token' ? (
          <div className="mb-6 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
            Demo mode is active. Project changes are saved in this browser, not to the backend.
          </div>
        ) : null}

        <nav className="mb-8 flex flex-wrap gap-3 text-sm text-slate-300">
          {[
            { label: 'Overview', Icon: LayoutDashboard },
            { label: 'Projects', Icon: Briefcase },
            { label: 'Teams', Icon: Users },
            { label: 'Architecture', Icon: Building2 },
          ].map(({ label, Icon }) => (
            <button key={label} className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-4 py-2">
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </nav>

        <section className="mb-8 grid gap-4 md:grid-cols-3">
          <StatCard label="Active blueprints" value={String(stats.active)} icon={BarChart3} accent="cyan" />
          <StatCard label="Completed" value={String(stats.completed)} icon={ShieldCheck} accent="emerald" />
          <StatCard label="Drafts" value={String(stats.drafts)} icon={Plus} accent="violet" />
        </section>

        <section className="mb-8 rounded-3xl border border-slate-800 bg-slate-900 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex-1">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search requirement briefs or domains"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 py-2.5 pl-10 pr-3 text-slate-50 outline-none focus:border-cyan-400"
                />
              </label>
            </div>

            <div className="flex flex-col gap-4 sm:flex-row">
              <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-50">
                <option value="ALL">All statuses</option>
                <option value="DRAFT">Draft</option>
                <option value="ANALYZING">Analyzing</option>
                <option value="COMPLETED">Completed</option>
                <option value="FAILED">Failed</option>
              </select>

              <div className="flex gap-2">
                <input
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="New project name"
                  className="min-w-[200px] rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-50"
                />
                <button
                  disabled={!draft.trim() || createProjectMutation.isPending}
                  onClick={() => createProjectMutation.mutate()}
                  className="rounded-xl bg-cyan-500 px-4 py-2.5 font-medium text-slate-950 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {createProjectMutation.isPending ? 'Creating...' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        </section>

        {projectsError || createProjectMutation.error || updateProjectMutation.error || deleteProjectMutation.error || analyzeMutation.error || loadAnalysisMutation.error || recommendTechnologyMutation.error || loadTechnologyRecommendationMutation.error || generateArchitectureMutation.error || loadArchitectureMutation.error ? (
          <div role="alert" className="mb-6 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {getApiErrorMessage(projectsError || createProjectMutation.error || updateProjectMutation.error || deleteProjectMutation.error || analyzeMutation.error || loadAnalysisMutation.error || recommendTechnologyMutation.error || loadTechnologyRecommendationMutation.error || generateArchitectureMutation.error || loadArchitectureMutation.error)}
          </div>
        ) : null}

        {isLoading ? <p className="mb-5 text-sm text-slate-400">Loading your projects...</p> : null}

        <section className="grid gap-5 xl:grid-cols-2">
          {filteredProjects.map((project) => (
            <article key={project.id} className="rounded-3xl border border-slate-800 bg-slate-900 p-5 shadow-lg shadow-slate-950/30">
              {editingId === project.id ? (
                <form
                  className="space-y-3"
                  onSubmit={(event) => {
                    event.preventDefault()
                    updateProjectMutation.mutate({ id: project.id, payload: editDraft })
                  }}
                >
                  <input
                    aria-label="Project name"
                    required
                    minLength={3}
                    value={editDraft.name ?? ''}
                    onChange={(event) => setEditDraft({ ...editDraft, name: event.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-xl font-semibold text-white"
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input
                      aria-label="Project domain"
                      value={editDraft.domain ?? ''}
                      onChange={(event) => setEditDraft({ ...editDraft, domain: event.target.value })}
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100"
                    />
                    <select
                      aria-label="Project status"
                      value={editDraft.status ?? 'DRAFT'}
                      onChange={(event) => setEditDraft({ ...editDraft, status: event.target.value as Project['status'] })}
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100"
                    >
                      <option value="DRAFT">Draft</option>
                      <option value="ANALYZING">Analyzing</option>
                      <option value="COMPLETED">Completed</option>
                      <option value="FAILED">Failed</option>
                    </select>
                  </div>
                  <textarea
                    aria-label="Project description"
                    value={editDraft.description ?? ''}
                    onChange={(event) => setEditDraft({ ...editDraft, description: event.target.value })}
                    className="min-h-20 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100"
                  />
                  <textarea
                    aria-label="Project requirements"
                    value={editDraft.requirements ?? ''}
                    onChange={(event) => setEditDraft({ ...editDraft, requirements: event.target.value })}
                    className="min-h-24 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100"
                  />
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setEditingId(null)} className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300">
                      Cancel
                    </button>
                    <button disabled={updateProjectMutation.isPending} className="rounded-lg bg-cyan-500 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-60">
                      {updateProjectMutation.isPending ? 'Saving...' : 'Save changes'}
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">{project.domain}</p>
                      <h3 className="mt-2 text-2xl font-semibold text-white">{project.name}</h3>
                    </div>
                    <span className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-slate-300">
                      {project.status}
                    </span>
                  </div>

                  <p className="text-sm text-slate-300">{project.description}</p>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <InfoPill label="Owner" value={session.user.name} />
                    <InfoPill label="Updated" value={new Date(project.updated_at).toLocaleDateString()} />
                  </div>

                  <div className="mt-5 rounded-2xl border border-slate-700 bg-slate-950/60 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Core requirements</p>
                    <p className="mt-2 text-sm text-slate-300">{project.requirements || 'No requirements captured yet.'}</p>
                  </div>

                  <div className="mt-4 flex justify-end gap-2">
                    <button
                      disabled={analyzeMutation.isPending || loadAnalysisMutation.isPending || project.requirements.trim().length < 20}
                      onClick={() => analyzeMutation.mutate(project)}
                      className="inline-flex items-center gap-2 rounded-lg border border-cyan-400/40 px-3 py-2 text-sm text-cyan-200 hover:bg-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-50"
                      title={project.requirements.trim().length < 20 ? 'Add at least 20 characters of requirements first' : ''}
                    >
                      <Sparkles className="h-4 w-4" />
                      {analyzeMutation.isPending && analyzeMutation.variables.id === project.id ? 'Analyzing...' : 'Analyze'}
                    </button>
                    <button
                      onClick={() => loadAnalysisMutation.mutate(project.id)}
                      disabled={loadAnalysisMutation.isPending || analyzeMutation.isPending}
                      className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:border-slate-500 disabled:opacity-50"
                    >
                      View saved
                    </button>
                    <button onClick={() => startEditing(project)} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:border-cyan-400">
                      <Pencil className="h-4 w-4" /> Edit
                    </button>
                    <button
                      disabled={deleteProjectMutation.isPending}
                      onClick={() => {
                        if (window.confirm(`Delete "${project.name}"? This cannot be undone.`)) {
                          deleteProjectMutation.mutate(project.id)
                        }
                      }}
                      className="inline-flex items-center gap-2 rounded-lg border border-red-500/40 px-3 py-2 text-sm text-red-200 hover:bg-red-500/10 disabled:opacity-60"
                    >
                      <Trash2 className="h-4 w-4" /> Delete
                    </button>
                  </div>
                  {analysisProjectId === project.id && analysis ? (
                    <AnalysisPanel analysis={analysis} />
                  ) : null}
                  <div className="mt-3 flex flex-wrap justify-end gap-2">
                    <button
                      disabled={recommendTechnologyMutation.isPending || project.requirements.trim().length < 20}
                      onClick={() => recommendTechnologyMutation.mutate(project)}
                      className="rounded-lg border border-violet-400/40 px-3 py-2 text-sm text-violet-200 hover:bg-violet-400/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {recommendTechnologyMutation.isPending && recommendTechnologyMutation.variables.id === project.id ? 'Recommending...' : 'Recommend stack'}
                    </button>
                    <button
                      disabled={loadTechnologyRecommendationMutation.isPending || recommendTechnologyMutation.isPending}
                      onClick={() => loadTechnologyRecommendationMutation.mutate(project.id)}
                      className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:border-slate-500 disabled:opacity-50"
                    >
                      View saved stack
                    </button>
                  </div>
                  {technologyProjectId === project.id && technologyRecommendation ? (
                    <TechnologyRecommendationPanel recommendation={technologyRecommendation} />
                  ) : null}
                  <div className="mt-3 flex flex-wrap justify-end gap-2">
                    <button
                      disabled={generateArchitectureMutation.isPending || project.requirements.trim().length < 20}
                      onClick={() => generateArchitectureMutation.mutate(project)}
                      className="rounded-lg border border-emerald-400/40 px-3 py-2 text-sm text-emerald-200 hover:bg-emerald-400/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {generateArchitectureMutation.isPending && generateArchitectureMutation.variables.id === project.id ? 'Designing...' : 'Generate architecture'}
                    </button>
                    <button
                      disabled={loadArchitectureMutation.isPending || generateArchitectureMutation.isPending}
                      onClick={() => loadArchitectureMutation.mutate(project.id)}
                      className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:border-slate-500 disabled:opacity-50"
                    >
                      View saved architecture
                    </button>
                  </div>
                  {architectureProjectId === project.id && architecture ? (
                    <ArchitecturePanel architecture={architecture} />
                  ) : null}
                </>
              )}
            </article>
          ))}
        </section>
        {!isLoading && filteredProjects.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center text-slate-400">
            No projects match these filters. Create a project or change your search.
          </div>
        ) : null}
      </div>
    </div>
  )
}

function AnalysisPanel({ analysis }: { analysis: RequirementAnalysis }) {
  const sections: Array<[string, string[]]> = [
    ['Functional requirements', analysis.functional_requirements],
    ['Non-functional requirements', analysis.non_functional_requirements],
    ['User roles', analysis.user_roles],
    ['Modules', analysis.modules],
    ['Business rules', analysis.business_rules],
    ['Assumptions', analysis.assumptions],
    ['Missing information', analysis.missing_information],
    ['Risks', analysis.risks],
  ]

  return (
    <section className="mt-5 rounded-2xl border border-cyan-400/30 bg-slate-950/70 p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">Requirement analysis · Demo agent</p>
          <h4 className="mt-2 text-lg font-semibold text-white">Project summary</h4>
          <p className="mt-2 text-sm text-slate-300">{analysis.project_summary}</p>
        </div>
        <time className="shrink-0 text-xs text-slate-500">{new Date(analysis.created_at).toLocaleString()}</time>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {sections.map(([title, items]) => (
          <div key={title}>
            <h5 className="text-sm font-semibold text-slate-100">{title}</h5>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">
              {items.map((item, index) => <li key={`${title}-${index}`}>{item}</li>)}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}

function TechnologyRecommendationPanel({ recommendation }: { recommendation: TechnologyRecommendation }) {
  return (
    <section className="mt-5 rounded-2xl border border-violet-400/30 bg-slate-950/70 p-5">
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-violet-300">Technology recommendations · Demo agent</p>
          <h4 className="mt-2 text-lg font-semibold text-white">Suggested technology stack</h4>
          <p className="mt-2 text-sm text-slate-300">{recommendation.project_summary}</p>
        </div>
        <time className="shrink-0 text-xs text-slate-500">{new Date(recommendation.created_at).toLocaleString()}</time>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {recommendation.recommendations.map((item) => (
          <article key={item.category} className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
            <h5 className="text-sm font-semibold text-violet-200">{item.category}</h5>
            <p className="mt-2 text-sm font-medium text-slate-100">{item.recommendation}</p>
            <p className="mt-2 text-sm text-slate-300">{item.rationale}</p>
            <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Alternatives</p>
            <p className="mt-1 text-sm text-slate-300">{item.alternatives.join(' · ') || 'None listed'}</p>
            <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Trade-offs</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-300">
              {item.trade_offs.map((tradeOff) => <li key={tradeOff}>{tradeOff}</li>)}
            </ul>
          </article>
        ))}
      </div>
    </section>
  )
}

function ArchitecturePanel({ architecture }: { architecture: SoftwareArchitecture }) {
  const [diagram, setDiagram] = useState('')
  const [diagramError, setDiagramError] = useState('')

  useEffect(() => {
    let active = true
    const renderDiagram = async () => {
      try {
        const { default: mermaid } = await import('mermaid')
        mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'strict' })
        const rendered = await mermaid.render(
          `architecture-${architecture.project_id.replace(/[^a-zA-Z0-9_-]/g, '')}`,
          architecture.mermaid_diagram,
        )
        if (active) {
          setDiagram(rendered.svg)
          setDiagramError('')
        }
      } catch {
        if (active) setDiagramError('The architecture diagram could not be rendered. The component details are still available below.')
      }
    }
    void renderDiagram()
    return () => {
      active = false
    }
  }, [architecture.mermaid_diagram, architecture.project_id])

  return (
    <section className="mt-5 rounded-2xl border border-emerald-400/30 bg-slate-950/70 p-5">
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">Software architecture · Demo agent</p>
          <h4 className="mt-2 text-lg font-semibold text-white">{architecture.architectural_style}</h4>
          <p className="mt-2 text-sm text-slate-300">{architecture.project_summary}</p>
        </div>
        <time className="shrink-0 text-xs text-slate-500">{new Date(architecture.created_at).toLocaleString()}</time>
      </div>
      <h5 className="mb-2 text-sm font-semibold text-slate-100">System diagram</h5>
      {diagramError ? <p role="alert" className="mb-3 text-sm text-amber-200">{diagramError}</p> : null}
      {diagram ? (
        <div
          aria-label="Software architecture component diagram"
          className="mb-6 overflow-x-auto rounded-xl border border-slate-800 bg-slate-900 p-4 [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full"
          dangerouslySetInnerHTML={{ __html: diagram }}
        />
      ) : !diagramError ? (
        <p className="mb-6 text-sm text-slate-400">Rendering architecture diagram...</p>
      ) : null}
      <h5 className="mb-3 text-sm font-semibold text-slate-100">Components</h5>
      <div className="grid gap-3 md:grid-cols-2">
        {architecture.components.map((component) => (
          <article key={component.id} className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h6 className="font-semibold text-emerald-200">{component.name}</h6>
              <span className="rounded-full border border-slate-700 px-2 py-1 text-xs text-slate-400">{component.component_type}</span>
            </div>
            <p className="mt-2 text-sm text-slate-300">{component.description}</p>
            <p className="mt-2 text-xs text-slate-400">{component.technologies.join(' · ')}</p>
          </article>
        ))}
      </div>
      <h5 className="mb-2 mt-5 text-sm font-semibold text-slate-100">Key design decisions</h5>
      <ul className="list-disc space-y-1 pl-5 text-sm text-slate-300">
        {architecture.design_decisions.map((decision) => <li key={decision}>{decision}</li>)}
      </ul>
    </section>
  )
}

function StatCard({ label, value, icon: Icon, accent }: { label: string; value: string; icon: LucideIcon; accent: string }) {
  const accentClasses = {
    cyan: 'from-cyan-500/20 to-sky-500/10 text-cyan-300 border-cyan-500/25',
    emerald: 'from-emerald-500/20 to-emerald-500/10 text-emerald-300 border-emerald-500/25',
    violet: 'from-violet-500/20 to-indigo-500/10 text-violet-300 border-violet-500/25',
  }[accent]

  return (
    <div className={`rounded-3xl border bg-gradient-to-br p-5 ${accentClasses}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-slate-300">{label}</p>
          <p className="mt-2 text-3xl font-bold text-white">{value}</p>
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950/50">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  )
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-950/60 p-3">
      <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm text-slate-200">{value}</p>
    </div>
  )
}

export default App
