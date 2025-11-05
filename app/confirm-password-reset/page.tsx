'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Button,
  Typography,
  Alert,
  Spinner,
} from '../components/MaterialTailwind';

interface ResetTokens {
  accessToken: string;
  refreshToken: string;
  type: string;
}

export default function ConfirmPasswordResetPage() {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | React.ReactNode>('');
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isValidating, setIsValidating] = useState(true);
  const [resetTokens, setResetTokens] = useState<ResetTokens | null>(null);

  useEffect(() => {
    // Extract tokens from URL WITHOUT creating a session
    // This prevents "Last sign in" from being updated until password is actually set
    const extractTokens = () => {
      try {
        // Check both hash fragment and query parameters
        // Some email clients convert # to ? or vice versa
        const hashFragment = window.location.hash;
        const searchParams = window.location.search;
        const fullUrl = window.location.href;
        
        let params: URLSearchParams;
        let accessToken: string | null = null;
        let refreshToken: string | null = null;
        let type: string | null = null;
        
        // Try to extract tokens from hash fragment first
        if (hashFragment) {
          params = new URLSearchParams(hashFragment.substring(1));
          accessToken = params.get('access_token');
          refreshToken = params.get('refresh_token');
          type = params.get('type');
        }
        
        // If not found in hash, try query parameters
        if (!accessToken && searchParams) {
          params = new URLSearchParams(searchParams.substring(1));
          accessToken = params.get('access_token');
          refreshToken = params.get('refresh_token');
          type = params.get('type');
        }
        
        // Try to extract from full URL if email client modified the format
        // Some email clients (especially Outlook) strip # and convert to ? or modify the URL structure
        // Outlook may also wrap links in redirects or add tracking parameters
        if (!accessToken) {
          // Try multiple extraction strategies for email client modifications
          
          // Strategy 1: Direct regex match (handles broken URLs)
          const tokenMatch = fullUrl.match(/access_token=([^&#\s"']+)/);
          const refreshMatch = fullUrl.match(/refresh_token=([^&#\s"']+)/);
          const typeMatch = fullUrl.match(/[&?]type=([^&#\s"']+)/);
          
          if (tokenMatch) {
            try {
              accessToken = decodeURIComponent(tokenMatch[1]);
              // Handle URL-encoded tokens
              if (accessToken.includes('%')) {
                accessToken = decodeURIComponent(accessToken);
              }
            } catch (e) {
              // If decode fails, use raw token
              accessToken = tokenMatch[1];
            }
            
            if (refreshMatch) {
              try {
                refreshToken = decodeURIComponent(refreshMatch[1]);
                if (refreshToken.includes('%')) {
                  refreshToken = decodeURIComponent(refreshToken);
                }
              } catch (e) {
                refreshToken = refreshMatch[1];
              }
            }
            
            if (typeMatch) {
              type = decodeURIComponent(typeMatch[1]);
            }
          }
          
          // Strategy 2: Try to extract from URL after redirect unwrapping
          // Some email clients wrap links in redirect URLs
          if (!accessToken && fullUrl.includes('redirect') || fullUrl.includes('url=')) {
            const redirectMatch = fullUrl.match(/[?&]url=([^&]+)/);
            if (redirectMatch) {
              const unwrappedUrl = decodeURIComponent(redirectMatch[1]);
              const unwrappedTokenMatch = unwrappedUrl.match(/access_token=([^&#\s"']+)/);
              if (unwrappedTokenMatch) {
                accessToken = unwrappedTokenMatch[1];
                const unwrappedRefreshMatch = unwrappedUrl.match(/refresh_token=([^&#\s"']+)/);
                if (unwrappedRefreshMatch) {
                  refreshToken = unwrappedRefreshMatch[1];
                }
              }
            }
          }
          
          // Strategy 3: Try extracting from base64 encoded or other encodings
          // Some email clients encode the entire URL
          if (!accessToken && fullUrl.length > 500) {
            // Long URLs might have encoded tokens
            const encodedMatch = fullUrl.match(/access_token%3D([^%&]+)/);
            if (encodedMatch) {
              accessToken = decodeURIComponent(encodedMatch[1].replace(/%3D/g, '='));
            }
          }
        }

        console.log('Password reset token extraction:', { 
          hasHash: !!hashFragment,
          hasSearch: !!searchParams,
          hasAccessToken: !!accessToken, 
          hasRefreshToken: !!refreshToken, 
          type,
          fullUrl: fullUrl.substring(0, 200) // Log first 200 chars to avoid logging full tokens
        });

        // Verify this is a recovery/password setup or reset link
        // Note: Supabase uses 'recovery' type for both new user setup and password reset
        if (!accessToken) {
          console.error('No access token found in URL after all extraction attempts:', {
            hasHash: !!hashFragment,
            hasSearch: !!searchParams,
            urlLength: fullUrl.length,
            urlPreview: fullUrl.substring(0, 300)
          });
          
          setError(
            <div>
              <p className="mb-4">The password setup link appears to be corrupted or modified by your email client.</p>
              <p className="mb-4"><strong>This often happens when:</strong></p>
              <ul className="list-disc list-inside mb-4 space-y-1">
                <li>Your email client (Outlook) marked the sender as untrusted</li>
                <li>The link was modified by email security scanning</li>
                <li>The link was copied incorrectly</li>
              </ul>
              <p className="mb-4"><strong>Solutions:</strong></p>
              <ol className="list-decimal list-inside mb-4 space-y-1">
                <li>Try copying the entire link from the email and pasting it directly into your browser</li>
                <li>Mark orders@qiqiglobal.com as a trusted sender in Outlook</li>
                <li>Contact your administrator to send a new password setup link</li>
              </ol>
              <p className="text-sm text-gray-600">If the problem persists, please contact your administrator.</p>
            </div>
          );
          setIsValidating(false);
          return;
        }

        if (type && type !== 'recovery') {
          console.error('Invalid link type:', type);
          setError('Invalid password setup link type. Please request a new link.');
          setIsValidating(false);
          return;
        }

        // Store tokens WITHOUT creating a session yet
        // This prevents "Last sign in" from being updated until password is set
        setResetTokens({
          accessToken,
          refreshToken: refreshToken || '',
          type: type || 'recovery'
        });

        // Clear the URL to remove tokens from address bar
        window.history.replaceState({}, '', window.location.pathname);

        console.log('Tokens extracted successfully, ready for password setup');
        setIsValidating(false);
      } catch (err: any) {
        console.error('Error extracting tokens:', err);
        setError(`An error occurred while processing the password setup link: ${err.message || 'Unknown error'}. Please try requesting a new link.`);
        setIsValidating(false);
      }
    };

    extractTokens();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    // Validate passwords match
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      setIsSubmitting(false);
      return;
    }

    // Validate password length
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      setIsSubmitting(false);
      return;
    }

    try {
      // Check if we have valid tokens
      if (!resetTokens || !resetTokens.accessToken) {
        setError('Password setup tokens are missing. Please click the link in your email again.');
        setIsSubmitting(false);
        return;
      }

      // NOW create the session (only when user is actually setting password)
      // This ensures "Last sign in" is only updated when password is successfully set
      const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
        access_token: resetTokens.accessToken,
        refresh_token: resetTokens.refreshToken
      });

      if (sessionError || !sessionData.session) {
        console.error('Session error:', sessionError);
        const errorMessage = sessionError?.message?.toLowerCase() || '';
        if (errorMessage.includes('expired') || errorMessage.includes('jwt expired')) {
          setError('This password setup link has expired. Setup links are valid for 24 hours. Please contact your administrator to send you a new password setup link.');
        } else if (errorMessage.includes('invalid') || errorMessage.includes('token') || errorMessage.includes('malformed')) {
          setError('Invalid password setup link. The link may have been corrupted. Please request a new link from your administrator.');
        } else {
          setError(`Failed to validate password setup link: ${sessionError?.message || 'Unknown error'}. Please request a new one from your administrator.`);
        }
        setIsSubmitting(false);
        return;
      }

      // Update the password
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) {
        // Sign out if password update fails to avoid leaving user in a session state
        await supabase.auth.signOut();
        const errorMessage = error.message?.toLowerCase() || '';
        if (errorMessage.includes('expired') || errorMessage.includes('invalid') || errorMessage.includes('token') || errorMessage.includes('session')) {
          setError('Your session has expired. Password setup links are valid for 24 hours. Please request a new password setup link from your administrator.');
        } else {
          setError(error.message);
        }
      } else {
        // Sign out after password is set (don't auto-login)
        // This ensures "Last sign in" timestamp accurately reflects when password was set
        await supabase.auth.signOut();
        setSuccess(true);
      }
    } catch (err: any) {
      const errorMessage = err?.message?.toLowerCase() || '';
      if (errorMessage.includes('expired') || errorMessage.includes('invalid') || errorMessage.includes('token') || errorMessage.includes('session')) {
        setError('Your session has expired. Password setup links are valid for 24 hours. Please request a new password setup link from your administrator.');
      } else {
        setError('An unexpected error occurred. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isValidating) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="w-full max-w-md p-8 bg-white rounded-lg shadow-lg">
          <div className="text-center">
            <Spinner className="h-8 w-8 mx-auto" />
            <p className="mt-4 text-gray-600">Validating your reset link...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md p-8 bg-white rounded-lg shadow-lg">
        <div className="text-center mb-6">
          <img
            src="/logo.png"
            alt="Qiqi Logo"
            className="h-12 mx-auto mb-4"
          />
          <Typography variant="h4" className="font-bold text-gray-800">
            Set Your Password
          </Typography>
          <Typography variant="small" className="text-gray-600 mt-2">
            Choose a secure password for your account
          </Typography>
        </div>

        {error && !success && (
          <Alert color="red" className="mb-4">
            {typeof error === 'string' ? error : <div>{error}</div>}
          </Alert>
        )}

        {success ? (
          <div className="text-center py-8">
            <div className="text-green-600 text-5xl mb-4">✓</div>
            <Typography variant="h5" className="text-gray-800 mb-2">
              Password Set Successfully!
            </Typography>
            <Typography variant="small" className="text-gray-600 mb-4">
              Your password has been updated. You can now log in to your account.
            </Typography>
            <Link
              href="/"
              className="inline-block bg-black text-white px-8 py-3 rounded-md hover:opacity-90 transition font-medium mt-4"
            >
              Go to Login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                New Password *
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                disabled={isSubmitting}
                minLength={6}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black disabled:bg-gray-100"
                placeholder="Enter your password"
              />
              <p className="text-xs text-gray-500 mt-1">Minimum 6 characters</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Confirm Password *
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                disabled={isSubmitting}
                minLength={6}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black disabled:bg-gray-100"
                placeholder="Confirm your password"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-black text-white px-6 py-3 rounded-md hover:opacity-90 transition disabled:opacity-50 font-medium"
            >
              {isSubmitting ? 'Setting Password...' : 'Set Password'}
            </button>
          </form>
        )}

        <div className="mt-6 text-center">
          <Typography variant="small" className="text-gray-600">
            Need help?{' '}
            <Link href="/" className="text-black hover:underline">
              Back to Login
            </Link>
          </Typography>
        </div>
      </div>
    </div>
  );
}

