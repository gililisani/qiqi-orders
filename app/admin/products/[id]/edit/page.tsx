'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { supabase } from '../../../../../lib/supabaseClient';
import { PageHeader } from '../../../../components/qq/page-header';
import { Button } from '../../../../components/qq/button';
import { Alert, AlertDescription } from '../../../../components/qq/alert';
import { useToast } from '../../../../components/ui/ToastProvider';
import {
  ProductFormFields,
  type ProductFormData,
  type CategoryOption,
} from '../../../../components/admin/ProductFormFields';

const EMPTY_FORM: ProductFormData = {
  item_name: '',
  netsuite_name: '',
  sku: '',
  upc: '',
  size: '',
  case_pack: '',
  price_international: '',
  price_americas: '',
  enable: true,
  list_in_support_funds: true,
  visible_to_americas: true,
  visible_to_international: true,
  qualifies_for_credit_earning: true,
  out_of_stock: false,
  picture_url: '',
  case_weight: '',
  hs_code: '',
  made_in: '',
  category_id: '',
};

export default function EditProductPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [formData, setFormData] = useState<ProductFormData>(EMPTY_FORM);

  useEffect(() => {
    (async () => {
      try {
        const [productRes, categoriesRes] = await Promise.all([
          supabase.from('Products').select('*').eq('id', params.id).single(),
          supabase.from('categories').select('id, name').order('sort_order', { ascending: true }),
        ]);
        if (productRes.error) throw productRes.error;
        const d = productRes.data;
        setFormData({
          item_name: d.item_name || '',
          netsuite_name: d.netsuite_name || '',
          sku: d.sku || '',
          upc: d.upc || '',
          size: d.size || '',
          case_pack: d.case_pack?.toString() || '',
          price_international: d.price_international?.toString() || '',
          price_americas: d.price_americas?.toString() || '',
          enable: d.enable ?? true,
          list_in_support_funds: d.list_in_support_funds ?? true,
          visible_to_americas: d.visible_to_americas ?? true,
          visible_to_international: d.visible_to_international ?? true,
          qualifies_for_credit_earning: d.qualifies_for_credit_earning ?? true,
          out_of_stock: d.out_of_stock ?? false,
          picture_url: d.picture_url || '',
          case_weight: d.case_weight?.toString() || '',
          hs_code: d.hs_code || '',
          made_in: d.made_in || '',
          category_id: d.category_id?.toString() || '',
        });
        setCategories(categoriesRes.data || []);
      } catch (err: any) {
        setError(err.message || 'Failed to load product.');
      } finally {
        setLoading(false);
      }
    })();
  }, [params.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const { error: updateError } = await supabase
        .from('Products')
        .update({
          item_name: formData.item_name,
          netsuite_name: formData.netsuite_name || null,
          sku: formData.sku,
          upc: formData.upc || null,
          size: formData.size || null,
          case_pack: formData.case_pack ? parseInt(formData.case_pack) : null,
          price_international: parseFloat(formData.price_international),
          price_americas: parseFloat(formData.price_americas),
          enable: formData.enable,
          list_in_support_funds: formData.list_in_support_funds,
          visible_to_americas: formData.visible_to_americas,
          visible_to_international: formData.visible_to_international,
          qualifies_for_credit_earning: formData.qualifies_for_credit_earning,
          out_of_stock: formData.out_of_stock,
          picture_url: formData.picture_url || null,
          case_weight: formData.case_weight ? parseFloat(formData.case_weight) : null,
          hs_code: formData.hs_code || null,
          made_in: formData.made_in || null,
          category_id: formData.category_id || null,
        })
        .eq('id', params.id);
      if (updateError) throw updateError;
      toast.success('Product updated.');
      router.push(`/admin/products/${params.id}`);
    } catch (err: any) {
      setError(err.message || 'Failed to update product.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="px-6 py-8">
        <p className="text-sm text-muted-foreground">Loading product…</p>
      </div>
    );
  }

  return (
    <div className="px-6 py-8 space-y-6">
      <div>
        <Link
          href={`/admin/products/${params.id}`}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to product
        </Link>
      </div>

      <PageHeader
        title="Edit product"
        description={formData.item_name || undefined}
      />

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        <ProductFormFields
          formData={formData}
          onChange={(patch) => setFormData((p) => ({ ...p, ...patch }))}
          categories={categories}
        />

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(`/admin/products/${params.id}`)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            Save changes
          </Button>
        </div>
      </form>
    </div>
  );
}
