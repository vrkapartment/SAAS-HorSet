export interface TaxSettingsUpdate {
  taxpayer_status: "individual" | "partnership"
  partner_count: number
  vat_registered: boolean
  vat_registered_from: string | null
  vat_rate: number
  vat_threshold: number
  vat_opening_credit: number
  expense_a_mode: "lump" | "actual"
  expense_a_lump_rate: number
  expense_b_mode: "lump" | "actual"
  expense_b_lump_rate: number
  cap_expense_per_bucket: boolean
  min_tax_enabled: boolean
  min_tax_rate: number
  min_tax_threshold_pnd90: number
  min_tax_threshold_pnd94: number
  min_tax_exempt_below: number
}

/**
 * Keep tax-page writes constrained to tax-owned columns.
 *
 * This explicit allowlist prevents unrelated workspace settings, especially
 * PromptPay account details, from being overwritten by a tax form submission.
 */
export function buildTaxSettingsPayload(settings: TaxSettingsUpdate): TaxSettingsUpdate {
  return {
    taxpayer_status: settings.taxpayer_status,
    partner_count: Number(settings.partner_count),
    vat_registered: Boolean(settings.vat_registered),
    vat_registered_from: settings.vat_registered_from,
    vat_rate: Number(settings.vat_rate),
    vat_threshold: Number(settings.vat_threshold),
    vat_opening_credit: Number(settings.vat_opening_credit),
    expense_a_mode: settings.expense_a_mode,
    expense_a_lump_rate: Number(settings.expense_a_lump_rate),
    expense_b_mode: settings.expense_b_mode,
    expense_b_lump_rate: Number(settings.expense_b_lump_rate),
    cap_expense_per_bucket: Boolean(settings.cap_expense_per_bucket),
    min_tax_enabled: Boolean(settings.min_tax_enabled),
    min_tax_rate: Number(settings.min_tax_rate),
    min_tax_threshold_pnd90: Number(settings.min_tax_threshold_pnd90),
    min_tax_threshold_pnd94: Number(settings.min_tax_threshold_pnd94),
    min_tax_exempt_below: Number(settings.min_tax_exempt_below),
  }
}
