'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../../../../lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import ImageUpload from '../../../../components/ImageUpload';
import {
  Card,
  CardBody,
  CardHeader,
  Input,
  Button,
  Typography,
} from '../../../../components/MaterialTailwind';

interface Category {
  id: number;
  name: string;
  sort_order: number;
}

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
  category_id?: number;
  category?: Category;
  created_at: string;
}

const defaultProps = {
  placeholder: undefined,
  onPointerEnterCapture: undefined,
  onPointerLeaveCapture: undefined,
  crossOrigin: undefined,
};

export default function EditProductPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [formData, setFormData] = useState({
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
    category_id: ''
  });

  useEffect(() => {
    checkAdminAccess();
    fetchCategories();
    fetchProduct();
  }, [params.id]);

  const checkAdminAccess = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/');
      return;
    }

    // Check if user is in admins table
    const { data: adminProfile } = await supabase
      .from('admins')
      .select('id')
      .eq('id', user.id)
      .single();

    if (!adminProfile) {
      router.push('/client');
      return;
    }
  };

  const fetchCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('sort_order', { ascending: true });

      if (error) throw error;
      setCategories(data || []);
    } catch (err: any) {
      console.error('Error fetching categories:', err);
    }
  };

  const fetchProduct = async () => {
    try {
      const { data, error } = await supabase
        .from('Products')
        .select(`
          *,
          category:categories(*)
        `)
        .eq('id', params.id)
        .single();

      if (error) throw error;

      setFormData({
        item_name: data.item_name || '',
        netsuite_name: data.netsuite_name || '',
        sku: data.sku || '',
        upc: data.upc || '',
        size: data.size || '',
        case_pack: data.case_pack?.toString() || '',
        price_international: data.price_international?.toString() || '',
        price_americas: data.price_americas?.toString() || '',
        enable: data.enable ?? true,
        list_in_support_funds: data.list_in_support_funds ?? true,
        visible_to_americas: data.visible_to_americas ?? true,
        visible_to_international: data.visible_to_international ?? true,
        qualifies_for_credit_earning: data.qualifies_for_credit_earning ?? true,
        out_of_stock: data.out_of_stock ?? false,
        picture_url: data.picture_url || '',
        case_weight: data.case_weight?.toString() || '',
        hs_code: data.hs_code || '',
        made_in: data.made_in || '',
        category_id: data.category_id?.toString() || ''
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      const { error } = await supabase
        .from('Products')
        .update({
          item_name: formData.item_name,
          netsuite_name: formData.netsuite_name,
          sku: formData.sku,
          upc: formData.upc,
          size: formData.size,
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
        category_id: formData.category_id || null
        })
        .eq('id', params.id);

      if (error) throw error;

      router.push(`/admin/products/${params.id}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }));
  };

  const handleInputChange = (name: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  if (loading) {
    return (
      <div className="p-6">
        <p>Loading product...</p>
      </div>
    );
  }

  return (
    <div className="mt-8 mb-4 space-y-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold text-gray-900">Edit Product</h2>
        <Link href={`/admin/products/${params.id}`} className="text-gray-600 hover:text-gray-800">
          ← Back to Product
        </Link>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="space-y-6">
          {/* Top Row: Image on Left, Basic Info and Pricing on Right */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
            {/* Left: Product Image Card - Full Height */}
            <Card className="shadow-sm flex flex-col" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
              <CardHeader floated={false} shadow={false} className="rounded-none" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
                <Typography variant="h6" color="blue-gray" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
                  Product Image
                </Typography>
              </CardHeader>
              <CardBody className="px-4 pt-0 flex-1 flex flex-col justify-center" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
                <ImageUpload
                  onImageUploaded={(url) => setFormData(prev => ({ ...prev, picture_url: url }))}
                  currentImageUrl={formData.picture_url}
                />
              </CardBody>
            </Card>

            {/* Right: Basic Info and Pricing stacked */}
            <div className="space-y-6">
              {/* Basic Information Card */}
              <Card className="shadow-sm" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
                <CardHeader floated={false} shadow={false} className="rounded-none" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
                  <Typography variant="h6" color="blue-gray" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
                    Basic Information
                  </Typography>
                </CardHeader>
                <CardBody className="px-4 pt-0" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Input
                      label="Item Name"
                      name="item_name"
                      value={formData.item_name}
                      onChange={(e) => handleInputChange('item_name', e.target.value)}
                      required
                      {...defaultProps}
                    />
                    <Input
                      label="NetSuite Name"
                      name="netsuite_name"
                      value={formData.netsuite_name}
                      onChange={(e) => handleInputChange('netsuite_name', e.target.value)}
                      {...defaultProps}
                    />
                    <Input
                      label="SKU"
                      name="sku"
                      value={formData.sku}
                      onChange={(e) => handleInputChange('sku', e.target.value)}
                      required
                      {...defaultProps}
                    />
                    <Input
                      label="UPC"
                      name="upc"
                      value={formData.upc}
                      onChange={(e) => handleInputChange('upc', e.target.value)}
                      {...defaultProps}
                    />
                    <Input
                      label="Size"
                      name="size"
                      value={formData.size}
                      onChange={(e) => handleInputChange('size', e.target.value)}
                      {...defaultProps}
                    />
                    <Input
                      label="Case Pack"
                      name="case_pack"
                      type="number"
                      value={formData.case_pack}
                      onChange={(e) => handleInputChange('case_pack', e.target.value)}
                      {...defaultProps}
                    />
                  </div>
                </CardBody>
              </Card>

              {/* Pricing Card */}
              <Card className="shadow-sm" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
                <CardHeader floated={false} shadow={false} className="rounded-none" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
                  <Typography variant="h6" color="blue-gray" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
                    Pricing
                  </Typography>
                </CardHeader>
                <CardBody className="px-4 pt-0" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Input
                      label="Americas Price (USD)"
                      name="price_americas"
                      type="number"
                      step="0.01"
                      value={formData.price_americas}
                      onChange={(e) => handleInputChange('price_americas', e.target.value)}
                      required
                      {...defaultProps}
                    />
                    <Input
                      label="International Price (USD)"
                      name="price_international"
                      type="number"
                      step="0.01"
                      value={formData.price_international}
                      onChange={(e) => handleInputChange('price_international', e.target.value)}
                      required
                      {...defaultProps}
                    />
                  </div>
                </CardBody>
              </Card>
            </div>
          </div>

          {/* Bottom Row: Product Settings on Left, Packing List on Right */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Product Settings Card (merged with Client Class Visibility) */}
            <Card className="shadow-sm" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
              <CardHeader floated={false} shadow={false} className="rounded-none" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
                <Typography variant="h6" color="blue-gray" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
                  Product Settings
                </Typography>
              </CardHeader>
              <CardBody className="px-4 pt-0" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
                <div className="space-y-4">
                  <div className="space-y-4">
                    <label className="flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        name="enable"
                        checked={formData.enable}
                        onChange={handleChange}
                        className="h-4 w-4 text-blue-gray-600 focus:ring-blue-gray-500 border-gray-300 rounded transition"
                      />
                      <span className="ml-3 text-sm font-normal text-gray-700">Enable Product</span>
                    </label>
                    <label className="flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        name="list_in_support_funds"
                        checked={formData.list_in_support_funds}
                        onChange={handleChange}
                        className="h-4 w-4 text-blue-gray-600 focus:ring-blue-gray-500 border-gray-300 rounded transition"
                      />
                      <span className="ml-3 text-sm font-normal text-gray-700">Eligible for Support Funds</span>
                    </label>
                    <label className="flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        name="qualifies_for_credit_earning"
                        checked={formData.qualifies_for_credit_earning}
                        onChange={handleChange}
                        className="h-4 w-4 text-blue-gray-600 focus:ring-blue-gray-500 border-gray-300 rounded transition"
                      />
                      <span className="ml-3 text-sm font-normal text-gray-700">Qualifies for Credit Earning</span>
                    </label>
                    <label className="flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        name="out_of_stock"
                        checked={formData.out_of_stock}
                        onChange={handleChange}
                        className="h-4 w-4 text-blue-gray-600 focus:ring-blue-gray-500 border-gray-300 rounded transition"
                      />
                      <span className="ml-3 text-sm font-normal text-gray-700">Out of Stock</span>
                    </label>
                  </div>

                  <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
                    <Typography variant="small" className="font-medium text-yellow-800 mb-2" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
                      Support Fund Settings Explained:
                    </Typography>
                    <ul className="text-sm text-yellow-700 space-y-1">
                      <li><strong>Eligible for Support Funds:</strong> Can this product be purchased WITH support fund credit?</li>
                      <li><strong>Qualifies for Credit Earning:</strong> Does purchasing this product EARN support fund credit?</li>
                      <li><strong>Note:</strong> Kits, discounted items, and promotional items typically should NOT qualify for credit earning.</li>
                    </ul>
                  </div>

                  <div className="border-t pt-4 mt-4">
                    <Typography variant="small" className="font-semibold text-gray-700 mb-3" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
                      Client Class Visibility
                    </Typography>
                    <div className="space-y-3">
                      <label className="flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          name="visible_to_americas"
                          checked={formData.visible_to_americas}
                          onChange={handleChange}
                          className="h-4 w-4 text-blue-gray-600 focus:ring-blue-gray-500 border-gray-300 rounded transition"
                        />
                        <span className="ml-3 text-sm font-normal text-gray-700">Visible to Americas Clients</span>
                      </label>
                      <label className="flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          name="visible_to_international"
                          checked={formData.visible_to_international}
                          onChange={handleChange}
                          className="h-4 w-4 text-blue-gray-600 focus:ring-blue-gray-500 border-gray-300 rounded transition"
                        />
                        <span className="ml-3 text-sm font-normal text-gray-700">Visible to International Clients</span>
                      </label>
                    </div>
                  </div>
                </div>
              </CardBody>
            </Card>

            {/* Right: Packing List Information Card */}
            <Card className="shadow-sm" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
              <CardHeader floated={false} shadow={false} className="rounded-none" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
                <Typography variant="h6" color="blue-gray" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
                  Packing List Information
                </Typography>
                <Typography variant="small" color="gray" className="mt-1 font-normal" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
                  Required for international shipping and customs documentation
                </Typography>
              </CardHeader>
              <CardBody className="px-4 pt-0" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
                <div className="grid grid-cols-1 gap-6">
                  <Input
                    label="Case Weight (kg)"
                    name="case_weight"
                    type="number"
                    step="0.01"
                    value={formData.case_weight}
                    onChange={(e) => handleInputChange('case_weight', e.target.value)}
                    placeholder="e.g., 12.50"
                    onPointerEnterCapture={undefined}
                    onPointerLeaveCapture={undefined}
                    crossOrigin={undefined}
                  />
                  <Input
                    label="HS Code"
                    name="hs_code"
                    value={formData.hs_code}
                    onChange={(e) => handleInputChange('hs_code', e.target.value)}
                    placeholder="e.g., 3305.10.00"
                    onPointerEnterCapture={undefined}
                    onPointerLeaveCapture={undefined}
                    crossOrigin={undefined}
                  />
                  <Input
                    label="Made In"
                    name="made_in"
                    value={formData.made_in}
                    onChange={(e) => handleInputChange('made_in', e.target.value)}
                    placeholder="e.g., USA, China, Italy"
                    onPointerEnterCapture={undefined}
                    onPointerLeaveCapture={undefined}
                    crossOrigin={undefined}
                  />
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Category
                    </label>
                    <select
                      name="category_id"
                      value={formData.category_id}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                    >
                      <option value="">No Category</option>
                      {categories.map(category => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                    <Typography variant="small" color="gray" className="mt-1 font-normal" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
                      Assign this product to a category for better organization
                    </Typography>
                  </div>
                </div>
              </CardBody>
            </Card>
          </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-4 pt-4">
                <Link href={`/admin/products/${params.id}`}>
                  <Button
                    variant="outlined"
                    color="gray"
                    placeholder={undefined}
                    onPointerEnterCapture={undefined}
                    onPointerLeaveCapture={undefined}
                  >
                    Cancel
                  </Button>
                </Link>
                <Button
                  type="submit"
                  color="blue-gray"
                  disabled={saving}
                  placeholder={undefined}
                  onPointerEnterCapture={undefined}
                  onPointerLeaveCapture={undefined}
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
        </div>
      </form>
    </div>
  );
}
