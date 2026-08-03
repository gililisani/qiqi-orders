/**
 * SLI checkbox states — ONE canonical key set, shared by the standalone form,
 * the order-SLI modal and the PDF renderer (SLIDocument).
 *
 * The canonical keys are exactly what SLIDocument reads. Historically the
 * standalone form wrote its own names for three of them, so those boxes
 * rendered unchecked on every standalone PDF no matter what the admin ticked
 * (audit WP5.2 follow-on). normalizeSLICheckboxStates() maps the legacy keys
 * stored on existing rows; all new writes use canonical keys only.
 */

// A type alias (not interface) so it stays assignable to the PDF's
// Record<string, boolean> checkbox_states field.
export type SLICheckboxStates = {
  /** Box 8: Related party indicator */
  related_party_related: boolean;
  related_party_non_related: boolean;
  /** Box 10: Routed export transaction */
  routed_export_yes: boolean;
  routed_export_no: boolean;
  /** Box 12: Type of consignee */
  consignee_type_government: boolean;
  consignee_type_direct_consumer: boolean;
  consignee_type_other_unknown: boolean;
  consignee_type_reseller: boolean;
  /** Box 16: Hazardous material */
  hazardous_material_yes: boolean;
  hazardous_material_no: boolean;
  /** Box 20: TIB / carnet */
  tib_carnet_yes: boolean;
  tib_carnet_no: boolean;
  /** Box 21: Shipper requests insurance */
  insurance_yes: boolean;
  insurance_no: boolean;
  /** Box 23: Shipper must check (freight charges) */
  payment_prepaid: boolean;
  payment_collect: boolean;
  /** Box 24: Deliver to */
  deliver_to: boolean;
  /** Box 39: remaining non-licensable Schedule B/HTS ≤ $2,500, no AES filing */
  checkbox_39: boolean;
  /** Box 40: authorize forwarder as agent (EEI / export control filing) */
  checkbox_40: boolean;
  /** Box 48: validate electronic signature */
  checkbox_48: boolean;
};

/** Defaults both flows agreed on before consolidation: Qiqi ships to
 *  non-related re-sellers, nothing hazardous, forwarder authorized (40),
 *  signature validated (48). */
export const DEFAULT_SLI_CHECKBOXES: SLICheckboxStates = {
  related_party_related: false,
  related_party_non_related: true,
  routed_export_yes: false,
  routed_export_no: false,
  consignee_type_government: false,
  consignee_type_direct_consumer: false,
  consignee_type_other_unknown: false,
  consignee_type_reseller: true,
  hazardous_material_yes: false,
  hazardous_material_no: true,
  tib_carnet_yes: false,
  tib_carnet_no: false,
  insurance_yes: false,
  insurance_no: false,
  payment_prepaid: false,
  payment_collect: false,
  deliver_to: false,
  checkbox_39: false,
  checkbox_40: true,
  checkbox_48: true,
};

/** Legacy names the standalone form used to write → canonical PDF keys. */
const LEGACY_KEY_MAP: Record<string, keyof SLICheckboxStates> = {
  deliver_to_checkbox: 'deliver_to',
  declaration_statement_checkbox: 'checkbox_40',
  signature_checkbox: 'checkbox_48',
};

/**
 * Merge a stored checkbox_states blob (canonical and/or legacy keys, possibly
 * partial) onto the defaults. Unknown keys are dropped.
 */
export function normalizeSLICheckboxStates(
  raw: Record<string, unknown> | null | undefined
): SLICheckboxStates {
  const result: SLICheckboxStates = { ...DEFAULT_SLI_CHECKBOXES };
  if (!raw || typeof raw !== 'object') return result;

  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== 'boolean') continue;
    const canonical =
      key in result ? (key as keyof SLICheckboxStates) : LEGACY_KEY_MAP[key];
    if (canonical) result[canonical] = value;
  }
  return result;
}
