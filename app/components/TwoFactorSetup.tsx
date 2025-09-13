'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { formatSecretForDisplay, testTOTPImplementation } from '../../lib/2fa';

interface TwoFactorSetupProps {
  userId: string;
  userType: 'admin' | 'client';
  onComplete?: () => void;
}

export default function TwoFactorSetup({ userId, userType, onComplete }: TwoFactorSetupProps) {
  const [step, setStep] = useState<'setup' | 'verify' | 'complete'>('setup');
  const [secret, setSecret] = useState('');
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [verificationCode, setVerificationCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (step === 'setup') {
      setup2FA();
      // Run TOTP test for debugging
      testTOTPImplementation();
    }
  }, [step]);

  const setup2FA = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/2fa/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, userType })
      });

      const data = await response.json();

      if (data.success) {
        setSecret(data.secret);
        setQrCodeUrl(data.qrCodeUrl);
        setRecoveryCodes(data.recoveryCodes);
      } else {
        setError(data.error || 'Failed to setup 2FA');
      }
    } catch (err) {
      setError('Failed to setup 2FA');
    } finally {
      setLoading(false);
    }
  };

  const verifyCode = async () => {
    if (!verificationCode) {
      setError('Please enter a verification code');
      return;
    }

    setLoading(true);
    setError('');

    const requestData = { userId, userType, code: verificationCode };
    console.log('Sending 2FA verification request:', requestData);

    try {
      const response = await fetch('/api/2fa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });

      const data = await response.json();
      console.log('2FA verification response:', { status: response.status, data });

      if (data.success) {
        setStep('complete');
        if (onComplete) onComplete();
      } else {
        console.error('2FA verification failed:', data.error);
        setError(data.error || 'Invalid verification code');
      }
    } catch (err) {
      setError('Failed to verify code');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const debugUserData = async () => {
    try {
      const response = await fetch(`/api/2fa/debug?userId=${userId}&userType=${userType}`);
      const data = await response.json();
      console.log('2FA Debug - User data:', data);
    } catch (err) {
      console.error('Debug failed:', err);
    }
  };

  if (step === 'setup') {
    return (
      <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-4">Setup Two-Factor Authentication</h3>
        
        {loading ? (
          <div className="text-center py-4">
            <p>Setting up 2FA...</p>
          </div>
        ) : secret ? (
          <div className="space-y-4">
            <div className="text-center">
              <h4 className="font-medium mb-2">Step 1: Scan QR Code</h4>
              <p className="text-sm text-gray-600 mb-4">
                Use your authenticator app (Google Authenticator, Authy, etc.) to scan this QR code:
              </p>
              {qrCodeUrl && (
                <div className="mb-4">
                  <img src={qrCodeUrl} alt="QR Code" className="mx-auto border rounded" />
                </div>
              )}
            </div>

            <div>
              <h4 className="font-medium mb-2">Step 2: Manual Entry (Alternative)</h4>
              <p className="text-sm text-gray-600 mb-2">
                If you can't scan the QR code, enter this secret manually:
              </p>
              <div className="flex items-center space-x-2">
                <code className="flex-1 p-2 bg-gray-100 rounded text-sm font-mono">
                  {formatSecretForDisplay(secret)}
                </code>
                <button
                  onClick={() => copyToClipboard(secret)}
                  className="px-3 py-2 bg-gray-200 rounded hover:bg-gray-300 text-sm"
                >
                  Copy
                </button>
              </div>
            </div>

            <div>
              <h4 className="font-medium mb-2">Step 3: Recovery Codes</h4>
              <p className="text-sm text-gray-600 mb-2">
                Save these recovery codes in a safe place. You can use them if you lose access to your authenticator:
              </p>
              <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
                <div className="grid grid-cols-2 gap-2 text-sm font-mono">
                  {recoveryCodes.map((code, index) => (
                    <div key={index} className="p-1 bg-white rounded">
                      {code}
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => copyToClipboard(recoveryCodes.join('\n'))}
                  className="mt-2 px-3 py-1 bg-yellow-200 rounded hover:bg-yellow-300 text-sm"
                >
                  Copy All Codes
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <button
                onClick={() => setStep('verify')}
                className="w-full bg-black text-white py-2 px-4 rounded hover:opacity-90"
              >
                Next: Verify Setup
              </button>
              <button
                onClick={debugUserData}
                className="w-full bg-gray-500 text-white py-2 px-4 rounded hover:opacity-90 text-sm"
              >
                Debug: Check User Data
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center py-4">
            <p className="text-red-600">{error}</p>
            <button
              onClick={setup2FA}
              className="mt-2 px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
            >
              Retry
            </button>
          </div>
        )}
      </div>
    );
  }

  if (step === 'verify') {
    return (
      <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-4">Verify Two-Factor Authentication</h3>
        
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Enter the 6-digit code from your authenticator app to complete the setup:
          </p>
          
          <div>
            <input
              type="text"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              className="w-full p-3 border border-gray-300 rounded text-center text-lg font-mono tracking-widest"
              maxLength={6}
            />
          </div>

          {error && (
            <p className="text-red-600 text-sm">{error}</p>
          )}

          <div className="flex space-x-2">
            <button
              onClick={() => setStep('setup')}
              className="flex-1 px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
            >
              Back
            </button>
            <button
              onClick={verifyCode}
              disabled={loading || verificationCode.length !== 6}
              className="flex-1 bg-black text-white py-2 px-4 rounded hover:opacity-90 disabled:opacity-50"
            >
              {loading ? 'Verifying...' : 'Verify & Enable'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'complete') {
    return (
      <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow">
        <div className="text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold mb-2">2FA Setup Complete!</h3>
          <p className="text-sm text-gray-600 mb-4">
            Two-factor authentication has been successfully enabled for your account.
          </p>
          <button
            onClick={onComplete}
            className="w-full bg-black text-white py-2 px-4 rounded hover:opacity-90"
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  return null;
}
