import { useEffect, useState } from 'react'
import { Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { isAxiosError } from 'axios'
import { Sparkles } from 'lucide-react'
import {
  fetchCurrentUser,
  getApiErrorMessage,
  loginUser,
  registerUser,
  type AuthSession,
} from './services/api'
import { DashboardPage, ProjectWorkspacePage, ProjectsPage, WorkspaceLayout } from './features/workspace/WorkspacePages'

const AUTH_KEY = 'softarchitect_auth'

export default function App() {
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
      {session ? (
        <Route element={<WorkspaceLayout session={session} onLogout={() => handleAuth(null)} />}>
          <Route path="/dashboard" element={<DashboardPage session={session} />} />
          <Route path="/projects" element={<ProjectsPage session={session} />} />
          <Route path="/projects/:projectId" element={<ProjectWorkspacePage session={session} />} />
        </Route>
      ) : (
        <>
          <Route path="/dashboard" element={<Navigate to="/login" replace />} />
          <Route path="/projects" element={<Navigate to="/login" replace />} />
          <Route path="/projects/:projectId" element={<Navigate to="/login" replace />} />
        </>
      )}
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
