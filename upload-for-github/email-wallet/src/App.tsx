import { usePrivy } from '@privy-io/react-auth'
import { LandingPage } from './components/LandingPage'
import { Dashboard } from './components/Dashboard'

function App() {
  const { ready, authenticated } = usePrivy()

  if (!ready) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{
          width: 28, height: 28, borderRadius: '50%',
          border: '2.5px solid #E8E6E1', borderTopColor: '#FF6B2B',
          animation: 'spin 0.8s linear infinite',
        }} />
      </div>
    )
  }

  return authenticated ? <Dashboard /> : <LandingPage />
}

export default App
