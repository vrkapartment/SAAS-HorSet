import { describe, expect, it } from "vitest"
import { buildTaxSettingsPayload, type TaxSettingsUpdate } from "../tax-settings-payload"

const taxSettings: TaxSettingsUpdate = {
  taxpayer_status: "individual",
  partner_count: 1,
  vat_registered: true,
  vat_registered_from: "2026-08-01",
  vat_rate: 0.07,
  vat_threshold: 1_800_000,
  vat_opening_credit: 0,
  expense_a_mode: "lump",
  expense_a_lump_rate: 0.3,
  expense_b_mode: "actual",
  expense_b_lump_rate: 0.6,
  cap_expense_per_bucket: true,
  min_tax_enabled: true,
  min_tax_rate: 0.005,
  min_tax_threshold_pnd90: 120_000,
  min_tax_threshold_pnd94: 60_000,
  min_tax_exempt_below: 5_000,
}

describe("buildTaxSettingsPayload", () => {
  it("contains only tax-owned workspace columns", () => {
    const payload = buildTaxSettingsPayload({
      ...taxSettings,
      promptpay_id: "",
      promptpay_name: "",
      common_fee: 0,
    } as TaxSettingsUpdate & Record<string, unknown>)

    expect(Object.keys(payload).sort()).toEqual([
      "cap_expense_per_bucket",
      "expense_a_lump_rate",
      "expense_a_mode",
      "expense_b_lump_rate",
      "expense_b_mode",
      "min_tax_enabled",
      "min_tax_exempt_below",
      "min_tax_rate",
      "min_tax_threshold_pnd90",
      "min_tax_threshold_pnd94",
      "partner_count",
      "taxpayer_status",
      "vat_opening_credit",
      "vat_rate",
      "vat_registered",
      "vat_registered_from",
      "vat_threshold",
    ].sort())
    expect(payload).not.toHaveProperty("promptpay_id")
    expect(payload).not.toHaveProperty("promptpay_name")
    expect(payload).not.toHaveProperty("common_fee")
  })

  it("preserves every tax setting value", () => {
    expect(buildTaxSettingsPayload(taxSettings)).toEqual(taxSettings)
  })
})
