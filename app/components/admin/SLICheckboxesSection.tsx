'use client';

/**
 * SLI checkbox groups — the single UI for SLI checkbox_states, used by the
 * standalone SLI form (SLIFormFields) and the order-SLI modal (CreateSLIModal).
 * Keys and box numbers follow the PDF renderer (lib/pdf/components/SLIDocument);
 * see lib/sli/checkboxStates.ts for the canonical key set.
 */

import type { SLICheckboxStates } from '../../../lib/sli/checkboxStates';

interface SLICheckboxesSectionProps {
  checkboxes: SLICheckboxStates;
  onChangeCheckbox: (key: keyof SLICheckboxStates) => void;
}

export function SLICheckboxesSection({
  checkboxes,
  onChangeCheckbox,
}: SLICheckboxesSectionProps) {
  const row = (key: keyof SLICheckboxStates, label: string) => (
    <CheckRow
      checked={checkboxes[key]}
      onChange={() => onChangeCheckbox(key)}
      label={label}
    />
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <CheckGroup title="Box 8: Related party indicator">
        {row('related_party_related', 'Related')}
        {row('related_party_non_related', 'Non-related')}
      </CheckGroup>

      <CheckGroup title="Box 10: Routed export transaction">
        {row('routed_export_yes', 'Yes')}
        {row('routed_export_no', 'No')}
      </CheckGroup>

      <CheckGroup title="Box 12: Type of consignee">
        {row('consignee_type_government', 'Government')}
        {row('consignee_type_direct_consumer', 'Direct consumer')}
        {row('consignee_type_other_unknown', 'Other / unknown')}
        {row('consignee_type_reseller', 'Re-seller')}
      </CheckGroup>

      <CheckGroup title="Box 16: Hazardous material">
        {row('hazardous_material_yes', 'Yes')}
        {row('hazardous_material_no', 'No')}
      </CheckGroup>

      <CheckGroup title="Box 20: TIB / carnet">
        {row('tib_carnet_yes', 'Yes')}
        {row('tib_carnet_no', 'No')}
      </CheckGroup>

      <CheckGroup title="Box 21: Shipper requests insurance">
        {row('insurance_yes', 'Yes')}
        {row('insurance_no', 'No')}
      </CheckGroup>

      <CheckGroup title="Box 23: Freight charges">
        {row('payment_prepaid', 'Prepaid')}
        {row('payment_collect', 'Collect')}
      </CheckGroup>

      <CheckGroup title="Other checkboxes">
        {row('deliver_to', 'Box 24: Deliver to')}
        {row('checkbox_39', 'Box 39: Non-licensable ≤ $2,500, no AES filing')}
        {row('checkbox_40', 'Box 40: Authorize forwarder as agent (EEI)')}
        {row('checkbox_48', 'Box 48: Validate electronic signature')}
      </CheckGroup>
    </div>
  );
}

function CheckGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-sm font-medium mb-2">{title}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function CheckRow({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-4 w-4 accent-foreground"
      />
      <span className="text-sm">{label}</span>
    </label>
  );
}
