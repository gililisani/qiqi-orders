'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { supabase } from '../../../../../lib/supabaseClient';
import Card from '../../../../components/ui/Card';
import Link from 'next/link';

interface Company {
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

interface Product {
  id: string;
  item_name: string;
  hs_code?: string;
  case_weight?: number;
  made_in?: string;
}

interface SelectedProduct {
  product_id: string;
  product_name: string;
  hs_code: string;
  quantity: number;
  made_in?: string;
}

interface CheckboxStates {
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

export default function EditStandaloneSLIPage() {
  const router = useRouter();
  const params = useParams();
  const sliId = params.id as string;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [showCompanyDropdown, setShowCompanyDropdown] = useState(false);
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [companySearchTerm, setCompanySearchTerm] = useState('');
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
  const [selectedProducts, setSelectedProducts] = useState<SelectedProduct[]>([]);
  const companyDropdownRef = useRef<HTMLDivElement>(null);
  const productDropdownRef = useRef<HTMLDivElement>(null);

  const [formData, setFormData] = useState({
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
  });

  const [checkboxes, setCheckboxes] = useState<CheckboxStates>({
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
  });

  const [currentProductId, setCurrentProductId] = useState('');
  const [currentQuantity, setCurrentQuantity] = useState(1);

  useEffect(() => {
    fetchCompanies();
    fetchProducts();
  }, []);

  useEffect(() => {
    if (companies.length > 0 && products.length > 0) {
      fetchSLI();
    }
  }, [sliId, companies.length, products.length]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (companyDropdownRef.current && !companyDropdownRef.current.contains(event.target as Node)) {
        setShowCompanyDropdown(false);
      }
      if (productDropdownRef.current && !productDropdownRef.current.contains(event.target as Node)) {
        setShowProductDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchSLI = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/sli/standalone/${sliId}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch SLI');
      }

      const sli = data.sli;

      // Populate form data
      setFormData({
        consignee_name: sli.consignee_name || '',
        consignee_address_line1: sli.consignee_address_line1 || '',
        consignee_address_line2: sli.consignee_address_line2 || '',
        consignee_address_line3: sli.consignee_address_line3 || '',
        consignee_country: sli.consignee_country || '',
        invoice_number: sli.invoice_number || '',
        sli_date: sli.sli_date ? sli.sli_date.split('T')[0] : new Date().toISOString().split('T')[0],
        date_of_export: sli.date_of_export ? sli.date_of_export.split('T')[0] : '',
        forwarding_agent_line1: sli.forwarding_agent_line1 || '',
        forwarding_agent_line2: sli.forwarding_agent_line2 || '',
        forwarding_agent_line3: sli.forwarding_agent_line3 || '',
        forwarding_agent_line4: sli.forwarding_agent_line4 || '',
        in_bond_code: sli.in_bond_code || '',
        instructions_to_forwarder: sli.instructions_to_forwarder || '',
      });

      setSelectedCompanyId(sli.company_id || '');
      // Set company search term - use company name if available, otherwise use consignee name
      if (sli.company_id && companies.length > 0) {
        const company = companies.find(c => c.id === sli.company_id);
        if (company) {
          setCompanySearchTerm(company.company_name);
        } else if (sli.consignee_name) {
          setCompanySearchTerm(sli.consignee_name);
        }
      } else if (sli.consignee_name) {
        setCompanySearchTerm(sli.consignee_name);
      }

      setCheckboxes({
        ...checkboxes,
        ...(sli.checkbox_states || {}),
      });

      setSelectedProducts(sli.selected_products || []);
    } catch (err: any) {
      console.error('Error fetching SLI:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchCompanies = async () => {
    try {
      const { data, error } = await supabase
        .from('companies')
        .select('id, company_name, ship_to_street_line_1, ship_to_street_line_2, ship_to_city, ship_to_state, ship_to_postal_code, ship_to_country, company_address')
        .order('company_name');

      if (error) throw error;
      setCompanies(data || []);
    } catch (err: any) {
      console.error('Error fetching companies:', err);
    }
  };

  const fetchProducts = async () => {
    try {
      const { data, error } = await supabase
        .from('Products')
        .select('id, item_name, hs_code, case_weight, made_in')
        .order('item_name');

      if (error) throw error;
      setProducts(data || []);
    } catch (err: any) {
      console.error('Error fetching products:', err);
    }
  };

  const handleCompanySelect = (company: Company) => {
    setSelectedCompanyId(company.id);
    setCompanySearchTerm(company.company_name);
    setShowCompanyDropdown(false);
    
    setFormData(prev => ({
      ...prev,
      consignee_name: company.company_name,
      consignee_address_line1: company.ship_to_street_line_1 || company.company_address?.split('\n')[0] || '',
      consignee_address_line2: company.ship_to_street_line_2 || company.company_address?.split('\n')[1] || '',
      consignee_address_line3: company.ship_to_city && company.ship_to_state 
        ? `${company.ship_to_city}, ${company.ship_to_state} ${company.ship_to_postal_code || ''}`.trim()
        : company.company_address?.split('\n')[2] || '',
      consignee_country: company.ship_to_country || '',
    }));
  };

  const handleProductSelect = (product: Product) => {
    setCurrentProductId(product.id);
    setProductSearchTerm(product.item_name);
    setShowProductDropdown(false);
  };

  const addSelectedProduct = () => {
    if (!currentProductId || currentQuantity <= 0) return;

    const product = products.find(p => p.id === currentProductId);
    if (!product) return;

    if (selectedProducts.find(sp => sp.product_id === currentProductId)) {
      setError('Product already added. Update quantity or remove and re-add.');
      return;
    }

    setSelectedProducts([...selectedProducts, {
      product_id: product.id,
      product_name: product.item_name,
      hs_code: product.hs_code || 'N/A',
      quantity: currentQuantity,
      made_in: product.made_in,
    }]);

    setCurrentProductId('');
    setProductSearchTerm('');
    setCurrentQuantity(1);
  };

  const removeSelectedProduct = (productId: string) => {
    setSelectedProducts(selectedProducts.filter(sp => sp.product_id !== productId));
  };

  const updateProductQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) return;
    setSelectedProducts(selectedProducts.map(sp => 
      sp.product_id === productId ? { ...sp, quantity } : sp
    ));
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleCheckboxChange = (name: keyof CheckboxStates) => {
    setCheckboxes(prev => ({ ...prev, [name]: !prev[name] }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    if (selectedProducts.length === 0) {
      setError('Please add at least one product');
      setSaving(false);
      return;
    }

    try {
      const response = await fetch(`/api/sli/standalone/${sliId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          company_id: selectedCompanyId || null,
          checkbox_states: checkboxes,
          selected_products: selectedProducts,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update SLI');
      }

      router.push(`/admin/sli/documents`);
    } catch (err: any) {
      console.error('SLI update error:', err);
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const filteredCompanies = companies.filter(c =>
    c.company_name.toLowerCase().includes(companySearchTerm.toLowerCase())
  );

  const filteredProducts = products.filter(p =>
    p.item_name.toLowerCase().includes(productSearchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="mt-8 mb-4 space-y-6">
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black mx-auto mb-4"></div>
          <p className="text-gray-600">Loading SLI...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-8 mb-4 space-y-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold text-gray-900">Edit Standalone SLI</h2>
        <Link href="/admin/sli/documents" className="text-gray-600 hover:text-gray-800">
          ← Back to SLI Documents
        </Link>
      </div>

      <div className="max-w-6xl mx-auto">
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Same form structure as create page - copied from create page for consistency */}
          {/* Consignee Information */}
          <Card header={<h2 className="font-semibold">Consignee Information</h2>}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2 relative" ref={companyDropdownRef}>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Consignee Name (Company) *
                </label>
                <input
                  type="text"
                  value={companySearchTerm}
                  onChange={(e) => {
                    setCompanySearchTerm(e.target.value);
                    setShowCompanyDropdown(true);
                  }}
                  onFocus={() => setShowCompanyDropdown(true)}
                  placeholder="Search or select a company..."
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                />
                
                {showCompanyDropdown && filteredCompanies.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-auto">
                    {filteredCompanies.map((company) => (
                      <div
                        key={company.id}
                        onClick={() => handleCompanySelect(company)}
                        className="px-3 py-2 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                      >
                        <div className="font-medium text-gray-900">{company.company_name}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Address Line 1 *
                </label>
                <input
                  type="text"
                  name="consignee_address_line1"
                  value={formData.consignee_address_line1}
                  onChange={handleChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Address Line 2
                </label>
                <input
                  type="text"
                  name="consignee_address_line2"
                  value={formData.consignee_address_line2}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Address Line 3
                </label>
                <input
                  type="text"
                  name="consignee_address_line3"
                  value={formData.consignee_address_line3}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Country *
                </label>
                <input
                  type="text"
                  name="consignee_country"
                  value={formData.consignee_country}
                  onChange={handleChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>
            </div>
          </Card>

          {/* Invoice & Dates */}
          <Card header={<h2 className="font-semibold">Invoice & Export Information</h2>}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Invoice Number *
                </label>
                <input
                  type="text"
                  name="invoice_number"
                  value={formData.invoice_number}
                  onChange={handleChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  SLI Date *
                </label>
                <input
                  type="date"
                  name="sli_date"
                  value={formData.sli_date}
                  onChange={handleChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Date of Export
                </label>
                <input
                  type="date"
                  name="date_of_export"
                  value={formData.date_of_export}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>
            </div>
          </Card>

          {/* Forwarding Agent */}
          <Card header={<h2 className="font-semibold">Forwarding Agent</h2>}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Line 1
                </label>
                <input
                  type="text"
                  name="forwarding_agent_line1"
                  value={formData.forwarding_agent_line1}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Line 2
                </label>
                <input
                  type="text"
                  name="forwarding_agent_line2"
                  value={formData.forwarding_agent_line2}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Line 3
                </label>
                <input
                  type="text"
                  name="forwarding_agent_line3"
                  value={formData.forwarding_agent_line3}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Line 4
                </label>
                <input
                  type="text"
                  name="forwarding_agent_line4"
                  value={formData.forwarding_agent_line4}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>
            </div>
          </Card>

          {/* Additional Fields */}
          <Card header={<h2 className="font-semibold">Additional Information</h2>}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  In-Bond Code
                </label>
                <input
                  type="text"
                  name="in_bond_code"
                  value={formData.in_bond_code}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Instructions to Forwarder
                </label>
                <textarea
                  name="instructions_to_forwarder"
                  value={formData.instructions_to_forwarder}
                  onChange={handleChange}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>
            </div>
          </Card>

          {/* Products */}
          <Card header={<h2 className="font-semibold">Products</h2>}>
            <div className="space-y-4">
              <div className="flex gap-4 items-end">
                <div className="flex-1 relative" ref={productDropdownRef}>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select Product
                  </label>
                  <input
                    type="text"
                    value={productSearchTerm}
                    onChange={(e) => {
                      setProductSearchTerm(e.target.value);
                      setShowProductDropdown(true);
                    }}
                    onFocus={() => setShowProductDropdown(true)}
                    placeholder="Search and select a product..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                  />
                  
                  {showProductDropdown && filteredProducts.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-auto">
                      {filteredProducts.map((product) => (
                        <div
                          key={product.id}
                          onClick={() => handleProductSelect(product)}
                          className="px-3 py-2 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                        >
                          <div className="font-medium text-gray-900">{product.item_name}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                
                <div className="w-32">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Quantity
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={currentQuantity}
                    onChange={(e) => setCurrentQuantity(parseInt(e.target.value) || 1)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                  />
                </div>
                
                <button
                  type="button"
                  onClick={addSelectedProduct}
                  disabled={!currentProductId || currentQuantity <= 0}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Add Product
                </button>
              </div>

              {selectedProducts.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Selected Products</h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 border border-gray-300">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Product Name</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">HS Code</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Quantity</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {selectedProducts.map((sp) => (
                          <tr key={sp.product_id}>
                            <td className="px-4 py-2 text-sm text-gray-900">{sp.product_name}</td>
                            <td className="px-4 py-2 text-sm text-gray-900">{sp.hs_code}</td>
                            <td className="px-4 py-2">
                              <input
                                type="number"
                                min="1"
                                value={sp.quantity}
                                onChange={(e) => updateProductQuantity(sp.product_id, parseInt(e.target.value) || 1)}
                                className="w-20 px-2 py-1 border border-gray-300 rounded text-sm"
                              />
                            </td>
                            <td className="px-4 py-2">
                              <button
                                type="button"
                                onClick={() => removeSelectedProduct(sp.product_id)}
                                className="text-red-600 hover:text-red-800 text-sm"
                              >
                                Remove
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Checkboxes - same as create page */}
          <Card header={<h2 className="font-semibold">Checkbox Options</h2>}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Box 8: Related Party Indicator</p>
                <div className="space-y-2">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={checkboxes.related_party_related}
                      onChange={() => handleCheckboxChange('related_party_related')}
                      className="mr-2"
                    />
                    <span className="text-sm">Related</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={checkboxes.related_party_non_related}
                      onChange={() => handleCheckboxChange('related_party_non_related')}
                      className="mr-2"
                    />
                    <span className="text-sm">Non-Related</span>
                  </label>
                </div>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Box 10: Routed Export Transaction</p>
                <div className="space-y-2">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={checkboxes.routed_export_yes}
                      onChange={() => handleCheckboxChange('routed_export_yes')}
                      className="mr-2"
                    />
                    <span className="text-sm">Yes</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={checkboxes.routed_export_no}
                      onChange={() => handleCheckboxChange('routed_export_no')}
                      className="mr-2"
                    />
                    <span className="text-sm">No</span>
                  </label>
                </div>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Box 12: Type of Consignee</p>
                <div className="space-y-2">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={checkboxes.consignee_type_government}
                      onChange={() => handleCheckboxChange('consignee_type_government')}
                      className="mr-2"
                    />
                    <span className="text-sm">Government</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={checkboxes.consignee_type_direct_consumer}
                      onChange={() => handleCheckboxChange('consignee_type_direct_consumer')}
                      className="mr-2"
                    />
                    <span className="text-sm">Direct Consumer</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={checkboxes.consignee_type_other_unknown}
                      onChange={() => handleCheckboxChange('consignee_type_other_unknown')}
                      className="mr-2"
                    />
                    <span className="text-sm">Other/Unknown</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={checkboxes.consignee_type_reseller}
                      onChange={() => handleCheckboxChange('consignee_type_reseller')}
                      className="mr-2"
                    />
                    <span className="text-sm">Re-Seller</span>
                  </label>
                </div>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Box 16: Hazardous Material</p>
                <div className="space-y-2">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={checkboxes.hazardous_material_yes}
                      onChange={() => handleCheckboxChange('hazardous_material_yes')}
                      className="mr-2"
                    />
                    <span className="text-sm">Yes</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={checkboxes.hazardous_material_no}
                      onChange={() => handleCheckboxChange('hazardous_material_no')}
                      className="mr-2"
                    />
                    <span className="text-sm">No</span>
                  </label>
                </div>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Box 21: TIB/Carnet</p>
                <div className="space-y-2">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={checkboxes.tib_carnet_yes}
                      onChange={() => handleCheckboxChange('tib_carnet_yes')}
                      className="mr-2"
                    />
                    <span className="text-sm">Yes</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={checkboxes.tib_carnet_no}
                      onChange={() => handleCheckboxChange('tib_carnet_no')}
                      className="mr-2"
                    />
                    <span className="text-sm">No</span>
                  </label>
                </div>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Other Checkboxes</p>
                <div className="space-y-2">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={checkboxes.deliver_to_checkbox}
                      onChange={() => handleCheckboxChange('deliver_to_checkbox')}
                      className="mr-2"
                    />
                    <span className="text-sm">Box 24: Deliver To</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={checkboxes.declaration_statement_checkbox}
                      onChange={() => handleCheckboxChange('declaration_statement_checkbox')}
                      className="mr-2"
                    />
                    <span className="text-sm">Box 40: Declaration Statement</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={checkboxes.signature_checkbox}
                      onChange={() => handleCheckboxChange('signature_checkbox')}
                      className="mr-2"
                    />
                    <span className="text-sm">Box 48: Signature</span>
                  </label>
                </div>
              </div>
            </div>
          </Card>

          <div className="flex justify-end gap-3">
            <Link
              href="/admin/sli/documents"
              className="px-6 py-2 border border-gray-300 rounded hover:bg-gray-50 transition"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={saving || selectedProducts.length === 0}
              className="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Update SLI'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

