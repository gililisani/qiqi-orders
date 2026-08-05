'use client';

/**
 * Shared announcement form (new + edit). Every announcement has a validity
 * window — the homepage can only ever show current content.
 */

import { useEffect, useState } from 'react';

import { supabase } from '../../../lib/supabaseClient';
import { FormField } from '../qq/form-field';
import { Input } from '../qq/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../qq/select';

export const ANNOUNCEMENT_TYPES = [
  { value: 'coming_soon', label: 'Coming soon (teaser)' },
  { value: 'launch', label: 'New product launch' },
  { value: 'back_in_stock', label: 'Back in stock' },
  { value: 'offer', label: 'Offer / promotion' },
  { value: 'news', label: 'General news' },
] as const;

export interface AnnouncementFormData {
  title: string;
  body: string;
  type: string;
  product_id: string; // '' = none
  image_url: string;
  starts_at: string;
  ends_at: string;
  enabled: boolean;
}

export const EMPTY_ANNOUNCEMENT: AnnouncementFormData = {
  title: '',
  body: '',
  type: 'news',
  product_id: '',
  image_url: '',
  starts_at: new Date().toISOString().slice(0, 10),
  ends_at: '',
  enabled: true,
};

interface ProductOption {
  id: number;
  item_name: string | null;
  sku: string | null;
}

export function AnnouncementForm({
  value,
  onChange,
  disabled,
}: {
  value: AnnouncementFormData;
  onChange: (patch: Partial<AnnouncementFormData>) => void;
  disabled?: boolean;
}) {
  const [products, setProducts] = useState<ProductOption[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('Products')
        .select('id, item_name, sku')
        .order('item_name');
      setProducts((data as ProductOption[]) || []);
    })();
  }, []);

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField label="Title" required>
          <Input
            value={value.title}
            onChange={(e) => onChange({ title: e.target.value })}
            disabled={disabled}
            required
            autoFocus
            placeholder="e.g. Something new is coming…"
          />
        </FormField>
        <FormField label="Type" required>
          <Select value={value.type} onValueChange={(v) => onChange({ type: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ANNOUNCEMENT_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      </div>

      <FormField
        label="Message"
        helper="Shown under the title on the partner homepage. Keep it short."
      >
        <textarea
          value={value.body}
          onChange={(e) => onChange({ body: e.target.value })}
          disabled={disabled}
          rows={3}
          className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 disabled:opacity-50"
        />
      </FormField>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField
          label="Linked product"
          helper="Optional. Its image is used when no image URL is set."
        >
          <Select
            value={value.product_id || 'none'}
            onValueChange={(v) => onChange({ product_id: v === 'none' ? '' : v })}
          >
            <SelectTrigger>
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {products.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>
                  {p.item_name || p.sku || `#${p.id}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="Image URL" helper="Optional override.">
          <Input
            value={value.image_url}
            onChange={(e) => onChange({ image_url: e.target.value })}
            disabled={disabled}
            placeholder="https://…"
          />
        </FormField>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField label="Visible from" required>
          <Input
            type="date"
            value={value.starts_at}
            onChange={(e) => onChange({ starts_at: e.target.value })}
            disabled={disabled}
            required
          />
        </FormField>
        <FormField
          label="Visible until"
          required
          helper="It disappears from the homepage after this date — nothing stale, ever."
        >
          <Input
            type="date"
            value={value.ends_at}
            onChange={(e) => onChange({ ends_at: e.target.value })}
            disabled={disabled}
            required
          />
        </FormField>
      </div>

      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={value.enabled}
          onChange={(e) => onChange({ enabled: e.target.checked })}
          disabled={disabled}
          className="h-4 w-4 accent-foreground"
        />
        <span className="text-sm">Enabled</span>
      </label>
    </>
  );
}
