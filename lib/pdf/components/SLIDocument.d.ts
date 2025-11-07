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
}

export const SLIDocument: React.FC<{ data: SLIDocumentData }>;

