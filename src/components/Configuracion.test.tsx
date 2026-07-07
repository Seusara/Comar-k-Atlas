import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import Configuracion from './Configuracion'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

afterEach(() => {
  vi.restoreAllMocks()
  refresh.mockClear()
})

function selectTab() {
  fireEvent.click(screen.getByText('Certificados (CSD)'))
}

describe('Configuracion - certificados', () => {
  it('muestra el RFC real de la empresa y el badge "Sin certificado" cuando csdStatus es sin_registrar', () => {
    render(<Configuracion empresa={{ nombre: 'Empresa Demo S.A. de C.V.', rfcEmisor: 'DEM200101ABC', csdStatus: 'sin_registrar' }} />)
    selectTab()

    expect(screen.getByText(/DEM200101ABC/)).toBeInTheDocument()
    expect(screen.getByText('Sin certificado')).toBeInTheDocument()
    expect(screen.queryByText('Reintentar registro')).not.toBeInTheDocument()
  })

  it('muestra el badge "Registrado" y el botón de reintentar cuando csdStatus es registrado', () => {
    render(<Configuracion empresa={{ nombre: 'Empresa Demo', rfcEmisor: 'DEM200101ABC', csdStatus: 'registrado' }} />)
    selectTab()

    expect(screen.getByText('Registrado')).toBeInTheDocument()
    expect(screen.getByText('Reintentar registro')).toBeInTheDocument()
  })

  it('el botón Registrar CSD está deshabilitado hasta elegir ambos archivos y una contraseña', () => {
    render(<Configuracion empresa={{ nombre: 'Empresa Demo', rfcEmisor: 'DEM200101ABC', csdStatus: 'sin_registrar' }} />)
    selectTab()

    expect(screen.getByText('Registrar CSD')).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Archivo .cer'), { target: { files: [new File(['cer'], 'test.cer')] } })
    fireEvent.change(screen.getByLabelText('Archivo .key'), { target: { files: [new File(['key'], 'test.key')] } })
    fireEvent.change(screen.getByPlaceholderText('Contraseña de la llave privada'), { target: { value: 'pass123' } })

    expect(screen.getByText('Registrar CSD')).not.toBeDisabled()
  })

  it('envía el formulario a /api/empresas/csd y refresca en éxito', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    render(<Configuracion empresa={{ nombre: 'Empresa Demo', rfcEmisor: 'DEM200101ABC', csdStatus: 'sin_registrar' }} />)
    selectTab()

    fireEvent.change(screen.getByLabelText('Archivo .cer'), { target: { files: [new File(['cer'], 'test.cer')] } })
    fireEvent.change(screen.getByLabelText('Archivo .key'), { target: { files: [new File(['key'], 'test.key')] } })
    fireEvent.change(screen.getByPlaceholderText('Contraseña de la llave privada'), { target: { value: 'pass123' } })
    fireEvent.click(screen.getByText('Registrar CSD'))

    await waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(fetchMock).toHaveBeenCalledWith('/api/empresas/csd', expect.objectContaining({ method: 'POST' }))
  })

  it('muestra el error del servidor si el registro falla', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: 'Contraseña incorrecta' }), { status: 400 }))
    render(<Configuracion empresa={{ nombre: 'Empresa Demo', rfcEmisor: 'DEM200101ABC', csdStatus: 'sin_registrar' }} />)
    selectTab()

    fireEvent.change(screen.getByLabelText('Archivo .cer'), { target: { files: [new File(['cer'], 'test.cer')] } })
    fireEvent.change(screen.getByLabelText('Archivo .key'), { target: { files: [new File(['key'], 'test.key')] } })
    fireEvent.change(screen.getByPlaceholderText('Contraseña de la llave privada'), { target: { value: 'wrong' } })
    fireEvent.click(screen.getByText('Registrar CSD'))

    await waitFor(() => expect(screen.getByText('Contraseña incorrecta')).toBeInTheDocument())
    expect(refresh).not.toHaveBeenCalled()
  })

  it('Reintentar registro llama a /api/empresas/csd/resync', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    render(<Configuracion empresa={{ nombre: 'Empresa Demo', rfcEmisor: 'DEM200101ABC', csdStatus: 'registrado' }} />)
    selectTab()

    fireEvent.click(screen.getByText('Reintentar registro'))

    await waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(fetchMock).toHaveBeenCalledWith('/api/empresas/csd/resync', expect.objectContaining({ method: 'POST' }))
  })
})
