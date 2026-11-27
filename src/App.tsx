import { Shell } from './components/common'
import { isConfigured } from './lib/supabase'
import { useRoute } from './lib/router'
import AdminView from './views/AdminView'
import { HostHome, HowToPlay, PlayerHome } from './views/Home'
import HostView from './views/HostView'
import JoinView from './views/JoinView'
import PlayerView from './views/PlayerView'

export default function App() {
  const route = useRoute()

  if (!isConfigured) {
    return (
      <Shell>
        <section className="card narrow">
          <h1>Almost ready</h1>
          <p>
            This copy of Friday Games isn’t connected to its Supabase backend yet. Set{' '}
            <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> (see the README) and rebuild.
          </p>
        </section>
      </Shell>
    )
  }

  switch (route.name) {
    case 'host':
      return <HostView key={route.code} code={route.code} />
    case 'play':
      return <PlayerView key={route.code} code={route.code} />
    case 'hostHome':
      return <HostHome />
    case 'how':
      return <HowToPlay />
    case 'admin':
      return <AdminView />
    case 'join':
      return <JoinView key={route.code} code={route.code} />
    default:
      return <PlayerHome />
  }
}
