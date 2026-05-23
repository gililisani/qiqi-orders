'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Edit } from 'lucide-react';

import { supabase } from '../../../../lib/supabaseClient';
import { PageHeader } from '../../../components/qq/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/qq/card';
import { Button } from '../../../components/qq/button';
import { Badge } from '../../../components/qq/badge';
import { Alert, AlertDescription } from '../../../components/qq/alert';

interface Product {
  id: number;
  item_name: string;
  sku: string;
  price_international: number;
  price_americas: number;
  enable: boolean;
  list_in_support_funds: boolean;
  visible_to_americas: boolean;
  visible_to_international: boolean;
  qualifies_for_credit_earning: boolean;
  out_of_stock: boolean;
  picture_url?: string;
  netsuite_name?: string;
  upc?: string;
  size?: string;
  case_pack?: number;
  case_weight?: number;
  hs_code?: string;
  made_in?: string;
  category_id?: number;
  created_at: string;
}

export default function ProductViewPage({ params }: { params: { id: string } }) {
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from('Products')
          .select('*')
          .eq('id', params.id)
          .single();
        if (error) throw error;
        setProduct(data);
      } catch (err: any) {
        setError(err.message || 'Failed to load product.');
      } finally {
        setLoading(false);
      }
    })();
  }, [params.id]);

  if (loading) {
    return (
      <div className="px-6 py-8">
        <p className="text-sm text-muted-foreground">Loading product…</p>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="px-6 py-8">
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error || 'Product not found.'}</AlertDescription>
        </Alert>
        <Link
          href="/admin/products"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to products
        </Link>
      </div>
    );
  }

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
        title={product.item_name}
        description={product.sku ? `SKU ${product.sku}` : undefined}
        actions={
          <Link href={`/admin/products/${product.id}/edit`}>
            <Button size="sm">
              <Edit className="h-4 w-4" /> Edit
            </Button>
          </Link>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: Image + Info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Product information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {product.picture_url && (
              <div className="flex justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={product.picture_url}
                  alt={product.item_name}
                  className="w-full max-w-xs rounded-md border border-border"
                />
              </div>
            )}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <Field label="Product ID" value={String(product.id)} />
              <Field label="SKU" value={product.sku || '—'} mono />
              <Field label="NetSuite name" value={product.netsuite_name || '—'} />
              <Field label="UPC" value={product.upc || '—'} mono />
              <Field label="Size" value={product.size || '—'} />
              <Field label="Case pack" value={product.case_pack?.toString() || '—'} />
              <Field
                label="Case weight"
                value={product.case_weight ? `${product.case_weight} kg` : '—'}
              />
              <Field label="HS code" value={product.hs_code || '—'} mono />
              <Field label="Made in" value={product.made_in || '—'} />
              <Field
                label="Created"
                value={new Date(product.created_at).toLocaleDateString()}
              />
            </dl>
          </CardContent>
        </Card>

        {/* Right: Pricing + Status */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Pricing</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Americas</p>
                  <p className="text-xl font-medium font-mono">
                    ${product.price_americas.toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">International</p>
                  <p className="text-xl font-medium font-mono">
                    ${product.price_international.toFixed(2)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Status & visibility</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <StatusRow label="Enabled" yes={product.enable} />
              <StatusRow label="Eligible for support funds" yes={product.list_in_support_funds} />
              <StatusRow
                label="Qualifies for credit earning"
                yes={product.qualifies_for_credit_earning}
              />
              <StatusRow label="Out of stock" yes={product.out_of_stock} invert />
              <StatusRow label="Visible to Americas clients" yes={product.visible_to_americas} />
              <StatusRow
                label="Visible to International clients"
                yes={product.visible_to_international}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground mb-0.5">{label}</dt>
      <dd className={`font-medium ${mono ? 'font-mono text-xs' : ''}`}>{value}</dd>
    </div>
  );
}

function StatusRow({
  label,
  yes,
  invert = false,
}: {
  label: string;
  yes: boolean;
  /** If true, "yes" is the warning state (e.g. out-of-stock). */
  invert?: boolean;
}) {
  const isPositive = invert ? !yes : yes;
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm">{label}</span>
      {isPositive ? <Badge variant="success">Yes</Badge> : <Badge variant="muted">No</Badge>}
    </div>
  );
}
