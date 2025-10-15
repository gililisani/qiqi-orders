'use client';

import { useState } from 'react';
import { useSupabase } from '../../../lib/supabase-provider';

interface CreateSLIModalProps {
  orderId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  existingSLI?: any; // For edit mode
  isEditMode?: boolean;
}

export default function CreateSLIModal({
  orderId,
  isOpen,
  onClose,
  onSuccess,
  existingSLI,
  isEditMode = false
}: CreateSLIModalProps) {
  const { supabase } = useSupabase();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signatureFile, setSignatureFile] = useState<File | null>(null);
  const [signaturePreview, setSignaturePreview] = useState<string | null>(
    existingSLI?.signature_image_url || null
  );

  const [formData, setFormData] = useState({
    forwarding_agent_line1: existingSLI?.forwarding_agent_line1 || '',
    forwarding_agent_line2: existingSLI?.forwarding_agent_line2 || '',
    forwarding_agent_line3: existingSLI?.forwarding_agent_line3 || '',
    forwarding_agent_line4: existingSLI?.forwarding_agent_line4 || '',
    date_of_export: existingSLI?.date_of_export || '',
    in_bond_code: existingSLI?.in_bond_code || '',
    instructions_to_forwarder: existingSLI?.instructions_to_forwarder || '',
  });

  const [checkboxes, setCheckboxes] = useState(
    existingSLI?.checkbox_states || {
      related_party_related: false,
      related_party_non_related: false,
      routed_export_yes: false,
      routed_export_no: false,
      consignee_type_government: false,
      consignee_type_direct_consumer: false,
      consignee_type_other_unknown: false,
      consignee_type_reseller: false,
      hazardous_material_yes: false,
      hazardous_material_no: false,
      tib_carnet_yes: false,
      tib_carnet_no: false,
      insurance_yes: false,
      insurance_no: false,
      payment_prepaid: false,
      payment_collect: false,
      checkbox_39: false,
      checkbox_40: false,
      checkbox_48: false,
    }
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleCheckboxChange = (name: string, value: boolean) => {
    setCheckboxes({
      ...checkboxes,
      [name]: value,
    });
  };

  const handleSignatureChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSignatureFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setSignaturePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      let signatureUrl = existingSLI?.signature_image_url || null;

      // Upload signature if new file selected
      if (signatureFile) {
        const fileExt = signatureFile.name.split('.').pop();
        const fileName = `${orderId}-signature-${Date.now()}.${fileExt}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('sli-signatures')
          .upload(fileName, signatureFile);

        if (uploadError) {
          throw new Error(`Failed to upload signature: ${uploadError.message}`);
        }

        const { data: { publicUrl } } = supabase.storage
          .from('sli-signatures')
          .getPublicUrl(fileName);

        signatureUrl = publicUrl;
      }

      // Get session for auth token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      const endpoint = isEditMode
        ? `/api/orders/${orderId}/sli/update`
        : `/api/orders/${orderId}/sli/create`;

      const method = isEditMode ? 'PUT' : 'POST';

      const response = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          ...formData,
          checkbox_states: checkboxes,
          signature_image_url: signatureUrl,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save SLI');
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error saving SLI:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold">
              {isEditMode ? 'Edit SLI' : 'Create SLI'}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 text-2xl"
            >
              ×
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Forwarding Agent Section */}
            <div>
              <h3 className="font-semibold mb-3">Forwarding Agent (Box 5)</h3>
              <div className="space-y-2">
                <input
                  type="text"
                  name="forwarding_agent_line1"
                  value={formData.forwarding_agent_line1}
                  onChange={handleInputChange}
                  placeholder="Line 1"
                  className="w-full px-3 py-2 border rounded"
                />
                <input
                  type="text"
                  name="forwarding_agent_line2"
                  value={formData.forwarding_agent_line2}
                  onChange={handleInputChange}
                  placeholder="Line 2"
                  className="w-full px-3 py-2 border rounded"
                />
                <input
                  type="text"
                  name="forwarding_agent_line3"
                  value={formData.forwarding_agent_line3}
                  onChange={handleInputChange}
                  placeholder="Line 3"
                  className="w-full px-3 py-2 border rounded"
                />
                <input
                  type="text"
                  name="forwarding_agent_line4"
                  value={formData.forwarding_agent_line4}
                  onChange={handleInputChange}
                  placeholder="Line 4"
                  className="w-full px-3 py-2 border rounded"
                />
              </div>
            </div>

            {/* Date of Export */}
            <div>
              <label className="block font-semibold mb-2">
                Date of Export (Box 6)
              </label>
              <input
                type="date"
                name="date_of_export"
                value={formData.date_of_export}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border rounded"
                required
              />
            </div>

            {/* In-Bond Code */}
            <div>
              <label className="block font-semibold mb-2">
                In-Bond Code (Box 17)
              </label>
              <input
                type="text"
                name="in_bond_code"
                value={formData.in_bond_code}
                onChange={handleInputChange}
                placeholder="Enter In-Bond Code"
                className="w-full px-3 py-2 border rounded"
              />
            </div>

            {/* Instructions to Forwarder */}
            <div>
              <label className="block font-semibold mb-2">
                Instructions to Forwarder (Box 26)
              </label>
              <textarea
                name="instructions_to_forwarder"
                value={formData.instructions_to_forwarder}
                onChange={handleInputChange}
                placeholder="Enter instructions"
                rows={4}
                className="w-full px-3 py-2 border rounded"
              />
            </div>

            {/* Signature Upload */}
            <div>
              <label className="block font-semibold mb-2">
                Signature (Box 45)
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={handleSignatureChange}
                className="w-full px-3 py-2 border rounded"
              />
              {signaturePreview && (
                <div className="mt-2">
                  <img
                    src={signaturePreview}
                    alt="Signature preview"
                    className="h-20 border rounded"
                  />
                </div>
              )}
            </div>

            {/* Checkboxes Section */}
            <div>
              <h3 className="font-semibold mb-3">Checkbox Options</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Related Party Indicator */}
                <div>
                  <p className="text-sm font-medium mb-1">Box 8: Related Party Indicator</p>
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={checkboxes.related_party_related}
                      onChange={(e) => handleCheckboxChange('related_party_related', e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-sm">Related</span>
                  </label>
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={checkboxes.related_party_non_related}
                      onChange={(e) => handleCheckboxChange('related_party_non_related', e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-sm">Non-Related</span>
                  </label>
                </div>

                {/* Routed Export Transaction */}
                <div>
                  <p className="text-sm font-medium mb-1">Box 10: Routed Export Transaction</p>
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={checkboxes.routed_export_yes}
                      onChange={(e) => handleCheckboxChange('routed_export_yes', e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-sm">Yes</span>
                  </label>
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={checkboxes.routed_export_no}
                      onChange={(e) => handleCheckboxChange('routed_export_no', e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-sm">No</span>
                  </label>
                </div>

                {/* Ultimate Consignee Type */}
                <div>
                  <p className="text-sm font-medium mb-1">Box 12: Ultimate Consignee Type</p>
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={checkboxes.consignee_type_government}
                      onChange={(e) => handleCheckboxChange('consignee_type_government', e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-sm">Government Entity</span>
                  </label>
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={checkboxes.consignee_type_direct_consumer}
                      onChange={(e) => handleCheckboxChange('consignee_type_direct_consumer', e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-sm">Direct Consumer</span>
                  </label>
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={checkboxes.consignee_type_other_unknown}
                      onChange={(e) => handleCheckboxChange('consignee_type_other_unknown', e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-sm">Other/Unknown</span>
                  </label>
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={checkboxes.consignee_type_reseller}
                      onChange={(e) => handleCheckboxChange('consignee_type_reseller', e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-sm">Re-Seller</span>
                  </label>
                </div>

                {/* Hazardous Material */}
                <div>
                  <p className="text-sm font-medium mb-1">Box 16: Hazardous Material</p>
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={checkboxes.hazardous_material_yes}
                      onChange={(e) => handleCheckboxChange('hazardous_material_yes', e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-sm">Yes</span>
                  </label>
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={checkboxes.hazardous_material_no}
                      onChange={(e) => handleCheckboxChange('hazardous_material_no', e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-sm">No</span>
                  </label>
                </div>

                {/* TIB / Carnet */}
                <div>
                  <p className="text-sm font-medium mb-1">Box 20: TIB / Carnet</p>
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={checkboxes.tib_carnet_yes}
                      onChange={(e) => handleCheckboxChange('tib_carnet_yes', e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-sm">Yes</span>
                  </label>
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={checkboxes.tib_carnet_no}
                      onChange={(e) => handleCheckboxChange('tib_carnet_no', e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-sm">No</span>
                  </label>
                </div>

                {/* Shipper Requests Insurance */}
                <div>
                  <p className="text-sm font-medium mb-1">Box 21: Shipper Requests Insurance</p>
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={checkboxes.insurance_yes}
                      onChange={(e) => handleCheckboxChange('insurance_yes', e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-sm">Yes</span>
                  </label>
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={checkboxes.insurance_no}
                      onChange={(e) => handleCheckboxChange('insurance_no', e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-sm">No</span>
                  </label>
                </div>

                {/* Shipper Must Check */}
                <div>
                  <p className="text-sm font-medium mb-1">Box 23: Shipper Must Check</p>
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={checkboxes.payment_prepaid}
                      onChange={(e) => handleCheckboxChange('payment_prepaid', e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-sm">Prepaid</span>
                  </label>
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={checkboxes.payment_collect}
                      onChange={(e) => handleCheckboxChange('payment_collect', e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-sm">Collect</span>
                  </label>
                </div>

                {/* Box 39 */}
                <div>
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={checkboxes.checkbox_39}
                      onChange={(e) => handleCheckboxChange('checkbox_39', e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-sm">Box 39: Non-licensable Schedule B ($2500 or less)</span>
                  </label>
                </div>

                {/* Box 40 */}
                <div>
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={checkboxes.checkbox_40}
                      onChange={(e) => handleCheckboxChange('checkbox_40', e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-sm">Box 40: USPPI authorizes forwarder</span>
                  </label>
                </div>

                {/* Box 48 */}
                <div>
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={checkboxes.checkbox_48}
                      onChange={(e) => handleCheckboxChange('checkbox_48', e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-sm">Box 48: Validate Electronic Signature</span>
                  </label>
                </div>

              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end space-x-3 pt-4 border-t">
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2 border rounded hover:bg-gray-50"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                disabled={loading}
              >
                {loading ? 'Saving...' : isEditMode ? 'Update SLI' : 'Create SLI'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

