'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';

interface TwoFactorManagementProps {
  userId: string;
  userType: 'admin' | 'client';
}

export default function TwoFactorManagement({ userId, userType }: TwoFactorManagementProps) {
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [verifiedAt, setVerifiedAt] = useState<string | null>(null);
  const [hasRecoveryCodes, setHasRecoveryCodes] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showDisableForm, setShowDisableForm] = useState(false);
  const [disableCode, setDisableCode] = useState('');
  const [isRecoveryCode, setIsRecoveryCode] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch2FAStatus();
  }, []);

  const fetch2FAStatus = async () => {
    try {
      const response = await fetch(`/api/2fa/status?userId=${userId}&userType=${userType}`);
      const data = await response.json();

      if (data.success) {
        setTwoFactorEnabled(data.twoFactorEnabled);
        setVerifiedAt(data.verifiedAt);
        setHasRecoveryCodes(data.hasRecoveryCodes);
      }
    } catch (err) {
      console.error('Failed to fetch 2FA status:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDisable2FA = async () => {
    if (!disableCode) {
      setError('Please enter a verification code');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/2fa/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          userId, 
          userType, 
          code: disableCode,
          isRecoveryCode 
        })
      });

      const data = await response.json();

      if (data.success) {
        setTwoFactorEnabled(false);
        setVerifiedAt(null);
        setHasRecoveryCodes(false);
        setShowDisableForm(false);
        setDisableCode('');
        setIsRecoveryCode(false);
      } else {
        setError(data.error || 'Failed to disable 2FA');
      }
    } catch (err) {
      setError('Failed to disable 2FA');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="p-4">
        <p>Loading 2FA status...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
        <div>
          <h3 className="font-medium">Two-Factor Authentication</h3>
          <p className="text-sm text-gray-600">
            {twoFactorEnabled ? 'Enabled' : 'Disabled'}
          </p>
          {verifiedAt && (
            <p className="text-xs text-gray-500">
              Last verified: {formatDate(verifiedAt)}
            </p>
          )}
        </div>
        <div className="flex items-center space-x-2">
          <div className={`w-3 h-3 rounded-full ${twoFactorEnabled ? 'bg-green-500' : 'bg-gray-400'}`} />
          <span className="text-sm font-medium">
            {twoFactorEnabled ? 'Active' : 'Inactive'}
          </span>
        </div>
      </div>

      {twoFactorEnabled ? (
        <div className="space-y-3">
          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <h4 className="font-medium text-yellow-800 mb-2">Security Information</h4>
            <ul className="text-sm text-yellow-700 space-y-1">
              <li>• Your account is protected with two-factor authentication</li>
              <li>• You'll need to enter a code from your authenticator app when signing in</li>
              <li>• Keep your recovery codes safe in case you lose access to your authenticator</li>
              {hasRecoveryCodes && (
                <li>• You have recovery codes available for backup access</li>
              )}
            </ul>
          </div>

          <button
            onClick={() => setShowDisableForm(true)}
            className="w-full px-4 py-2 border border-red-300 text-red-700 rounded hover:bg-red-50"
          >
            Disable Two-Factor Authentication
          </button>
        </div>
      ) : (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h4 className="font-medium text-blue-800 mb-2">Enable Two-Factor Authentication</h4>
          <p className="text-sm text-blue-700 mb-3">
            Add an extra layer of security to your account by enabling two-factor authentication.
          </p>
          <button
            onClick={() => window.location.reload()} // This will trigger the setup flow
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Setup 2FA
          </button>
        </div>
      )}

      {showDisableForm && (
        <div className="p-4 border border-red-200 rounded-lg bg-red-50">
          <h4 className="font-medium text-red-800 mb-2">Disable Two-Factor Authentication</h4>
          <p className="text-sm text-red-700 mb-4">
            This will remove the extra security from your account. Enter a code from your authenticator app or a recovery code to confirm.
          </p>
          
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Verification Code
              </label>
              <input
                type="text"
                value={disableCode}
                onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                className="w-full p-2 border border-gray-300 rounded text-center font-mono tracking-widest"
                maxLength={6}
              />
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="isRecoveryCode"
                checked={isRecoveryCode}
                onChange={(e) => setIsRecoveryCode(e.target.checked)}
                className="mr-2"
              />
              <label htmlFor="isRecoveryCode" className="text-sm text-gray-700">
                This is a recovery code
              </label>
            </div>

            {error && (
              <p className="text-red-600 text-sm">{error}</p>
            )}

            <div className="flex space-x-2">
              <button
                onClick={() => {
                  setShowDisableForm(false);
                  setDisableCode('');
                  setIsRecoveryCode(false);
                  setError('');
                }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDisable2FA}
                disabled={loading || disableCode.length !== 6}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
              >
                {loading ? 'Disabling...' : 'Disable 2FA'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
