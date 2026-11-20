// Tests use made-up data only (fake CA numbers, example.invalid emails, 0000 phone numbers).
import { describe, expect, it } from 'vitest'
import {
  flatCode,
  flatReference,
  floorKey,
  floorLabel,
  floorOrder,
  maskPhone,
  occupancy,
  parseCsv,
  planImport,
  positionKey,
  sortFlats,
} from './property.js'

const HEADER =
  "ID (Building-Floor-Flat),Building,Floor,Flat,CA number,Type of connection,Sub meter,Meter owner name',Phone number,Email ID attached,Tenant Appliable,Comment,"

function csv(...lines) {
  return [HEADER, ...lines].join('\r\n')
}

describe('floors and positions', () => {
  it('normalises floor labels', () => {
    expect(['Ground', 'G', 'Ground Floor', '1st', 'First', '2', '3rd', '10th', 'Basement'].map(floorKey))
      .toEqual(['G', 'G', 'G', '1', '1', '2', '3', '10', 'BS'])
    expect(['ground', 'first floor', '2', '11', '22', 'Mezzanine'].map(floorLabel))
      .toEqual(['Ground', '1st', '2nd', '11th', '22nd', 'Mezzanine'])
    expect(floorOrder('Basement')).toBeLessThan(floorOrder('Ground'))
    expect(floorOrder('5th')).toBeLessThan(floorOrder('Mezzanine'))
  })

  it('normalises positions', () => {
    expect(['Front', 'back', 'Left', 'RIGHT', 'Single', '1', '1C', 'Shop 2'].map(positionKey))
      .toEqual(['F', 'B', 'L', 'R', 'S', '1', '1C', 'SHOP2'])
  })

  it('builds flat codes that make floor + position unique per building', () => {
    expect(flatCode('B01', 'Ground', 1)).toBe('B01-G-1')
    expect(flatCode('B02', '1st', 'Left')).toBe('B02-1-L')
    expect(flatCode('B03', 'Ground', '1C')).toBe('B03-G-1C')
    expect(flatCode('B02', 'first floor', 'left')).toBe(flatCode('B02', '1st', 'Left'))
    expect(() => flatCode('B01', '', '1')).toThrow()
  })

  it('formats a flat reference and sorts flats', () => {
    expect(flatReference({ name: '40 Gaj' }, { buildingId: 'B01', floor: '1st', position: 'Left', friendlyName: '' }))
      .toBe('40 Gaj / 1st / Left')
    expect(flatReference({ name: 'Home' }, { buildingId: 'B06', floor: '2nd', position: '1', friendlyName: 'Hall' }))
      .toBe('Home / 2nd / 1 — Hall')
    const sorted = sortFlats([
      { buildingId: 'B02', floor: '1st', position: 'L' },
      { buildingId: 'B01', floor: '2nd', position: '1' },
      { buildingId: 'B01', floor: 'Ground', position: '1' },
    ])
    expect(sorted.map((f) => `${f.buildingId}/${f.floor}`)).toEqual(['B01/Ground', 'B01/2nd', 'B02/1st'])
  })
})

describe('maskPhone and occupancy', () => {
  it('masks phone numbers', () => {
    expect(maskPhone(9000000012)).toBe('90••••••12')
    expect(maskPhone('')).toBe('')
  })

  it('derives occupancy from tenancy dates', () => {
    const flat = { code: 'B01-G-1', ownUse: false }
    const tenancies = [{ flatId: 'B01-G-1', moveIn: '2025-01-15', moveOut: '2025-06-30' }]
    expect(occupancy(flat, tenancies, '2025-03-01')).toBe('occupied')
    expect(occupancy(flat, tenancies, '2025-06-30')).toBe('occupied')
    expect(occupancy(flat, tenancies, '2025-07-01')).toBe('vacant')
    expect(occupancy({ ...flat, ownUse: true }, tenancies, '2025-03-01')).toBe('own-use')
  })
})

describe('parseCsv', () => {
  it('handles quotes, escaped quotes, commas and CRLF', () => {
    expect(parseCsv('a,"b, c","say ""hi"""\r\n1,2,3\n')).toEqual([
      ['a', 'b, c', 'say "hi"'],
      ['1', '2', '3'],
    ])
  })
  it('drops blank lines and a byte-order mark', () => {
    expect(parseCsv('﻿x,y\n,\n1,2')).toEqual([['x', 'y'], ['1', '2']])
  })
})

