import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Comar-K · Facturación CFDI',
  description: 'Sistema de facturación electrónica CFDI para pequeños negocios en México.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}
