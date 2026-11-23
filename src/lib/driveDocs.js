// Documents in Google Drive (owner choice 2026-11-23): each file lives in the Google Drive of the
// family member who uploaded it, under "Property Manager / <tenant>", and is shared view-only with
// every active family member. The app stores only the link. Pure helpers (no network).

export const DRIVE_ROOT_FOLDER = 'Property Manager'

/** Folder name for a tenant: readable name plus a short ID so two tenants never share a folder. */
export function tenantFolderName(tenant) {
  const name = String(tenant?.name ?? 'Tenant').replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Tenant'
  return `${name} (${String(tenant?.id ?? '').slice(0, 6)})`
}

/** File name in Drive: "ID proof 1 - original.jpg". */
export function driveFileName(label, originalName) {
  const clean = String(originalName ?? 'file').replace(/[\\/:*?"<>|]+/g, ' ').trim()
  return `${label} - ${clean}`.slice(0, 200)
}

/** True for a Google Drive / Docs web link. */
export function isDriveLink(url) {
  return /^https:\/\/(drive|docs)\.google\.com\//.test(String(url ?? ''))
}

/** Emails (lower-case) of active family members. */
export function activeMemberEmails(members) {
  return members.filter((m) => m.active).map((m) => m.email.toLowerCase())
}

/**
 * Who must be added to / removed from a file's sharing so that exactly the active family members
 * (other than the uploader, who owns it) can view it.
 */
export function sharingChanges(document, activeEmails) {
  const owner = String(document.uploadedBy ?? '').toLowerCase()
  const want = new Set(activeEmails.map((e) => e.toLowerCase()).filter((e) => e !== owner))
  const have = new Set((document.sharedWith ?? []).map((e) => e.toLowerCase()))
  return {
    add: [...want].filter((e) => !have.has(e)).sort(),
    remove: [...have].filter((e) => !want.has(e)).sort(),
  }
}

/** Documents uploaded by `me` whose sharing is out of date (a member was added or turned off). */
export function documentsNeedingSharing(documents, members, me) {
  const emails = activeMemberEmails(members)
  const mine = String(me ?? '').toLowerCase()
  return documents.filter((d) => {
    if (d.deleted || String(d.uploadedBy).toLowerCase() !== mine) return false
    const { add, remove } = sharingChanges(d, emails)
    return add.length > 0 || remove.length > 0
  })
}
