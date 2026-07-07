'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, FileText, Users, Package, ScrollText, BarChart3, Settings } from 'lucide-react'
import LogoutButton from '@/components/LogoutButton'
import logoIcon from '@/logo/icon.png'

const navItems: { href: string; label: string; icon: React.ComponentType<{ size?: number; strokeWidth?: number }> }[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/facturas/nueva', label: 'Facturar', icon: FileText },
  { href: '/clientes', label: 'Clientes', icon: Users },
  { href: '/catalogo', label: 'Catálogo', icon: Package },
  { href: '/historial', label: 'Historial', icon: ScrollText },
  { href: '/reportes', label: 'Reportes', icon: BarChart3 },
  { href: '/configuracion', label: 'Configuración', icon: Settings },
]

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <aside style={{ position: 'fixed', top: 0, left: 0, width: 240, height: '100vh', backgroundColor: '#ffffff', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', zIndex: 50 }}>
      <div style={{ padding: '24px 20px 20px', borderBottom: '1px solid #f1f5f9' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Image src={logoIcon} alt="Comar-K" width={48} height={36} style={{ height: 36, width: 'auto' }} priority />
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a', letterSpacing: '-0.3px' }}>Comar-K</div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>Sistema de facturación</div>
          </div>
        </div>
      </div>

      <nav style={{ flex: 1, padding: '12px 12px', overflowY: 'auto' }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase', padding: '8px 8px 4px' }}>Principal</div>
        {navItems.slice(0, 2).map(item => (
          <NavItem key={item.href} item={item} active={pathname === item.href} />
        ))}

        <div style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase', padding: '16px 8px 4px' }}>Administración</div>
        {navItems.slice(2, 5).map(item => (
          <NavItem key={item.href} item={item} active={pathname === item.href} />
        ))}

        <div style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase', padding: '16px 8px 4px' }}>Análisis</div>
        {navItems.slice(5, 6).map(item => (
          <NavItem key={item.href} item={item} active={pathname === item.href} />
        ))}
      </nav>

      <div style={{ padding: '12px', borderTop: '1px solid #f1f5f9' }}>
        <NavItem item={navItems[6]} active={pathname === navItems[6].href} />
        <LogoutButton />
      </div>
    </aside>
  )
}

function NavItem({ item, active }: { item: (typeof navItems)[number]; active: boolean }) {
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 8px', borderRadius: 8,
        backgroundColor: active ? '#eef2ff' : 'transparent', color: active ? '#4f46e5' : '#475569',
        fontSize: 13.5, fontWeight: active ? 600 : 400, textDecoration: 'none', marginBottom: 2, fontFamily: 'Inter, sans-serif',
      }}
    >
      <Icon size={16} strokeWidth={active ? 2.5 : 2} />
      {item.label}
    </Link>
  )
}
