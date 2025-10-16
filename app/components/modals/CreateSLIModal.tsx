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

  const [formData, setFormData] = useState({
    forwarding_agent_line1: existingSLI?.forwarding_agent_line1 || '',
    forwarding_agent_line2: existingSLI?.forwarding_agent_line2 || '',
    forwarding_agent_line3: existingSLI?.forwarding_agent_line3 || '',
    forwarding_agent_line4: existingSLI?.forwarding_agent_line4 || '',
    in_bond_code: existingSLI?.in_bond_code || '',
    instructions_to_forwarder: existingSLI?.instructions_to_forwarder || '',
  });

  // Fixed checkboxes - most are hardcoded, no need for state
  const [checkboxes] = useState({
    related_party_related: false,
    related_party_non_related: true, // Always checked
    routed_export_yes: false,
    routed_export_no: false,
    consignee_type_government: false,
    consignee_type_direct_consumer: false,
    consignee_type_other_unknown: false,
    consignee_type_reseller: true, // Always checked
    hazardous_material_yes: false,
    hazardous_material_no: true, // Always checked
    tib_carnet_yes: false,
    tib_carnet_no: false,
    insurance_yes: false,
    insurance_no: false,
    payment_prepaid: false,
    payment_collect: false,
    checkbox_39: false,
    checkbox_40: true, // Always checked
    checkbox_48: true, // Always checked
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
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
                  placeholder="Line 1 - Name"
                  className="w-full px-3 py-2 border rounded"
                  required
                />
                <input
                  type="text"
                  name="forwarding_agent_line2"
                  value={formData.forwarding_agent_line2}
                  onChange={handleInputChange}
                  placeholder="Line 2 - Address"
                  className="w-full px-3 py-2 border rounded"
                />
                <input
                  type="text"
                  name="forwarding_agent_line3"
                  value={formData.forwarding_agent_line3}
                  onChange={handleInputChange}
                  placeholder="Line 3 - City, State, Zip"
                  className="w-full px-3 py-2 border rounded"
                />
                <input
                  type="text"
                  name="forwarding_agent_line4"
                  value={formData.forwarding_agent_line4}
                  onChange={handleInputChange}
                  placeholder="Line 4 - Country (optional)"
                  className="w-full px-3 py-2 border rounded"
                />
              </div>
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
                placeholder="Enter In-Bond Code (optional)"
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
                placeholder="Enter special instructions (optional)"
                rows={4}
                className="w-full px-3 py-2 border rounded"
              />
            </div>

            {/* Info about auto-filled data */}
            <div className="bg-blue-50 border border-blue-200 rounded p-4">
              <h3 className="font-semibold text-blue-900 mb-2">Auto-filled Information</h3>
              <p className="text-sm text-blue-800">
                The following will be automatically populated from the order:
              </p>
              <ul className="text-sm text-blue-800 list-disc list-inside mt-2 space-y-1">
                <li>Company name and ship-to address</li>
                <li>Invoice number from order</li>
                <li>Product details (HS codes, quantities, weights, values)</li>
                <li>Pre-selected checkboxes (Non-Related, Re-Seller, No Hazmat, etc.)</li>
                <li>Date will be set to today's date</li>
              </ul>
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

