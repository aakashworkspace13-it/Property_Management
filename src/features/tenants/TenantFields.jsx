import Field from '../../components/Field.jsx'
import { ID_TYPES } from '../../lib/tenants.js'

// The one-time tenant details, shared by "Add tenant" and "Edit tenant".
export default function TenantFields({ values, setValue, errors }) {
  const bind = (k) => ({ value: values[k], onChange: (e) => setValue(k, e.target.value) })
  return (
    <>
      <fieldset className="fieldset">
        <legend>Tenant</legend>
        <Field label="Full name" required error={errors.name}>
          <input maxLength={80} autoComplete="off" {...bind('name')} />
        </Field>
        <div className="form-row">
          <Field label="Mobile number" required error={errors.mobile}>
            <input type="tel" inputMode="tel" maxLength={16} placeholder="10-digit mobile" {...bind('mobile')} />
          </Field>
          <Field label="Alternate number" error={errors.altMobile}>
            <input type="tel" inputMode="tel" maxLength={16} {...bind('altMobile')} />
          </Field>
        </div>
      </fieldset>

      <fieldset className="fieldset">
        <legend>Household and vehicles</legend>
        <div className="form-row three">
          <Field label="Number of members" required error={errors.members}>
            <input type="number" min={1} max={30} inputMode="numeric" {...bind('members')} />
          </Field>
          <Field label="Two-wheelers" error={errors.twoWheelers}>
            <input type="number" min={0} max={20} inputMode="numeric" {...bind('twoWheelers')} />
          </Field>
          <Field label="Four-wheelers" error={errors.fourWheelers}>
            <input type="number" min={0} max={20} inputMode="numeric" {...bind('fourWheelers')} />
          </Field>
        </div>
      </fieldset>

      <fieldset className="fieldset">
        <legend>ID proof</legend>
        <div className="form-row">
          <Field label="ID type" required error={errors.idType}>
            <select {...bind('idType')}>
              {ID_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
          {values.idType === 'aadhaar' ? (
            <Field label="Aadhaar number" required error={errors.idNumber} hint="Exactly 12 digits. Shown in full only on the tenant's page.">
              <input
                inputMode="numeric"
                maxLength={12}
                autoComplete="off"
                placeholder="12 digits"
                value={values.idNumber}
                onChange={(e) => setValue('idNumber', e.target.value.replace(/\D/g, '').slice(0, 12))}
              />
            </Field>
          ) : (
            <Field label="ID number" required error={errors.idNumber} hint="Shown in full only on the tenant's page.">
              <input maxLength={30} autoComplete="off" {...bind('idNumber')} />
            </Field>
          )}
        </div>
      </fieldset>

      <fieldset className="fieldset">
        <legend>Emergency contact (optional)</legend>
        <div className="form-row three">
          <Field label="Name" error={errors.emergencyName}>
            <input maxLength={80} {...bind('emergencyName')} />
          </Field>
          <Field label="Relation" error={errors.emergencyRelation}>
            <input maxLength={40} placeholder="e.g. Brother" {...bind('emergencyRelation')} />
          </Field>
          <Field label="Mobile" error={errors.emergencyMobile}>
            <input type="tel" inputMode="tel" maxLength={16} {...bind('emergencyMobile')} />
          </Field>
        </div>
      </fieldset>
    </>
  )
}
