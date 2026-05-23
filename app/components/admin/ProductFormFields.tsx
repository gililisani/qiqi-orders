'use client';

/**
 * Shared product-form body used by both /admin/products/new and
 * /admin/products/[id]/edit. Renders the 4-card grid (image, basics, pricing,
 * settings, packing) — no page chrome (the parent page owns header,
 * back link, and submit buttons).
 */

import ImageUpload from '../ImageUpload';
import { Card, CardContent, CardHeader, CardTitle } from '../qq/card';
import { Input } from '../qq/input';
import { Label } from '../qq/label';
import { FormField } from '../qq/form-field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../qq/select';

export interface ProductFormData {
  item_name: string;
  netsuite_name: string;
  sku: string;
  upc: string;
  size: string;
  case_pack: string;
  price_international: string;
  price_americas: string;
  enable: boolean;
  list_in_support_funds: boolean;
  visible_to_americas: boolean;
  visible_to_international: boolean;
  qualifies_for_credit_earning: boolean;
  out_of_stock: boolean;
  picture_url: string;
  case_weight: string;
  hs_code: string;
  made_in: string;
  category_id: string;
}

export interface CategoryOption {
  id: number;
  name: string;
}

const NONE = '__none__';

interface ProductFormFieldsProps {
  formData: ProductFormData;
  onChange: (patch: Partial<ProductFormData>) => void;
  categories: CategoryOption[];
}

export function ProductFormFields({ formData, onChange, categories }: ProductFormFieldsProps) {
  const setStr = (key: keyof ProductFormData) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ [key]: e.target.value } as Partial<ProductFormData>);

  const setBool = (key: keyof ProductFormData) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ [key]: e.target.checked } as Partial<ProductFormData>);

  return (
    <div className="space-y-6">
      {/* Top row: Image | (Basic + Pricing) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        {/* Image */}
        <Card className="flex flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Product image</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col">
            <ImageUpload
              onImageUploaded={(url) => onChange({ picture_url: url })}
              currentImageUrl={formData.picture_url}
              hideTitle={true}
              largerImage={true}
            />
          </CardContent>
        </Card>

        {/* Basic + Pricing stacked */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Basic information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField label="Item name" required>
                  <Input value={formData.item_name} onChange={setStr('item_name')} required />
                </FormField>
                <FormField label="NetSuite name">
                  <Input value={formData.netsuite_name} onChange={setStr('netsuite_name')} />
                </FormField>
                <FormField label="SKU" required>
                  <Input value={formData.sku} onChange={setStr('sku')} required />
                </FormField>
                <FormField label="UPC">
                  <Input value={formData.upc} onChange={setStr('upc')} />
                </FormField>
                <FormField label="Size">
                  <Input value={formData.size} onChange={setStr('size')} />
                </FormField>
                <FormField label="Case pack">
                  <Input type="number" value={formData.case_pack} onChange={setStr('case_pack')} />
                </FormField>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Pricing</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField label="Americas price (USD)" required>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.price_americas}
                    onChange={setStr('price_americas')}
                    required
                  />
                </FormField>
                <FormField label="International price (USD)" required>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.price_international}
                    onChange={setStr('price_international')}
                    required
                  />
                </FormField>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Bottom row: Settings | Packing */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Settings */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Product settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-3">
              <CheckboxRow
                checked={formData.enable}
                onChange={setBool('enable')}
                label="Enable product"
              />
              <CheckboxRow
                checked={formData.list_in_support_funds}
                onChange={setBool('list_in_support_funds')}
                label="Eligible for support funds"
              />
              <CheckboxRow
                checked={formData.qualifies_for_credit_earning}
                onChange={setBool('qualifies_for_credit_earning')}
                label="Qualifies for credit earning"
              />
              <CheckboxRow
                checked={formData.out_of_stock}
                onChange={setBool('out_of_stock')}
                label="Out of stock"
              />
            </div>

            <div className="bg-muted/50 border border-border rounded-md p-3 text-xs text-muted-foreground space-y-1.5">
              <p className="font-medium text-foreground">Support fund settings explained</p>
              <p>
                <span className="font-medium">Eligible for support funds:</span> Can this product be
                purchased <em>with</em> support fund credit?
              </p>
              <p>
                <span className="font-medium">Qualifies for credit earning:</span> Does purchasing
                this product <em>earn</em> support fund credit?
              </p>
              <p>
                Kits, discounted items, and promotional items typically should NOT qualify for
                credit earning.
              </p>
            </div>

            <div className="pt-2 border-t border-border space-y-3">
              <p className="text-sm font-medium">Client class visibility</p>
              <CheckboxRow
                checked={formData.visible_to_americas}
                onChange={setBool('visible_to_americas')}
                label="Visible to Americas clients"
              />
              <CheckboxRow
                checked={formData.visible_to_international}
                onChange={setBool('visible_to_international')}
                label="Visible to International clients"
              />
            </div>
          </CardContent>
        </Card>

        {/* Packing */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Packing list information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField label="Case weight (kg)">
              <Input
                type="number"
                step="0.01"
                value={formData.case_weight}
                onChange={setStr('case_weight')}
                placeholder="e.g. 12.50"
              />
            </FormField>
            <FormField label="HS code">
              <Input
                value={formData.hs_code}
                onChange={setStr('hs_code')}
                placeholder="e.g. 3305.10.00"
              />
            </FormField>
            <FormField label="Made in">
              <Input
                value={formData.made_in}
                onChange={setStr('made_in')}
                placeholder="e.g. USA, China, Italy"
              />
            </FormField>
            <div>
              <Label className="text-sm font-medium">Category</Label>
              <div className="mt-1.5">
                <Select
                  value={formData.category_id || undefined}
                  onValueChange={(v) => onChange({ category_id: v === NONE ? '' : v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>— No category —</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id.toString()}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">
                Assign this product to a category for better organization.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function CheckboxRow({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
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
