'use client';

/**
 * Shared category-form body used by both /admin/categories/new and
 * /admin/categories/[id]/edit. The parent page owns chrome, fetch,
 * and submit.
 */

import CategoryImageUpload from '../CategoryImageUpload';
import { Input } from '../qq/input';
import { FormField } from '../qq/form-field';
import { Separator } from '../qq/separator';

export interface CategoryFormData {
  name: string;
  description: string;
  sort_order: string;
  visible_to_americas: boolean;
  visible_to_international: boolean;
  image_url: string;
}

export const EMPTY_CATEGORY_FORM: CategoryFormData = {
  name: '',
  description: '',
  sort_order: '',
  visible_to_americas: true,
  visible_to_international: true,
  image_url: '',
};

interface CategoryFormFieldsProps {
  formData: CategoryFormData;
  onChange: (patch: Partial<CategoryFormData>) => void;
}

export function CategoryFormFields({ formData, onChange }: CategoryFormFieldsProps) {
  return (
    <div className="space-y-5">
      <FormField label="Category name" required>
        <Input
          value={formData.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="e.g. ProCtrl, SelfCtrl, KITS"
          required
        />
      </FormField>

      <FormField label="Description">
        <textarea
          value={formData.description}
          onChange={(e) => onChange({ description: e.target.value })}
          rows={3}
          placeholder="Optional description of this category"
          className="w-full px-3 py-2 text-sm border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
        />
      </FormField>

      <FormField label="Sort order" helper="Lower numbers appear first (0 = first position).">
        <Input
          type="number"
          value={formData.sort_order}
          onChange={(e) => onChange({ sort_order: e.target.value })}
          placeholder="0"
        />
      </FormField>

      <div>
        <CategoryImageUpload
          onImageUploaded={(url) => onChange({ image_url: url })}
          currentImageUrl={formData.image_url}
        />
      </div>

      <Separator />

      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Visibility
        </h3>
        <p className="text-sm text-muted-foreground mb-3">
          Control which client classes can see this category.
        </p>
        <div className="space-y-2">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={formData.visible_to_americas}
              onChange={(e) => onChange({ visible_to_americas: e.target.checked })}
              className="h-4 w-4 accent-foreground"
            />
            <span className="text-sm">Visible to Americas clients</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={formData.visible_to_international}
              onChange={(e) => onChange({ visible_to_international: e.target.checked })}
              className="h-4 w-4 accent-foreground"
            />
            <span className="text-sm">Visible to International clients</span>
          </label>
        </div>
      </div>
    </div>
  );
}
