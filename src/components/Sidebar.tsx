import {
  LayoutDashboard,
  FileText,
  Users,
  Package,
  ScrollText,
  BarChart3,
  Settings,
  Zap,
} from 'lucide-react'
import type { View } from '../App'

const navItems: { id: View; label: string; icon: React.ComponentType<{ size?: number; strokeWidth?: number }> }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'facturar', label: 'Facturar', icon: FileText },
  { id: 'clientes', label: 'Clientes', icon: Users },
  { id: 'catalogo', label: 'Catálogo', icon: Package },
  { id: 'historial', label: 'Historial', icon: ScrollText },
  { id: 'reportes', label: 'Reportes', icon: BarChart3 },
  { id: 'configuracion', label: 'Configuración', icon: Settings },
]

interface SidebarProps {
  activeView: View
  onNavigate: (view: View) => void
}

export default function Sidebar({ activeView, onNavigate }: SidebarProps) {
  return (
    <aside style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: 240,
      height: '100vh',
      backgroundColor: '#ffffff',
      borderRight: '1px solid #e2e8f0',
      display: 'flex',
      flexDirection: 'column',
      zIndex: 50,
    }}>
      {/* Logo */}
      <div style={{ padding: '24px 20px 20px', borderBottom: '1px solid #f1f5f9' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 34,
            height: 34,
            borderRadius: 8,
            backgroundColor: '#4f46e5',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <Zap size={18} color="#ffffff" strokeWidth={2.5} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a', letterSpacing: '-0.3px' }}>FacturaMX</div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>Sistema de facturación</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '12px 12px', overflowY: 'auto' }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase', padding: '8px 8px 4px' }}>
          Principal
        </div>
        {navItems.slice(0, 2).map(item => (
          <NavItem key={item.id} item={item} active={activeView === item.id} onClick={() => onNavigate(item.id)} />
        ))}

        <div style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase', padding: '16px 8px 4px' }}>
          Administración
        </div>
        {navItems.slice(2, 5).map(item => (
          <NavItem key={item.id} item={item} active={activeView === item.id} onClick={() => onNavigate(item.id)} />
        ))}

        <div style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase', padding: '16px 8px 4px' }}>
          Análisis
        </div>
        {navItems.slice(5, 6).map(item => (
          <NavItem key={item.id} item={item} active={activeView === item.id} onClick={() => onNavigate(item.id)} />
        ))}
      </nav>

      {/* Bottom */}
      <div style={{ padding: '12px', borderTop: '1px solid #f1f5f9' }}>
        <NavItem item={navItems[6]} active={activeView === 'configuracion'} onClick={() => onNavigate('configuracion')} />
        <div style={{ marginTop: 12, padding: '10px 8px', borderRadius: 8, backgroundColor: '#eef2ff', border: '1px solid #c7d2fe' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#4338ca' }}>Empresa Demo S.A. de C.V.</div>
          <div style={{ fontSize: 10, color: '#818cf8', marginTop: 2 }}>RFC: DEM200101ABC</div>
          <div style={{ fontSize: 10, color: '#818cf8' }}>Plan Profesional</div>
        </div>
      </div>
    </aside>
  )
}

function NavItem({
  item,
  active,
  onClick,
}: {
  item: (typeof navItems)[number]
  active: boolean
  onClick: () => void
}) {
  const Icon = item.icon
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 8px',
        borderRadius: 8,
        border: 'none',
        cursor: 'pointer',
        backgroundColor: active ? '#eef2ff' : 'transparent',
        color: active ? '#4f46e5' : '#475569',
        fontSize: 13.5,
        fontWeight: active ? 600 : 400,
        textAlign: 'left',
        transition: 'background-color 0.15s, color 0.15s',
        marginBottom: 2,
        fontFamily: 'Inter, sans-serif',
      }}
      onMouseEnter={e => {
        if (!active) {
          ;(e.currentTarget as HTMLButtonElement).style.backgroundColor = '#f8fafc'
          ;(e.currentTarget as HTMLButtonElement).style.color = '#0f172a'
        }
      }}
      onMouseLeave={e => {
        if (!active) {
          ;(e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'
          ;(e.currentTarget as HTMLButtonElement).style.color = '#475569'
        }
      }}
    >
      <Icon size={16} strokeWidth={active ? 2.5 : 2} />
      {item.label}
    </button>
  )
}
