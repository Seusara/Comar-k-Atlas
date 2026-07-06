import { useState } from 'react'
import Sidebar from './components/Sidebar'
import Dashboard from './components/Dashboard'
import NuevaFactura from './components/NuevaFactura'
import Clientes from './components/Clientes'
import Catalogo from './components/Catalogo'
import Historial from './components/Historial'
import Reportes from './components/Reportes'
import Configuracion from './components/Configuracion'

export type View = 'dashboard' | 'facturar' | 'clientes' | 'catalogo' | 'historial' | 'reportes' | 'configuracion'

export default function App() {
  const [view, setView] = useState<View>('dashboard')

  const content = {
    dashboard: <Dashboard onNavigate={setView} />,
    facturar: <NuevaFactura />,
    clientes: <Clientes />,
    catalogo: <Catalogo />,
    historial: <Historial />,
    reportes: <Reportes />,
    configuracion: <Configuracion />,
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <Sidebar activeView={view} onNavigate={setView} />
      <main style={{ marginLeft: 240, flex: 1, minWidth: 0 }}>
        {content[view]}
      </main>
    </div>
  )
}
