'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import AdminLayout from '../../components/AdminLayout';
import TwoFactorSetup from '../../components/TwoFactorSetup';
import TwoFactorManagement from '../../components/TwoFactorManagement';

export default function TwoFactorAuthPage() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showSetup, setShowSetup] = useState(false);

  useEffect(() => {
    fetchUser();
  }, []);

  const fetchUser = async () => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;

      const response = await fetch(`/api/user-profile?userId=${authUser.id}`);
      const data = await response.json();

      if (data.success) {
        setUser({ ...data.user, userType: data.user.role.toLowerCase() });
      }
    } catch (error) {
      console.error('Error fetching user:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSetupComplete = () => {
    setShowSetup(false);
    fetchUser(); // Refresh user data
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="p-6">
          <p>Loading...</p>
        </div>
      </AdminLayout>
    );
  }

  if (!user) {
    return (
      <AdminLayout>
        <div className="p-6">
          <p>User not found</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Two-Factor Authentication</h1>
          <p className="text-gray-600 mt-2">
            Secure your account with two-factor authentication
          </p>
        </div>

        {showSetup ? (
          <TwoFactorSetup
            userId={user.id}
            userType={user.userType}
            onComplete={handleSetupComplete}
          />
        ) : (
          <TwoFactorManagement
            userId={user.id}
            userType={user.userType}
          />
        )}

        {!showSetup && (
          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h3 className="font-medium text-blue-800 mb-2">About Two-Factor Authentication</h3>
            <ul className="text-sm text-blue-700 space-y-1">
              <li>• Adds an extra layer of security to your account</li>
              <li>• Requires a code from your authenticator app when signing in</li>
              <li>• Works with Google Authenticator, Authy, and other TOTP apps</li>
              <li>• Recovery codes are provided as a backup access method</li>
              <li>• Can be disabled at any time with a valid verification code</li>
            </ul>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
