import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildCfdiPayload, crearCfdi, registrarCsd, FacturamaError, type CrearCfdiInput } from './client'

afterEach(() => {
  vi.restoreAllMocks()
})

const sampleInput: CrearCfdiInput = {
  emisor: { rfc: 'EKU9003173C9', nombre: 'ESCUELA KEMPER URGATE', regimenFiscal: '601' },
  receptor: { rfc: 'URE180429TM6', nombre: 'UNIVERSIDAD ROBOTICA ESPAÑOLA', usoCfdi: 'G03', regimenFiscal: '601', codigoPostal: '65000' },
  conceptos: [{ claveSat: '81161500', claveUnidad: 'H87', descripcion: 'Servicio de prueba', cantidad: 2, precioUnitario: 100, iva: 16 }],
  formaPago: '01',
  metodoPago: 'PUE',
  lugarExpedicion: '06600',
  folio: 'A-0001',
}

describe('buildCfdiPayload', () => {
  it('mapea emisor, receptor y conceptos al formato Multiemisor de Facturama', () => {
    const payload = buildCfdiPayload(sampleInput) as any

    expect(payload.Issuer).toEqual({ Rfc: 'EKU9003173C9', Name: 'ESCUELA KEMPER URGATE', FiscalRegime: '601' })
    expect(payload.Receiver).toEqual({
      Rfc: 'URE180429TM6', Name: 'UNIVERSIDAD ROBOTICA ESPAÑOLA', CfdiUse: 'G03', FiscalRegime: '601', TaxZipCode: '65000',
    })
    expect(payload.Items).toHaveLength(1)
    expect(payload.Items[0]).toMatchObject({
      ProductCode: '81161500', UnitCode: 'H87', Description: 'Servicio de prueba', Quantity: 2, UnitPrice: 100,
      Subtotal: 200, TaxObject: '02', Total: 232,
    })
    expect(payload.Items[0].Taxes).toEqual([{ Name: 'IVA', Rate: 0.16, Base: 200, Total: 32, IsRetention: false }])
    expect(payload.CfdiType).toBe('I')
    expect(payload.Exportation).toBe('01')
    expect(payload.ExpeditionPlace).toBe('06600')
    expect(payload.Folio).toBe('A-0001')
  })

  it('incluye un arreglo Taxes con Rate 0 cuando el concepto tiene IVA 0%', () => {
    const input: CrearCfdiInput = { ...sampleInput, conceptos: [{ ...sampleInput.conceptos[0], iva: 0 }] }
    const payload = buildCfdiPayload(input) as any
    expect(payload.Items[0].Taxes).toEqual([{ Name: 'IVA', Rate: 0, Base: 200, Total: 0, IsRetention: false }])
  })
})

describe('crearCfdi', () => {
  it('retorna facturamaId y uuidFiscal cuando Facturama responde 200', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ Id: 'fact-123', Complement: { TaxStamp: { Uuid: 'uuid-abc' } } }),
      { status: 200 },
    ))

    const result = await crearCfdi(sampleInput)
    expect(result).toEqual({ facturamaId: 'fact-123', uuidFiscal: 'uuid-abc' })

    const call = (global.fetch as any).mock.calls[0]
    expect(call[0]).toBe('https://apisandbox.facturama.mx/api-lite/3/cfdis')
    expect(call[1].method).toBe('POST')
    expect(call[1].headers.Authorization).toMatch(/^Basic /)
  })

  it('lanza FacturamaError con el mensaje del proveedor cuando la respuesta no es exitosa', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(() =>
      Promise.resolve(new Response(
        JSON.stringify({ Message: 'El RFC del emisor no tiene CSD cargado' }),
        { status: 400 },
      ))
    )

    await expect(crearCfdi(sampleInput)).rejects.toThrow(FacturamaError)
    await expect(crearCfdi(sampleInput)).rejects.toThrow('El RFC del emisor no tiene CSD cargado')
  })
})

describe('registrarCsd', () => {
  it('hace PUT a /api-lite/csds/{rfc} con Certificate/PrivateKey/PrivateKeyPassword', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 200 }))

    await registrarCsd('EKU9003173C9', 'cert-b64', 'key-b64', 'pass123')

    const call = (global.fetch as any).mock.calls[0]
    expect(call[0]).toBe('https://apisandbox.facturama.mx/api-lite/csds/EKU9003173C9')
    expect(call[1].method).toBe('PUT')
    expect(JSON.parse(call[1].body)).toEqual({
      Rfc: 'EKU9003173C9', Certificate: 'cert-b64', PrivateKey: 'key-b64', PrivateKeyPassword: 'pass123',
    })
  })

  it('lanza FacturamaError cuando Facturama rechaza el CSD', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(() =>
      Promise.resolve(new Response(
        JSON.stringify({ Message: 'La contraseña de la llave privada es incorrecta' }),
        { status: 400 },
      ))
    )

    await expect(registrarCsd('EKU9003173C9', 'cert-b64', 'key-b64', 'wrong')).rejects.toThrow(
      'La contraseña de la llave privada es incorrecta',
    )
  })
})
