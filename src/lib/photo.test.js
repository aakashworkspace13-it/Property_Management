import { describe, expect, it } from 'vitest'
import { checkPhotoFile, isValidPhotoData, passportCrop } from './photo.js'

describe('passportCrop', () => {
  it('crops the sides of a wide picture', () => {
    expect(passportCrop(1600, 900)).toEqual({ sx: 450, sy: 0, sw: 700, sh: 900 })
  })
  it('crops top and bottom of a tall picture', () => {
    expect(passportCrop(700, 1600)).toEqual({ sx: 0, sy: 350, sw: 700, sh: 900 })
  })
  it('keeps an exact 7:9 picture whole', () => {
    expect(passportCrop(210, 270)).toEqual({ sx: 0, sy: 0, sw: 210, sh: 270 })
  })
})

describe('photo checks', () => {
  it('accepts images only', () => {
    expect(checkPhotoFile({ type: 'image/jpeg', size: 1000 })).toBeNull()
    expect(checkPhotoFile({ type: 'application/pdf', size: 1000 })).toMatch(/photo/)
    expect(checkPhotoFile(null)).toMatch(/Choose/)
  })
  it('stored data must be a small JPEG data URL', () => {
    expect(isValidPhotoData('data:image/jpeg;base64,AAAA')).toBe(true)
    expect(isValidPhotoData('data:image/png;base64,AAAA')).toBe(false)
    expect(isValidPhotoData(`data:image/jpeg;base64,${'A'.repeat(100_000)}`)).toBe(false)
  })
})
