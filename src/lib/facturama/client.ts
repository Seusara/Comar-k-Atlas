const FACTURAMA_BASE_URL = 'https://apisandbox.facturama.mx'

export class FacturamaError extends Error {}

function authHeader(): string {
  const user = process.env.FACTURAMA_API_USER
  const password = process.env.FACTURAMA_API_PASSWORD
  if (!user || !password) {
    throw new Error('FACTURAMA_API_USER y FACTURAMA_API_PASSWORD deben estar configurados')
  }
  return 'Basic ' + Buffer.from(`${user}:${password}`).toString('base64')
}

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => null)
  if (body && typeof body === 'object' && 'Message' in body) {
    return String((body as { Message: unknown }).Message)
  }
  return fallback
}

async function facturamaFetch(path: string, method: string, body?: unknown): Promise<Response> {
  return fetch(`${FACTURAMA_BASE_URL}${path}`, {
    method,
    headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

export async function registrarCsd(
  rfc: string,
  certificateBase64: string,
  privateKeyBase64: string,
  privateKeyPassword: string,
): Promise<void> {
  const res = await facturamaFetch('/api-lite/csds', 'POST', {
    Rfc: rfc,
    Certificate: certificateBase64,
    PrivateKey: privateKeyBase64,
    PrivateKeyPassword: privateKeyPassword,
  })

  if (!res.ok) {
    throw new FacturamaError(await readErrorMessage(res, `Facturama respondió ${res.status} al registrar el CSD`))
  }
}

export interface FacturamaEmisor {
  rfc: string
  nombre: string
  regimenFiscal: string
}

export interface FacturamaReceptor {
  rfc: string
  nombre: string
  usoCfdi: string
  regimenFiscal: string
  codigoPostal: string
}

export interface FacturamaConcepto {
  claveSat: string
  claveUnidad: string
  descripcion: string
  cantidad: number
  precioUnitario: number
  iva: number
}

export interface CrearCfdiInput {
  emisor: FacturamaEmisor
  receptor: FacturamaReceptor
  conceptos: FacturamaConcepto[]
  formaPago: string
  metodoPago: string
  lugarExpedicion: string
  folio: string
}

export interface CrearCfdiResult {
  facturamaId: string
  uuidFiscal: string
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function buildCfdiPayload(input: CrearCfdiInput): Record<string, unknown> {
  return {
    CfdiType: 'I',
    ExpeditionPlace: input.lugarExpedicion,
    Folio: input.folio,
    PaymentForm: input.formaPago,
    PaymentMethod: input.metodoPago,
    Exportation: '01',
    Issuer: {
      Rfc: input.emisor.rfc,
      Name: input.emisor.nombre,
      FiscalRegime: input.emisor.regimenFiscal,
    },
    Receiver: {
      Rfc: input.receptor.rfc,
      Name: input.receptor.nombre,
      CfdiUse: input.receptor.usoCfdi,
      FiscalRegime: input.receptor.regimenFiscal,
      TaxZipCode: input.receptor.codigoPostal,
    },
    Items: input.conceptos.map(c => {
      const subtotal = round2(c.cantidad * c.precioUnitario)
      const ivaTotal = round2(subtotal * c.iva / 100)
      return {
        ProductCode: c.claveSat,
        UnitCode: c.claveUnidad,
        Description: c.descripcion,
        Quantity: c.cantidad,
        UnitPrice: c.precioUnitario,
        Subtotal: subtotal,
        TaxObject: '02',
        Taxes: [{ Name: 'IVA', Rate: c.iva / 100, Base: subtotal, Total: ivaTotal, IsRetention: false }],
        Total: round2(subtotal + ivaTotal),
      }
    }),
  }
}

export async function crearCfdi(input: CrearCfdiInput): Promise<CrearCfdiResult> {
  const res = await facturamaFetch('/api-lite/3/cfdis', 'POST', buildCfdiPayload(input))

  if (!res.ok) {
    throw new FacturamaError(await readErrorMessage(res, `Facturama respondió ${res.status} al timbrar`))
  }

  const body = (await res.json()) as { Id?: unknown; Complement?: { TaxStamp?: { Uuid?: unknown } } }
  const facturamaId = body.Id
  const uuidFiscal = body.Complement?.TaxStamp?.Uuid

  if (typeof facturamaId !== 'string' || typeof uuidFiscal !== 'string') {
    throw new FacturamaError('Facturama no devolvió un Id o UUID fiscal válido')
  }

  return { facturamaId, uuidFiscal }
}

async function descargar(formato: 'xml' | 'pdf', facturamaId: string, contentType: string, notFoundMessage: string): Promise<{ content: Buffer; contentType: string }> {
  const res = await fetch(`${FACTURAMA_BASE_URL}/api/Cfdi/${formato}/issuedLite/${facturamaId}`, { headers: { Authorization: authHeader() } })
  if (!res.ok) {
    throw new FacturamaError(`Facturama respondió ${res.status} ${notFoundMessage}`)
  }
  const body = (await res.json()) as { Content?: unknown }
  if (typeof body.Content !== 'string') {
    throw new FacturamaError(`Facturama no devolvió contenido válido ${notFoundMessage}`)
  }
  const content = Buffer.from(body.Content, 'base64')
  return { content, contentType }
}

export async function obtenerXml(facturamaId: string): Promise<{ content: Buffer; contentType: string }> {
  return descargar('xml', facturamaId, 'application/xml', 'al descargar el XML')
}

export async function obtenerPdf(facturamaId: string): Promise<{ content: Buffer; contentType: string }> {
  return descargar('pdf', facturamaId, 'application/pdf', 'al descargar el PDF')
}

export type MotivoCancelacion = '01' | '02' | '03' | '04'

export async function cancelarCfdi(facturamaId: string, motivo: MotivoCancelacion, uuidSustitucion?: string): Promise<void> {
  const query = motivo === '01' && uuidSustitucion
    ? `?type=issuedLite&motive=${motivo}&uuidReplacement=${uuidSustitucion}`
    : `?type=issuedLite&motive=${motivo}`
  const res = await fetch(`${FACTURAMA_BASE_URL}/api/cfdi/${facturamaId}${query}`, {
    method: 'DELETE',
    headers: { Authorization: authHeader() },
  })

  if (!res.ok) {
    throw new FacturamaError(await readErrorMessage(res, `Facturama respondió ${res.status} al cancelar`))
  }
}
