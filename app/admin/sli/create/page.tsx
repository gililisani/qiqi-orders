'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminLayout from '../../../components/AdminLayout';
import InnerPageShell from '../../../components/ui/InnerPageShell';
import Card from '../../../components/ui/Card';
import Link from 'next/link';

interface Product {
  hs_code: string;
  description: string;
  quantity: string;
  uom: string;
  weight: string;
  eccn: string;
  license_symbol: string;
  value: string;
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

export default function CreateStandaloneSLIPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({
    // Consignee Info
    consignee_name: '',
    consignee_address_line1: '',
    consignee_address_line2: '',
    consignee_address_line3: '',
    consignee_country: '',
    
    // Invoice & Date
    invoice_number: '',
    sli_date: new Date().toISOString().split('T')[0],
    date_of_export: '',
    
    // Forwarding Agent
    forwarding_agent_line1: '',
    forwarding_agent_line2: '',
    forwarding_agent_line3: '',
    forwarding_agent_line4: '',
    
    // Other Fields
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

  const [products, setProducts] = useState<Product[]>([
    {
      hs_code: '',
      description: '',
      quantity: '',
      uom: 'Each',
      weight: '',
      eccn: 'EAR99',
      license_symbol: 'NLR',
      value: '',
    },
  ]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleCheckboxChange = (name: keyof CheckboxStates) => {
    setCheckboxes(prev => ({ ...prev, [name]: !prev[name] }));
  };

  const handleProductChange = (index: number, field: keyof Product, value: string) => {
    const newProducts = [...products];
    newProducts[index][field] = value;
    setProducts(newProducts);
  };

  const addProduct = () => {
    setProducts([...products, {
      hs_code: '',
      description: '',
      quantity: '',
      uom: 'Each',
      weight: '',
      eccn: 'EAR99',
      license_symbol: 'NLR',
      value: '',
    }]);
  };

  const removeProduct = (index: number) => {
    if (products.length > 1) {
      setProducts(products.filter((_, i) => i !== index));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const sliData = {
        ...formData,
        checkbox_states: checkboxes,
        manual_products: products,
      };

      console.log('Creating SLI with data:', sliData);

      // Store data in localStorage temporarily (not in database)
      const tempId = `temp_${Date.now()}`;
      localStorage.setItem(`sli_${tempId}`, JSON.stringify(sliData));

      // Open the SLI preview in a new tab
      window.open(`/admin/sli/preview?temp=${tempId}`, '_blank');
      
    } catch (err: any) {
      console.error('SLI creation error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AdminLayout>
      <InnerPageShell
        title="Create Standalone SLI"
        breadcrumbs={[
          { label: 'Orders', href: '/admin/orders' },
          { label: 'Create Standalone SLI' }
        ]}
        actions={
          <Link href="/admin/orders" className="text-gray-600 hover:text-gray-800">
            ← Back to Orders
          </Link>
        }
      >
        <div className="max-w-6xl mx-auto">
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Consignee Information */}
            <Card title="Consignee Information">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Consignee Name *
                  </label>
                  <input
                    type="text"
                    name="consignee_name"
                    value={formData.consignee_name}
                    onChange={handleChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                  />
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
            <Card title="Invoice & Export Information">
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
            <Card title="Forwarding Agent">
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
            <Card title="Additional Information">
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
            <Card title="Products">
              <div className="space-y-4">
                {products.map((product, index) => (
                  <div key={index} className="p-4 border border-gray-200 rounded-lg">
                    <div className="flex justify-between items-center mb-3">
                      <h4 className="font-medium">Product {index + 1}</h4>
                      {products.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeProduct(index)}
                          className="text-red-600 hover:text-red-800 text-sm"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          HS Code *
                        </label>
                        <input
                          type="text"
                          value={product.hs_code}
                          onChange={(e) => handleProductChange(index, 'hs_code', e.target.value)}
                          required
                          className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Description *
                        </label>
                        <input
                          type="text"
                          value={product.description}
                          onChange={(e) => handleProductChange(index, 'description', e.target.value)}
                          required
                          className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Quantity *
                        </label>
                        <input
                          type="number"
                          value={product.quantity}
                          onChange={(e) => handleProductChange(index, 'quantity', e.target.value)}
                          required
                          className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          UOM *
                        </label>
                        <input
                          type="text"
                          value={product.uom}
                          onChange={(e) => handleProductChange(index, 'uom', e.target.value)}
                          required
                          className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Weight (kg) *
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={product.weight}
                          onChange={(e) => handleProductChange(index, 'weight', e.target.value)}
                          required
                          className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          ECCN *
                        </label>
                        <input
                          type="text"
                          value={product.eccn}
                          onChange={(e) => handleProductChange(index, 'eccn', e.target.value)}
                          required
                          className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          License Symbol *
                        </label>
                        <input
                          type="text"
                          value={product.license_symbol}
                          onChange={(e) => handleProductChange(index, 'license_symbol', e.target.value)}
                          required
                          className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Value ($) *
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={product.value}
                          onChange={(e) => handleProductChange(index, 'value', e.target.value)}
                          required
                          className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                        />
                      </div>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addProduct}
                  className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-gray-400 hover:text-gray-800"
                >
                  + Add Product
                </button>
              </div>
            </Card>

            {/* Checkboxes */}
            <Card title="Checkbox Options">
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

            {/* Submit Button */}
            <div className="flex justify-end gap-3">
              <Link
                href="/admin/orders"
                className="px-6 py-2 border border-gray-300 rounded hover:bg-gray-50 transition"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition disabled:opacity-50"
              >
                {loading ? 'Creating...' : 'Create SLI & Preview'}
              </button>
            </div>
          </form>
        </div>
      </InnerPageShell>
    </AdminLayout>
  );
}

