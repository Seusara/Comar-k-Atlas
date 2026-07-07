import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import NuevaFactura from './NuevaFactura'

const clientes = [{ id: 'cli-1', nombre: 'Cliente Uno', rfc: 'CUN010101AAA', regimen_fiscal: '601', uso_cfdi: 'G03' }]
const productos = [{ id: 'prod-1', clave_sat: '81161500', clave_unidad: 'H87', nombre: 'Consultoría', precio: 500, iva: 16 }]

afterEach(() => {
  vi.restoreAllMocks()
})

function seleccionarCliente() {
  fireEvent.change(screen.getByPlaceholderText('Buscar cliente por nombre o RFC...'), { target: { value: 'Cliente' } })
  fireEvent.click(screen.getByText('Cliente Uno'))
}

function agregarConceptoDelCatalogo() {
  fireEvent.click(screen.getByText('Agregar desde catálogo'))
  fireEvent.click(screen.getByText('Consultoría'))
}

describe('NuevaFactura - conceptos desde catálogo', () => {
  it('el botón Timbrar factura está deshabilitado sin conceptos', () => {
    render(<NuevaFactura clientes={clientes} productos={productos} />)
    expect(screen.getByText('Timbrar factura')).toBeDisabled()
  })

  it('agregar un producto del catálogo precarga clave SAT, unidad, descripción, precio e IVA', () => {
    render(<NuevaFactura clientes={clientes} productos={productos} />)
    agregarConceptoDelCatalogo()

    expect(screen.getByText('81161500')).toBeInTheDocument()
    expect(screen.getByText('H87')).toBeInTheDocument()
    expect(screen.getByText('Consultoría')).toBeInTheDocument()
    expect(screen.getByText('Timbrar factura')).not.toBeDisabled()
  })

  it('envía claveUnidad, formaPago y metodoPago en el body de POST /api/facturas', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ factura: { id: 'f1', folio: 'A-0001', uuid_fiscal: 'uuid-1', status: 'timbrada', error_timbrado: null } }),
      { status: 201 },
    ))

    render(<NuevaFactura clientes={clientes} productos={productos} />)
    seleccionarCliente()
    agregarConceptoDelCatalogo()
    fireEvent.click(screen.getByText('Timbrar factura'))

    await waitFor(() => expect(screen.getByText(/uuid-1/)).toBeInTheDocument())

    const [, options] = fetchMock.mock.calls[0]
    const body = JSON.parse((options as RequestInit).body as string)
    expect(body.formaPago).toBe('01')
    expect(body.metodoPago).toBe('PUE')
    expect(body.conceptos[0]).toMatchObject({ claveSat: '81161500', claveUnidad: 'H87' })
  })

  it('muestra el error de timbrado y el folio cuando la factura queda pendiente', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ factura: { id: 'f2', folio: 'A-0002', uuid_fiscal: null, status: 'pendiente', error_timbrado: 'CSD no registrado' } }),
      { status: 201 },
    ))

    render(<NuevaFactura clientes={clientes} productos={productos} />)
    seleccionarCliente()
    agregarConceptoDelCatalogo()
    fireEvent.click(screen.getByText('Timbrar factura'))

    await waitFor(() => expect(screen.getByText(/A-0002/)).toBeInTheDocument())
    expect(screen.getByText(/CSD no registrado/)).toBeInTheDocument()
  })
})
