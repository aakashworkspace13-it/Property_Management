// Main sections of the app, in the order agreed in docs/REQUIREMENTS.md section 3.
// `mobile: true` items appear in the phone bottom bar; the rest are under "More".
export const sections = [
  { path: '/', label: 'Dashboard', short: 'Home', icon: '⌂', mobile: true },
  { path: '/flats', label: 'Buildings and flats', short: 'Flats', icon: '▦', mobile: true },
  { path: '/collections', label: 'Collections', short: 'Collect', icon: '₹', mobile: true },
  { path: '/expenses', label: 'Expenses', short: 'Expenses', icon: '≡', mobile: true },
  { path: '/electricity', label: 'Electricity', short: 'Electricity', icon: 'ϟ' },
  { path: '/documents', label: 'Documents', short: 'Documents', icon: '❐' },
  { path: '/reports', label: 'Reports', short: 'Reports', icon: '◔' },
  { path: '/settings', label: 'Settings', short: 'Settings', icon: '⚙' },
]

export const moreSections = sections.filter((s) => !s.mobile)
