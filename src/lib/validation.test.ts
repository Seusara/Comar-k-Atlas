import { describe, expect, it } from 'vitest'
import { parseRequiredStrings, parseRequiredNumbers } from './validation'

describe('parseRequiredStrings', () => {
  it('returns the fields as strings when all are present and non-empty', () => {
    const result = parseRequiredStrings({ nombre: 'Acme', rfc: 'AAA010101AAA' }, ['nombre', 'rfc'])
    expect(result).toEqual({ data: { nombre: 'Acme', rfc: 'AAA010101AAA' } })
  })

  it('rejects when a required field is missing', () => {
    const result = parseRequiredStrings({ nombre: 'Acme' }, ['nombre', 'rfc'])
    expect('error' in result).toBe(true)
  })

  it('rejects when a required field is present but not a string', () => {
    const result = parseRequiredStrings({ nombre: 123, rfc: 'AAA010101AAA' }, ['nombre', 'rfc'])
    expect('error' in result).toBe(true)
  })

  it('rejects when a required field is an empty string', () => {
    const result = parseRequiredStrings({ nombre: '', rfc: 'AAA010101AAA' }, ['nombre', 'rfc'])
    expect('error' in result).toBe(true)
  })

  it('rejects when body is not an object', () => {
    const result = parseRequiredStrings('not an object', ['nombre'])
    expect('error' in result).toBe(true)
  })

  it('rejects when body is null', () => {
    const result = parseRequiredStrings(null, ['nombre'])
    expect('error' in result).toBe(true)
  })
})

describe('parseRequiredNumbers', () => {
  it('returns the fields as numbers when all are present and finite', () => {
    const result = parseRequiredNumbers({ precio: 100, iva: 16 }, ['precio', 'iva'])
    expect(result).toEqual({ data: { precio: 100, iva: 16 } })
  })

  it('rejects when a required field is missing', () => {
    const result = parseRequiredNumbers({ precio: 100 }, ['precio', 'iva'])
    expect('error' in result).toBe(true)
  })

  it('rejects when a required field is present but not a number', () => {
    const result = parseRequiredNumbers({ precio: '100', iva: 16 }, ['precio', 'iva'])
    expect('error' in result).toBe(true)
  })

  it('rejects when a required field is NaN or Infinity', () => {
    const result = parseRequiredNumbers({ precio: NaN, iva: 16 }, ['precio', 'iva'])
    expect('error' in result).toBe(true)
  })

  it('rejects when body is not an object', () => {
    const result = parseRequiredNumbers('not an object', ['precio'])
    expect('error' in result).toBe(true)
  })
})
