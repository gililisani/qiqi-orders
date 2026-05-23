'use client';

/**
 * Shared SLI form body used by both /admin/sli/create and
 * /admin/sli/[id]/edit. Renders the 6 cards (Consignee, Invoice & Dates,
 * Forwarding Agent, Additional, Products, Checkboxes) plus the two
 * autocomplete dropdowns. The parent page owns chrome, fetch, and submit.
 */

import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '../qq/card';
import { Input } from '../qq/input';
import { Label } from '../qq/label';
import { Button } from '../qq/button';
import { FormField } from '../qq/form-field';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../qq/table';

export interface SLICompany {
  id: string;
  company_name: string;
  ship_to_street_line_1?: string;
  ship_to_street_line_2?: string;
  ship_to_city?: string;
  ship_to_state?: string;
  ship_to_postal_code?: string;
  ship_to_country?: string;
  company_address?: string;
}

export interface SLIProduct {
  id: string;
  item_name: string;
  hs_code?: string;
  case_weight?: number;
  made_in?: string;
}

export interface SLISelectedProduct {
  product_id: string;
  product_name: string;
  hs_code: string;
  quantity: number;
  made_in?: string;
}

export interface SLIFormData {
  consignee_name: string;
  consignee_address_line1: string;
  consignee_address_line2: string;
  consignee_address_line3: string;
  consignee_country: string;
  invoice_number: string;
  sli_date: string;
  date_of_export: string;
  forwarding_agent_line1: string;
  forwarding_agent_line2: string;
  forwarding_agent_line3: string;
  forwarding_agent_line4: string;
  in_bond_code: string;
  instructions_to_forwarder: string;
}

export interface SLICheckboxStates {
  related_party_related: boolean;
  related_party_non_related: boolean;
  routed_export_yes: boolean;
  routed_export_no: boolean;
  consignee_type_government: boolean;
  consignee_type_direct_consumer: boolean;
  consignee_type_other_unknown: boolean;
  consignee_type_reseller: boolean;
  hazardous_material_yes: boolean;
  hazardous_material_no: boolean;
  tib_carnet_yes: boolean;
  tib_carnet_no: boolean;
  deliver_to_checkbox: boolean;
  declaration_statement_checkbox: boolean;
  signature_checkbox: boolean;
}

export const DEFAULT_SLI_FORM: SLIFormData = {
  consignee_name: '',
  consignee_address_line1: '',
  consignee_address_line2: '',
  consignee_address_line3: '',
  consignee_country: '',
  invoice_number: '',
  sli_date: new Date().toISOString().split('T')[0],
  date_of_export: '',
  forwarding_agent_line1: '',
  forwarding_agent_line2: '',
  forwarding_agent_line3: '',
  forwarding_agent_line4: '',
  in_bond_code: '',
  instructions_to_forwarder: '',
};

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
  deliver_to_checkbox: false,
  declaration_statement_checkbox: true,
  signature_checkbox: true,
};

interface SLIFormFieldsProps {
  formData: SLIFormData;
  onChangeForm: (patch: Partial<SLIFormData>) => void;
  checkboxes: SLICheckboxStates;
  onChangeCheckbox: (key: keyof SLICheckboxStates) => void;
  companies: SLICompany[];
  products: SLIProduct[];
  selectedProducts: SLISelectedProduct[];
  onChangeSelectedProducts: (next: SLISelectedProduct[]) => void;
  selectedCompanyId: string;
  onChangeSelectedCompanyId: (id: string) => void;
  /** Initial value for the company search input — passed by edit-page to seed the field. */
  initialCompanySearch?: string;
  onProductAddError?: (msg: string) => void;
}

