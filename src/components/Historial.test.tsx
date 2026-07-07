import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import Historial from './Historial'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

afterEach(() => {
  vi.restoreAllMocks()
  refresh.mockClear()
})

const facturaPendiente = {
  id: 'f-pend', folio: 'A-0001', uuid_fiscal: null, fecha: '2026-07-01T00:00:00Z', total: 100,
  status: 'pendiente' as const, cliente_nombre: 'Cliente A', cliente_rfc: 'CAA010101AAA', error_timbrado: 'CSD no registrado',
}
const facturaTimbrada = {
  id: 'f-timb', folio: 'A-0002', uuid_fiscal: 'uuid-abc', fecha: '2026-07-02T00:00:00Z', total: 200,
  status: 'timbrada' as const, cliente_nombre: 'Cliente B', cliente_rfc: 'CBB010101AAA', error_timbrado: null,
}

describe('Historial - acciones por estatus', () => {
  it('una factura pendiente muestra el error previo y el botón Reintentar timbrado', () => {
    render(<Historial facturas={[facturaPendiente]} />)
    expect(screen.getByText(/CSD no registrado/)).toBeInTheDocument()
    expect(screen.getByText('Reintentar timbrado')).toBeInTheDocument()
  })

  it('Reintentar timbrado llama a POST /api/facturas/:id/timbrar y refresca', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ factura: { status: 'timbrada' } }), { status: 200 }))
    render(<Historial facturas={[facturaPendiente]} />)

    fireEvent.click(screen.getByText('Reintentar timbrado'))

    await waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(fetchMock).toHaveBeenCalledWith('/api/facturas/f-pend/timbrar', expect.objectContaining({ method: 'POST' }))
  })

  it('una factura timbrada muestra enlaces de descarga habilitados', () => {
    render(<Historial facturas={[facturaTimbrada]} />)
    const xmlLink = screen.getByText('XML').closest('a')
    const pdfLink = screen.getByText('PDF').closest('a')
    expect(xmlLink).toHaveAttribute('href', '/api/facturas/f-timb/xml')
    expect(pdfLink).toHaveAttribute('href', '/api/facturas/f-timb/pdf')
  })

  it('Cancelar en una factura timbrada abre el modal de motivo y exige UUID de sustitución solo para motivo 01', async () => {
    render(<Historial facturas={[facturaTimbrada]} />)
    fireEvent.click(screen.getByText('Cancelar'))

    expect(screen.getByText('Cancelar factura timbrada')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('UUID de sustitución')).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Motivo de cancelación'), { target: { value: '01' } })
    expect(screen.getByPlaceholderText('UUID de sustitución')).toBeInTheDocument()
  })

  it('confirma la cancelación con motivo 02 llamando a POST /api/facturas/:id/cancelar-timbrado', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    render(<Historial facturas={[facturaTimbrada]} />)

    fireEvent.click(screen.getByText('Cancelar'))
    fireEvent.change(screen.getByLabelText('Motivo de cancelación'), { target: { value: '02' } })
    fireEvent.click(screen.getByText('Confirmar cancelación'))

    await waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(fetchMock).toHaveBeenCalledWith('/api/facturas/f-timb/cancelar-timbrado', expect.objectContaining({ method: 'POST' }))
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(body).toEqual({ motivo: '02' })
  })

  it('con motivo 01 y UUID de sustitución vacío, el botón Confirmar cancelación está deshabilitado y no llama a fetch', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    render(<Historial facturas={[facturaTimbrada]} />)

    fireEvent.click(screen.getByText('Cancelar'))
    fireEvent.change(screen.getByLabelText('Motivo de cancelación'), { target: { value: '01' } })

    const confirmBtn = screen.getByText('Confirmar cancelación')
    expect(confirmBtn).toBeDisabled()

    fireEvent.click(confirmBtn)

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('si POST /api/facturas/:id/cancelar-timbrado falla, el modal permanece abierto y no se refresca', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: 'Error del PAC' }), { status: 500 }))
    render(<Historial facturas={[facturaTimbrada]} />)

    fireEvent.click(screen.getByText('Cancelar'))
    fireEvent.change(screen.getByLabelText('Motivo de cancelación'), { target: { value: '02' } })
    fireEvent.click(screen.getByText('Confirmar cancelación'))

    await waitFor(() => expect(screen.getByText(/Error del PAC/)).toBeInTheDocument())

    expect(screen.getByText('Cancelar factura timbrada')).toBeInTheDocument()
    expect(screen.getByLabelText('Motivo de cancelación')).toBeInTheDocument()
    expect(refresh).not.toHaveBeenCalled()
  })

  it('si Reintentar timbrado falla, no se refresca la página', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: 'Error al reintentar' }), { status: 500 }))
    render(<Historial facturas={[facturaPendiente]} />)

    fireEvent.click(screen.getByText('Reintentar timbrado'))

    await waitFor(() => expect(screen.getByText(/Error al reintentar/)).toBeInTheDocument())

    expect(refresh).not.toHaveBeenCalled()
  })
})
