import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { Announcement } from './components/Announcement'
import Home from './routes/Home'
import Letters from './routes/Letters'
import Memories from './routes/Memories'
import './styles.css'

const Booth = lazy(() => import('./routes/Booth'))
const Admin = lazy(() => import('./routes/Admin'))
const Business = lazy(() => import('./routes/Business'))
const BillingReturn = lazy(() => import('./routes/BillingReturn'))
const Kiosk = lazy(() => import('./routes/Kiosk'))

const fallback = (
  <div className="grid min-h-dvh place-items-center bg-curtain px-4 text-center text-paper display text-5xl">
    Setting up the booth…
  </div>
)

const quiet = <div className="grid min-h-dvh place-items-center text-graphite">Loading…</div>
const lazyRoute = (node: React.ReactNode) => <Suspense fallback={quiet}>{node}</Suspense>

const router = createBrowserRouter([
  { path: '/', element: <Home /> },
  { path: '/memories', element: <Memories /> },
  { path: '/letters', element: <Letters /> },
  { path: '/business', element: lazyRoute(<Business />) },
  { path: '/billing/return', element: lazyRoute(<BillingReturn />) },
  { path: '/kiosk', element: lazyRoute(<Kiosk />) },
  { path: '/admin', element: lazyRoute(<Admin />) },
  {
    path: '/solo',
    element: (
      <Suspense fallback={fallback}>
        <Booth mode="solo" />
      </Suspense>
    ),
  },
  {
    path: '/r/:code',
    element: (
      <Suspense fallback={fallback}>
        <Booth mode="room" />
      </Suspense>
    ),
  },
  { path: '*', element: <Home /> },
])

const root = document.getElementById('root')
if (!root) throw new Error('missing #root')
let beacon = false
const watchBooth = (pathname: string) => {
  if (beacon || !/^\/(solo|kiosk)/.test(pathname)) return
  beacon = true
  void import('./lib/beacon').then((m) => m.startBeacon())
}
watchBooth(location.pathname)
router.subscribe((state) => watchBooth(state.location.pathname))
createRoot(root).render(
  <StrictMode>
    <Announcement />
    <RouterProvider router={router} />
  </StrictMode>,
)