describe('planImport', () => {
  const sample = csv(
    'B01-G-1,Test A,Ground,1,CA_TEST_1,Domestic,Yes,Holder One,9000000001,one@example.invalid,Yes,,Yes',
    'B01-1-1,Test A,1st,1,CA_TEST_1,Domestic,Yes,Holder One,9000000001,one@example.invalid,Yes,,',
    'B02-G-F,Test B,Ground,Front,CA_TEST_2,Commercial,Yes,Holder Two,9000000002,,Yes,Clinic,',
    'B03-G-1C,Test C,Ground,1C,CA_TEST_3,Commercial,NA,Holder Two,9000000002,,Yes,,',
    'B03-G-1D,Test C,Ground,1D,CA_TEST_4,Domestic,Yes,Holder Two,9000000002,,Yes,,',
    'B06-2-1,Test Home,2nd,1,CA_TEST_5,Domestic,Hall,Holder Three,9000000003,,No,,',
  )

  it('groups rows into buildings, flats and shared connections', () => {
    const plan = planImport(sample)
    expect(plan.problems).toEqual([])
    expect(plan.buildings.map((b) => [b.code, b.name, b.flatCount, b.ownUse])).toEqual([
      ['B01', 'Test A', 2, false],
      ['B02', 'Test B', 1, false],
      ['B03', 'Test C', 2, false],
      ['B06', 'Test Home', 1, true],
    ])
    expect(plan.flats.map((f) => f.code)).toEqual(['B01-G-1', 'B01-1-1', 'B02-G-F', 'B03-G-1C', 'B03-G-1D', 'B06-2-1'])
    const shared = plan.connections.find((c) => c.caNumber === 'CA_TEST_1')
    expect(shared).toMatchObject({ type: 'domestic', submeter: true, flatCodes: ['B01-G-1', 'B01-1-1'], holderPhone: '9000000001' })
    expect(plan.connections.find((c) => c.caNumber === 'CA_TEST_2').type).toBe('commercial')
  })

  it('turns comments and sub-meter words into friendly names', () => {
    const plan = planImport(sample)
    expect(plan.flats.find((f) => f.code === 'B02-G-F').friendlyName).toBe('Clinic')
    const home = plan.flats.find((f) => f.code === 'B06-2-1')
    expect(home).toMatchObject({ friendlyName: 'Hall', ownUse: true, floor: '2nd' })
    expect(plan.connections.find((c) => c.caNumber === 'CA_TEST_5').submeter).toBe(false)
  })

  it('rejects duplicate floor + position in one building', () => {
    const plan = planImport(csv(
      'B01-G-1,Test A,Ground,1,,,,,,,Yes,,',
      'B01-G-1,Test A,Ground Floor,1,,,,,,,Yes,,',
    ))
    expect(plan.flats).toHaveLength(1)
    expect(plan.problems[0]).toMatchObject({ row: 3 })
    expect(plan.problems[0].message).toMatch(/Duplicate flat B01-G-1/)
  })

  it('reports missing fields and conflicting building codes', () => {
    const plan = planImport(csv(
      'B01-G-1,Test A,,1,,,,,,,Yes,,',
      'B09-G-1,Test A,Ground,2,,,,,,,Yes,,',
      'B09-1-1,Other,1st,1,,,,,,,Yes,,',
    ))
    expect(plan.problems.map((p) => p.row)).toEqual([2, 4])
    expect(plan.flats.map((f) => f.code)).toEqual(['B09-G-2'])
  })

  it('warns when an ID does not match its floor/flat, and on conflicting connection details', () => {
    const plan = planImport(csv(
      'B01-9-9,Test A,Ground,1,CA_X,Domestic,,Holder,9000000001,,Yes,,',
      'B01-1-1,Test A,1st,1,CA_X,Commercial,,Holder,9000000009,,Yes,,',
    ))
    expect(plan.flats[0].code).toBe('B01-G-1')
    expect(plan.warnings.map((w) => w.row)).toEqual([2, 3, 3])
  })

  it('takes a more specific position from the ID on the same building and floor', () => {
    const plan = planImport(csv(
      'B03-G-1C,Test C,Ground,1,CA_A,Commercial,NA,,,,Yes,,',
      'B03-G-1D,Test C,Ground,1,CA_B,Domestic,Yes,,,,Yes,,',
    ))
    expect(plan.problems).toEqual([])
    expect(plan.flats.map((f) => [f.code, f.position])).toEqual([['B03-G-1C', '1C'], ['B03-G-1D', '1D']])
    expect(plan.warnings).toHaveLength(2)
  })

  it('marks what already exists so a re-import skips it', () => {
    const plan = planImport(sample, {
      buildingCodes: new Set(['B01']),
      flatCodes: new Set(['B01-G-1']),
      caNumbers: new Set(['CA_TEST_1']),
    })
    expect(plan.buildings.find((b) => b.code === 'B01').exists).toBe(true)
    expect(plan.flats.filter((f) => f.exists).map((f) => f.code)).toEqual(['B01-G-1'])
    expect(plan.connections.find((c) => c.caNumber === 'CA_TEST_1').exists).toBe(true)
  })

  it('needs building, floor and flat columns', () => {
    expect(planImport('Name,Other\nx,y').problems[0].message).toMatch(/Missing column/)
    expect(planImport('').problems[0].message).toMatch(/no data/)
  })
})
