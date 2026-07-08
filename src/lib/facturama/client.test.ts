import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildCfdiPayload, crearCfdi, registrarCsd, FacturamaError, obtenerXml, obtenerPdf, cancelarCfdi, type CrearCfdiInput } from './client'

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

  it('no incluye GlobalInformation para un receptor normal', () => {
    const payload = buildCfdiPayload(sampleInput) as any
    expect(payload.GlobalInformation).toBeUndefined()
  })

  it('agrega GlobalInformation automáticamente cuando el receptor es XAXX010101000 (público en general)', () => {
    const input: CrearCfdiInput = {
      ...sampleInput,
      receptor: { rfc: 'XAXX010101000', nombre: 'PUBLICO EN GENERAL', usoCfdi: 'S01', regimenFiscal: '601', codigoPostal: '06600' },
    }
    const now = new Date('2026-07-08T12:00:00Z')

    const payload = buildCfdiPayload(input, now) as any

    expect(payload.GlobalInformation).toEqual({ Periodicity: '04', Months: '07', Year: '2026' })
  })

  it('fuerza FiscalRegime=616 para el receptor XAXX010101000 sin importar lo capturado', () => {
    const input: CrearCfdiInput = {
      ...sampleInput,
      receptor: { rfc: 'XAXX010101000', nombre: 'PUBLICO EN GENERAL', usoCfdi: 'S01', regimenFiscal: '601', codigoPostal: '06600' },
    }

    const payload = buildCfdiPayload(input) as any

    expect(payload.Receiver.FiscalRegime).toBe('616')
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
  it('hace POST a /api-lite/csds con Rfc/Certificate/PrivateKey/PrivateKeyPassword', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 200 }))

    await registrarCsd('EKU9003173C9', 'cert-b64', 'key-b64', 'pass123')

    const call = (global.fetch as any).mock.calls[0]
    expect(call[0]).toBe('https://apisandbox.facturama.mx/api-lite/csds')
    expect(call[1].method).toBe('POST')
    expect(JSON.parse(call[1].body)).toEqual({
      Rfc: 'EKU9003173C9', Certificate: 'cert-b64', PrivateKey: 'key-b64', PrivateKeyPassword: 'pass123',
    })
  })

  it('lanza FacturamaError cuando Facturama rechaza el CSD y no reintenta con PUT', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ Message: 'La contraseña de la llave privada es incorrecta' }),
      { status: 400 },
    ))

    await expect(registrarCsd('EKU9003173C9', 'cert-b64', 'key-b64', 'wrong')).rejects.toThrow(
      'La contraseña de la llave privada es incorrecta',
    )
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('reintenta con PUT /api-lite/csds/{rfc} cuando Facturama indica que el RFC ya tiene un CSD registrado', async () => {
    const postResponse = new Response(
      JSON.stringify({ Message: 'La solicitud no es válida.', ModelState: { Rfc: ['Ya existe un CSD asociado a este RFC'] } }),
      { status: 400 },
    )
    const putResponse = new Response(null, { status: 200 })
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(postResponse)
      .mockResolvedValueOnce(putResponse)

    await registrarCsd('EKU9003173C9', 'cert-b64', 'key-b64', 'pass123')

    expect(global.fetch).toHaveBeenCalledTimes(2)
    const putCall = (global.fetch as any).mock.calls[1]
    expect(putCall[0]).toBe('https://apisandbox.facturama.mx/api-lite/csds/EKU9003173C9')
    expect(putCall[1].method).toBe('PUT')
    expect(JSON.parse(putCall[1].body)).toEqual({
      Rfc: 'EKU9003173C9', Certificate: 'cert-b64', PrivateKey: 'key-b64', PrivateKeyPassword: 'pass123',
    })
  })

  it('lanza el error del PUT con su propio detalle si el reintento también falla', async () => {
    const postResponse = new Response(
      JSON.stringify({ Message: 'La solicitud no es válida.', ModelState: { Rfc: ['Ya existe un CSD asociado a este RFC'] } }),
      { status: 400 },
    )
    const putResponse = new Response(
      JSON.stringify({ Message: 'La solicitud no es válida.', ModelState: { Certificate: ['Error al cargar el certificado'] } }),
      { status: 400 },
    )
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(postResponse).mockResolvedValueOnce(putResponse)

    await expect(registrarCsd('EKU9003173C9', 'bad-cert', 'key-b64', 'pass123')).rejects.toThrow(
      'La solicitud no es válida. Certificate: Error al cargar el certificado',
    )
  })
})

describe('readErrorMessage (ModelState)', () => {
  it('incluye el detalle de ModelState en el mensaje de error, no solo el Message genérico', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ Message: 'La solicitud no es válida.', ModelState: { Rfc: ['El RFC no es válido'] } }),
      { status: 400 },
    ))

    await expect(cancelarCfdi('fact-123', '02')).rejects.toThrow(
      'La solicitud no es válida. Rfc: El RFC no es válido',
    )
  })
})

describe('obtenerXml / obtenerPdf', () => {
  it('obtenerXml retorna el contenido y content-type application/xml', async () => {
    const xmlBase64 = Buffer.from('<cfdi>fake</cfdi>', 'utf8').toString('base64')
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ ContentEncoding: 'base64', ContentType: 'xml', ContentLength: 17, Content: xmlBase64 }),
      { status: 200 },
    ))

    const result = await obtenerXml('fact-123')
    expect(result.contentType).toBe('application/xml')
    expect(result.content.toString('utf8')).toBe('<cfdi>fake</cfdi>')

    const call = (global.fetch as any).mock.calls[0]
    expect(call[0]).toBe('https://apisandbox.facturama.mx/api/Cfdi/xml/issuedLite/fact-123')
  })

  it('obtenerPdf retorna el contenido y content-type application/pdf', async () => {
    const pdfBase64 = Buffer.from('%PDF-fake', 'utf8').toString('base64')
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ ContentEncoding: 'base64', ContentType: 'pdf', ContentLength: 9, Content: pdfBase64 }),
      { status: 200 },
    ))

    const result = await obtenerPdf('fact-123')
    expect(result.contentType).toBe('application/pdf')
    expect(result.content.toString('utf8')).toBe('%PDF-fake')

    const call = (global.fetch as any).mock.calls[0]
    expect(call[0]).toBe('https://apisandbox.facturama.mx/api/Cfdi/pdf/issuedLite/fact-123')
  })

  it('lanza FacturamaError si Facturama responde con error al descargar', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 404 }))
    await expect(obtenerXml('no-existe')).rejects.toThrow(FacturamaError)
  })
})

describe('cancelarCfdi', () => {
  it('hace DELETE con el motivo en query string', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 200 }))

    await cancelarCfdi('fact-123', '02')

    const call = (global.fetch as any).mock.calls[0]
    expect(call[0]).toBe('https://apisandbox.facturama.mx/api/cfdi/fact-123?type=issuedLite&motive=02')
    expect(call[1].method).toBe('DELETE')
  })

  it('incluye uuidReplacement cuando el motivo es 01', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 200 }))

    await cancelarCfdi('fact-123', '01', 'uuid-sustituto')

    const call = (global.fetch as any).mock.calls[0]
    expect(call[0]).toBe('https://apisandbox.facturama.mx/api/cfdi/fact-123?type=issuedLite&motive=01&uuidReplacement=uuid-sustituto')
  })

  it('lanza FacturamaError cuando Facturama rechaza la cancelación', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ Message: 'CFDI ya cancelado' }), { status: 400 }))
    await expect(cancelarCfdi('fact-123', '02')).rejects.toThrow('CFDI ya cancelado')
  })
})
