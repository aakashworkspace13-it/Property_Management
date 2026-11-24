// Made-up data only.
import { describe, expect, it } from 'vitest'
import {
  agreementStatus,
  checkUpload,
  defaultTrackFrom,
  maskIdNumber,
  normalizeMobile,
  trackingPreview,
  validateTenancy,
  validateTenant,
} from './tenants.js'

const goodTenant = {
  name: '  TEST   Tenant 1 ',
  mobile: '+91 90000 00001',
  members: '3',
  twoWheelers: '1',
  fourWheelers: '0',
  idType: 'aadhaar',
  idNumber: '0000 0000 0001',
}

describe('phones and ID numbers', () => {
  it('normalises Indian mobile numbers', () => {
    expect(normalizeMobile('+91 98765-43210')).toBe('9876543210')
    expect(normalizeMobile('09876543210')).toBe('9876543210')
    expect(normalizeMobile('12345')).toBe('')
    expect(normalizeMobile('5876543210')).toBe('')
  })
  it('masks ID numbers', () => {
    expect(maskIdNumber('000000000001')).toBe('•••• 0001')
    expect(maskIdNumber('12')).toBe('••••')
  })
})

describe('validateTenant', () => {
  it('cleans valid input', () => {
    const { value, errors } = validateTenant(goodTenant)
    expect(errors).toEqual({})
    expect(value).toMatchObject({ name: 'TEST Tenant 1', mobile: '9000000001', members: 3, twoWheelers: 1, fourWheelers: 0, idNumber: '000000000001' })
  })
  it('reports missing and invalid fields', () => {
    const { errors } = validateTenant({ ...goodTenant, name: '', mobile: '123', members: '0', idType: '', idNumber: '' })
    expect(Object.keys(errors).sort()).toEqual(['idNumber', 'idType', 'members', 'mobile', 'name'])
  })
  it('checks Aadhaar and PAN formats', () => {
    expect(validateTenant({ ...goodTenant, idNumber: '1234' }).errors.idNumber).toMatch(/12 digits/)
    expect(validateTenant({ ...goodTenant, idNumber: '1234567890123' }).errors.idNumber).toMatch(/exactly 12 digits/)
    expect(validateTenant({ ...goodTenant, idNumber: '12345678901' }).errors.idNumber).toMatch(/exactly 12 digits/)
    expect(validateTenant({ ...goodTenant, idType: 'pan', idNumber: 'abcde1234f' }).errors).toEqual({})
    expect(validateTenant({ ...goodTenant, idType: 'pan', idNumber: 'ABC' }).errors.idNumber).toMatch(/ABCDE1234F/)
  })
  it('needs a phone for an emergency contact', () => {
    expect(validateTenant({ ...goodTenant, emergencyName: 'Relative' }).errors.emergencyMobile).toBeTruthy()
    expect(validateTenant({ ...goodTenant, emergencyName: 'Relative', emergencyMobile: '9000000002' }).errors).toEqual({})
  })
})

describe('validateTenancy', () => {
  const base = { flatId: 'B01-G-1', moveIn: '2025-01-15', monthlyRent: '10,000', trackFrom: '2025-01-15' }

  it('accepts a valid tenancy and converts rent to paise', () => {
    const { value, errors } = validateTenancy(base)
    expect(errors).toEqual({})
    expect(value.monthlyRent).toBe(1_000_000)
  })
  it('blocks a second active tenant in the same flat', () => {
    expect(validateTenancy(base, [{ moveIn: '2024-01-01' }]).errors.flatId).toMatch(/already has a tenant/)
  })
  it('blocks a move-in before the previous tenant left', () => {
    expect(validateTenancy(base, [{ moveIn: '2024-01-01', moveOut: '2025-01-20' }]).errors.moveIn).toMatch(/after the previous tenant/)
    expect(validateTenancy(base, [{ moveIn: '2024-01-01', moveOut: '2025-01-14' }]).errors).toEqual({})
  })
  it('checks rent, tracking date and agreement dates', () => {
    const { errors } = validateTenancy({ ...base, monthlyRent: 'abc', trackFrom: '2024-12-01', agreementStart: '2025-02-01', agreementEnd: '2025-01-01' })
    expect(Object.keys(errors).sort()).toEqual(['agreementEnd', 'monthlyRent', 'trackFrom'])
  })
})

describe('rent tracking start', () => {
  it('defaults to the current rent period for existing tenants', () => {
    expect(defaultTrackFrom('2023-03-10', '2025-11-20')).toBe('2025-11-10')
    expect(defaultTrackFrom('2023-03-25', '2025-11-20')).toBe('2025-10-25')
    expect(defaultTrackFrom('2025-12-01', '2025-11-20')).toBe('2025-12-01')
  })
  it('previews the first tracked period', () => {
    expect(trackingPreview('2023-03-10', '2025-11-10')).toMatchObject({ start: '2025-11-10', end: '2025-12-09' })
  })
})

describe('agreements and uploads', () => {
  it('reports agreement status', () => {
    expect(agreementStatus('', '2025-11-20')).toBe('none')
    expect(agreementStatus('2025-11-19', '2025-11-20')).toBe('expired')
    expect(agreementStatus('2025-12-15', '2025-11-20')).toBe('expiring')
    expect(agreementStatus('2026-06-01', '2025-11-20')).toBe('active')
  })
  it('checks upload type and size', () => {
    expect(checkUpload({ type: 'image/jpeg', size: 1000 })).toBeNull()
    expect(checkUpload({ type: 'image/gif', size: 1000 })).toMatch(/JPG/)
    expect(checkUpload({ type: 'application/pdf', size: 16 * 1024 * 1024 })).toMatch(/15 MB/)
  })
})
