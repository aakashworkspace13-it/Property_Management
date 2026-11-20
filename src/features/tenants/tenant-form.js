// Default values and conversions for the tenant form (TenantFields).

export const EMPTY_TENANT = {
  name: '',
  mobile: '',
  altMobile: '',
  members: '1',
  twoWheelers: '0',
  fourWheelers: '0',
  idType: 'aadhaar',
  idNumber: '',
  emergencyName: '',
  emergencyRelation: '',
  emergencyMobile: '',
  notes: '',
}

/** Form values from a saved tenant (numbers back to text for inputs). */
export function tenantToForm(t) {
  return {
    ...EMPTY_TENANT,
    ...Object.fromEntries(Object.keys(EMPTY_TENANT).map((k) => [k, t[k] === undefined || t[k] === null ? '' : String(t[k])])),
  }
}
