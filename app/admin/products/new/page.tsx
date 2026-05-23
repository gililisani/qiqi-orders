'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { supabase } from '../../../../lib/supabaseClient';
import { PageHeader } from '../../../components/qq/page-header';
import { Button } from '../../../components/qq/button';
import { Alert, AlertDescription } from '../../../components/qq/alert';
import { useToast } from '../../../components/ui/ToastProvider';
import {
  ProductFormFields,
  type ProductFormData,
  type CategoryOption,
} from '../../../components/admin/ProductFormFields';

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

export default function NewProductPage() {
  const router = useRouter();
  const toast = useToast();

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [formData, setFormData] = useState<ProductFormData>(EMPTY_FORM);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('categories')
        .select('id, name')
        .order('sort_order', { ascending: true });
      setCategories(data || []);
    })();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const { error: insertError } = await supabase.from('Products').insert([
        {
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
        },
      ]);
      if (insertError) throw insertError;
      toast.success('Product created.');
      router.push('/admin/products');
    } catch (err: any) {
      setError(err.message || 'Failed to create product.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="px-6 py-8 space-y-6">
      <div>
        <Link
          href="/admin/products"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to products
        </Link>
      </div>

      <PageHeader
        title="New product"
        description="Add a new product to the catalog."
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
            onClick={() => router.push('/admin/products')}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            Create product
          </Button>
        </div>
      </form>
    </div>
  );
}
