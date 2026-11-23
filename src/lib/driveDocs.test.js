// Made-up data only.
import { describe, expect, it } from 'vitest'
import { activeMemberEmails, documentsNeedingSharing, driveFileName, isDriveLink, sharingChanges, tenantFolderName } from './driveDocs.js'

const members = [
  { email: 'owner@example.invalid', active: true },
  { email: 'Family@example.invalid', active: true },
  { email: 'old@example.invalid', active: false },
]

describe('names and links', () => {
  it('makes safe folder and file names', () => {
    expect(tenantFolderName({ name: 'TEST Tenant: One/A', id: 'abcdef123' })).toBe('TEST Tenant  One A (abcdef)')
    expect(driveFileName('ID proof 1', 'front?.jpg')).toBe('ID proof 1 - front .jpg')
  })
  it('recognises Drive links only', () => {
    expect(isDriveLink('https://drive.google.com/file/d/x/view')).toBe(true)
    expect(isDriveLink('https://example.com/file')).toBe(false)
  })
})

describe('sharing', () => {
  const emails = activeMemberEmails(members)

  it('shares with every active member except the uploader', () => {
    expect(emails).toEqual(['owner@example.invalid', 'family@example.invalid'])
    expect(sharingChanges({ uploadedBy: 'owner@example.invalid', sharedWith: [] }, emails)).toEqual({ add: ['family@example.invalid'], remove: [] })
  })

  it('removes members who were turned off', () => {
    const doc = { uploadedBy: 'owner@example.invalid', sharedWith: ['family@example.invalid', 'old@example.invalid'] }
    expect(sharingChanges(doc, emails)).toEqual({ add: [], remove: ['old@example.invalid'] })
  })

  it('lists only my documents that need a sharing update', () => {
    const docs = [
      { id: 'a', uploadedBy: 'owner@example.invalid', sharedWith: ['family@example.invalid'] }, // up to date
      { id: 'b', uploadedBy: 'owner@example.invalid', sharedWith: [] }, // needs family
      { id: 'c', uploadedBy: 'family@example.invalid', sharedWith: [] }, // not mine
    ]
    expect(documentsNeedingSharing(docs, members, 'OWNER@example.invalid').map((d) => d.id)).toEqual(['b'])
  })
})
