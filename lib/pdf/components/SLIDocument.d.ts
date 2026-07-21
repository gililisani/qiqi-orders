export interface SLIProduct {
  hs_code: string;
  quantity: number;
  weight: number;
  value: number;
  made_in: string;
}

export interface SLIDocumentData {
  sli_number?: string | number;
  invoice_number?: string;
  consignee_name?: string;
  consignee_address_line1?: string;
  consignee_address_line2?: string;
  consignee_address_line3?: string;
  consignee_country?: string;
  forwarding_agent_line1?: string;
  forwarding_agent_line2?: string;
  forwarding_agent_line3?: string;
  forwarding_agent_line4?: string;
  in_bond_code?: string;
  instructions_to_forwarder?: string;
  sli_date?: string;
  date_of_export?: string;
  products?: SLIProduct[];
  checkbox_states?: Record<string, boolean>;
  // Config (sli_config) — USPPI block, freight location, state of origin.
  usppi_name?: string;
  usppi_address_line1?: string;
  usppi_address_line2?: string;
  usppi_country?: string;
  usppi_ein?: string;
  freight_location_name?: string;
  freight_location_address_line1?: string;
  freight_location_address_line2?: string;
  freight_location_country?: string;
  state_of_origin?: string;
  // Signer (sli_signers) — boxes 42-46.
  usppi_email?: string;
  usppi_phone?: string;
  printed_name?: string;
  signer_title?: string;
  signature_url?: string;
}

export const SLIDocument: React.FC<{ data: SLIDocumentData }>;

