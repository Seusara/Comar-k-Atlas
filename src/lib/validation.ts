export type ParseResult<K extends string, T> = { data: Record<K, T> } | { error: string }

export function parseRequiredStrings<K extends string>(body: unknown, fields: K[]): ParseResult<K, string> {
  if (typeof body !== 'object' || body === null) {
    return { error: 'Cuerpo de la solicitud inválido' }
  }

  const record = body as Record<string, unknown>
  const data = {} as Record<K, string>

  for (const field of fields) {
    const value = record[field]
    if (typeof value !== 'string' || value.length === 0) {
      return { error: `Falta el campo requerido: ${field}` }
    }
    data[field] = value
  }

  return { data }
}

export function parseRequiredNumbers<K extends string>(body: unknown, fields: K[]): ParseResult<K, number> {
  if (typeof body !== 'object' || body === null) {
    return { error: 'Cuerpo de la solicitud inválido' }
  }

  const record = body as Record<string, unknown>
  const data = {} as Record<K, number>

  for (const field of fields) {
    const value = record[field]
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return { error: `Falta el campo requerido: ${field}` }
    }
    data[field] = value
  }

  return { data }
}