export function SLIFormFields({
  formData,
  onChangeForm,
  checkboxes,
  onChangeCheckbox,
  companies,
  products,
  selectedProducts,
  onChangeSelectedProducts,
  selectedCompanyId,
  onChangeSelectedCompanyId,
  initialCompanySearch = '',
  onProductAddError,
}: SLIFormFieldsProps) {
  const [companySearch, setCompanySearch] = useState(initialCompanySearch);
  const [showCompanyDropdown, setShowCompanyDropdown] = useState(false);
  const companyRef = useRef<HTMLDivElement>(null);

  const [productSearch, setProductSearch] = useState('');
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [currentProductId, setCurrentProductId] = useState('');
  const [currentQuantity, setCurrentQuantity] = useState(1);
  const productRef = useRef<HTMLDivElement>(null);

  // Seed company search input when initial value changes (edit page hydration).
  useEffect(() => {
    if (initialCompanySearch) setCompanySearch(initialCompanySearch);
  }, [initialCompanySearch]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (companyRef.current && !companyRef.current.contains(e.target as Node)) {
        setShowCompanyDropdown(false);
      }
      if (productRef.current && !productRef.current.contains(e.target as Node)) {
        setShowProductDropdown(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const setStr =
    (key: keyof SLIFormData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChangeForm({ [key]: e.target.value } as Partial<SLIFormData>);

  const handleCompanySelect = (company: SLICompany) => {
    onChangeSelectedCompanyId(company.id);
    setCompanySearch(company.company_name);
    setShowCompanyDropdown(false);
    const addr2 =
      company.ship_to_city && company.ship_to_state
        ? `${company.ship_to_city}, ${company.ship_to_state} ${company.ship_to_postal_code || ''}`.trim()
        : company.company_address?.split('\n')[2] || '';
    onChangeForm({
      consignee_name: company.company_name,
      consignee_address_line1:
        company.ship_to_street_line_1 || company.company_address?.split('\n')[0] || '',
      consignee_address_line2:
        company.ship_to_street_line_2 || company.company_address?.split('\n')[1] || '',
      consignee_address_line3: addr2,
      consignee_country: company.ship_to_country || '',
    });
  };

  const handleProductSelect = (product: SLIProduct) => {
    setCurrentProductId(product.id);
    setProductSearch(product.item_name);
    setShowProductDropdown(false);
  };

  const addSelectedProduct = () => {
    if (!currentProductId || currentQuantity <= 0) return;
    const product = products.find((p) => p.id === currentProductId);
    if (!product) return;
    if (selectedProducts.find((sp) => sp.product_id === currentProductId)) {
      onProductAddError?.('Product already added. Update quantity or remove and re-add.');
      return;
    }
    onChangeSelectedProducts([
      ...selectedProducts,
      {
        product_id: product.id,
        product_name: product.item_name,
        hs_code: product.hs_code || 'N/A',
        quantity: currentQuantity,
        made_in: product.made_in,
      },
    ]);
    setCurrentProductId('');
    setProductSearch('');
    setCurrentQuantity(1);
  };

  const removeSelectedProduct = (productId: string) =>
    onChangeSelectedProducts(selectedProducts.filter((sp) => sp.product_id !== productId));

  const updateProductQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) return;
    onChangeSelectedProducts(
      selectedProducts.map((sp) => (sp.product_id === productId ? { ...sp, quantity } : sp))
    );
  };

  const filteredCompanies = companies.filter((c) =>
    c.company_name.toLowerCase().includes(companySearch.toLowerCase())
  );
  const filteredProducts = products.filter((p) =>
    p.item_name.toLowerCase().includes(productSearch.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Consignee */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Consignee information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2 relative" ref={companyRef}>
              <Label className="text-sm font-medium">
                Consignee name (company) <span className="text-destructive">*</span>
              </Label>
              <div className="mt-1.5">
                <Input
                  value={companySearch}
                  onChange={(e) => {
                    setCompanySearch(e.target.value);
                    setShowCompanyDropdown(true);
                  }}
                  onFocus={() => setShowCompanyDropdown(true)}
                  placeholder="Search or select a company…"
                  required
                />
              </div>
              {showCompanyDropdown && filteredCompanies.length > 0 && (
                <ul className="absolute z-10 mt-1 w-full max-h-60 overflow-auto border border-border bg-background rounded-md shadow-md">
                  {filteredCompanies.map((c) => (
                    <li
                      key={c.id}
                      onClick={() => handleCompanySelect(c)}
                      className="px-3 py-2 text-sm cursor-pointer hover:bg-muted"
                    >
                      {c.company_name}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="md:col-span-2">
              <FormField label="Address line 1" required>
                <Input
                  value={formData.consignee_address_line1}
                  onChange={setStr('consignee_address_line1')}
                  required
                />
              </FormField>
            </div>
            <FormField label="Address line 2">
              <Input
                value={formData.consignee_address_line2}
                onChange={setStr('consignee_address_line2')}
              />
            </FormField>
            <FormField label="Address line 3">
              <Input
                value={formData.consignee_address_line3}
                onChange={setStr('consignee_address_line3')}
              />
            </FormField>
            <div className="md:col-span-2">
              <FormField label="Country" required>
                <Input
                  value={formData.consignee_country}
                  onChange={setStr('consignee_country')}
                  required
                />
              </FormField>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Invoice & Dates */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Invoice & export information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FormField label="Invoice number" required>
              <Input value={formData.invoice_number} onChange={setStr('invoice_number')} required />
            </FormField>
            <FormField label="SLI date" required>
              <Input
                type="date"
                value={formData.sli_date}
                onChange={setStr('sli_date')}
                required
              />
            </FormField>
            <FormField label="Date of export">
              <Input
                type="date"
                value={formData.date_of_export}
                onChange={setStr('date_of_export')}
              />
            </FormField>
          </div>
        </CardContent>
      </Card>

      {/* Forwarding Agent */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Forwarding agent</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Line 1">
              <Input
                value={formData.forwarding_agent_line1}
                onChange={setStr('forwarding_agent_line1')}
              />
            </FormField>
            <FormField label="Line 2">
              <Input
                value={formData.forwarding_agent_line2}
                onChange={setStr('forwarding_agent_line2')}
              />
            </FormField>
            <FormField label="Line 3">
              <Input
                value={formData.forwarding_agent_line3}
                onChange={setStr('forwarding_agent_line3')}
              />
            </FormField>
            <FormField label="Line 4">
              <Input
                value={formData.forwarding_agent_line4}
                onChange={setStr('forwarding_agent_line4')}
              />
            </FormField>
          </div>
        </CardContent>
      </Card>

      {/* Additional */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Additional information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="In-bond code">
              <Input value={formData.in_bond_code} onChange={setStr('in_bond_code')} />
            </FormField>
            <FormField label="Instructions to forwarder">
              <textarea
                value={formData.instructions_to_forwarder}
                onChange={setStr('instructions_to_forwarder')}
                rows={3}
                className="w-full px-3 py-2 text-sm border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
              />
            </FormField>
          </div>
        </CardContent>
      </Card>

      {/* Products */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Products</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 items-end">
            <div className="flex-1 relative w-full" ref={productRef}>
              <Label className="text-sm font-medium">Select product</Label>
              <div className="mt-1.5">
                <Input
                  value={productSearch}
                  onChange={(e) => {
                    setProductSearch(e.target.value);
                    setShowProductDropdown(true);
                  }}
                  onFocus={() => setShowProductDropdown(true)}
                  placeholder="Search and select a product…"
                />
              </div>
              {showProductDropdown && filteredProducts.length > 0 && (
                <ul className="absolute z-10 mt-1 w-full max-h-60 overflow-auto border border-border bg-background rounded-md shadow-md">
                  {filteredProducts.map((p) => (
                    <li
                      key={p.id}
                      onClick={() => handleProductSelect(p)}
                      className="px-3 py-2 text-sm cursor-pointer hover:bg-muted"
                    >
                      {p.item_name}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="w-full sm:w-28">
              <Label className="text-sm font-medium">Quantity</Label>
              <div className="mt-1.5">
                <Input
                  type="number"
                  min={1}
                  value={currentQuantity}
                  onChange={(e) => setCurrentQuantity(parseInt(e.target.value) || 1)}
                />
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={addSelectedProduct}
              disabled={!currentProductId || currentQuantity <= 0}
            >
              <Plus className="h-4 w-4" /> Add
            </Button>
          </div>

          {selectedProducts.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="hidden sm:table-cell">HS code</TableHead>
                  <TableHead className="w-28">Quantity</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {selectedProducts.map((sp) => (
                  <TableRow key={sp.product_id}>
                    <TableCell className="text-sm font-medium">{sp.product_name}</TableCell>
                    <TableCell className="hidden sm:table-cell font-mono text-xs">
                      {sp.hs_code}
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={1}
                        value={sp.quantity}
                        onChange={(e) =>
                          updateProductQuantity(sp.product_id, parseInt(e.target.value) || 1)
                        }
                        className="h-8"
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeSelectedProduct(sp.product_id)}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        aria-label="Remove product"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">No products added yet.</p>
          )}
        </CardContent>
      </Card>

      {/* Checkboxes */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Checkbox options</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <CheckGroup title="Box 8: Related party indicator">
              <CheckRow
                checked={checkboxes.related_party_related}
                onChange={() => onChangeCheckbox('related_party_related')}
                label="Related"
              />
              <CheckRow
                checked={checkboxes.related_party_non_related}
                onChange={() => onChangeCheckbox('related_party_non_related')}
                label="Non-related"
              />
            </CheckGroup>

            <CheckGroup title="Box 10: Routed export transaction">
              <CheckRow
                checked={checkboxes.routed_export_yes}
                onChange={() => onChangeCheckbox('routed_export_yes')}
                label="Yes"
              />
              <CheckRow
                checked={checkboxes.routed_export_no}
                onChange={() => onChangeCheckbox('routed_export_no')}
                label="No"
              />
            </CheckGroup>

            <CheckGroup title="Box 12: Type of consignee">
              <CheckRow
                checked={checkboxes.consignee_type_government}
                onChange={() => onChangeCheckbox('consignee_type_government')}
                label="Government"
              />
              <CheckRow
                checked={checkboxes.consignee_type_direct_consumer}
                onChange={() => onChangeCheckbox('consignee_type_direct_consumer')}
                label="Direct consumer"
              />
              <CheckRow
                checked={checkboxes.consignee_type_other_unknown}
                onChange={() => onChangeCheckbox('consignee_type_other_unknown')}
                label="Other / unknown"
              />
              <CheckRow
                checked={checkboxes.consignee_type_reseller}
                onChange={() => onChangeCheckbox('consignee_type_reseller')}
                label="Re-seller"
              />
            </CheckGroup>

            <CheckGroup title="Box 16: Hazardous material">
              <CheckRow
                checked={checkboxes.hazardous_material_yes}
                onChange={() => onChangeCheckbox('hazardous_material_yes')}
                label="Yes"
              />
              <CheckRow
                checked={checkboxes.hazardous_material_no}
                onChange={() => onChangeCheckbox('hazardous_material_no')}
                label="No"
              />
            </CheckGroup>

            <CheckGroup title="Box 21: TIB / carnet">
              <CheckRow
                checked={checkboxes.tib_carnet_yes}
                onChange={() => onChangeCheckbox('tib_carnet_yes')}
                label="Yes"
              />
              <CheckRow
                checked={checkboxes.tib_carnet_no}
                onChange={() => onChangeCheckbox('tib_carnet_no')}
                label="No"
              />
            </CheckGroup>

            <CheckGroup title="Other checkboxes">
              <CheckRow
                checked={checkboxes.deliver_to_checkbox}
                onChange={() => onChangeCheckbox('deliver_to_checkbox')}
                label="Box 24: Deliver to"
              />
              <CheckRow
                checked={checkboxes.declaration_statement_checkbox}
                onChange={() => onChangeCheckbox('declaration_statement_checkbox')}
                label="Box 40: Declaration statement"
              />
              <CheckRow
                checked={checkboxes.signature_checkbox}
                onChange={() => onChangeCheckbox('signature_checkbox')}
                label="Box 48: Signature"
              />
            </CheckGroup>
          </div>
        </CardContent>
      </Card>
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
