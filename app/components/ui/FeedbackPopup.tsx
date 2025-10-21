'use client';

import { useState, useRef, useEffect } from 'react';
import { supabase } from '../../../lib/supabaseClient';

type FeedbackView = 'choice' | 'issue' | 'idea' | 'success';

interface FeedbackPopupProps {
  isOpen: boolean;
  onClose: () => void;
  buttonRef: React.RefObject<HTMLButtonElement>;
}

export default function FeedbackPopup({ isOpen, onClose, buttonRef }: FeedbackPopupProps) {
  const [view, setView] = useState<FeedbackView>('choice');
  const [text, setText] = useState('');
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [userName, setUserName] = useState('User');
  const [userEmail, setUserEmail] = useState('');
  const [submittedType, setSubmittedType] = useState<'issue' | 'idea'>('idea');
  const popupRef = useRef<HTMLDivElement>(null);
  const submissionInProgress = useRef(false);

  useEffect(() => {
    if (isOpen) {
      fetchUserData();
      setView('choice');
      setText('');
      setScreenshot(null);
      submissionInProgress.current = false; // Reset flag when reopening
    }
  }, [isOpen]);

  const fetchUserData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const response = await fetch(`/api/user-profile?userId=${user.id}`);
        const data = await response.json();
        if (data.success && data.user?.name) {
          setUserName(data.user.name);
        }
        setUserEmail(user.email || '');
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        popupRef.current &&
        !popupRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose, buttonRef]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setScreenshot(e.target.files[0]);
    }
  };

  const handleSend = async () => {
    if (!text.trim() || sending || submissionInProgress.current) return;

    console.log('🚀 Starting feedback submission...');
    submissionInProgress.current = true;
    setSending(true);
    
    try {
      const formData = new FormData();
      formData.append('type', view);
      formData.append('text', text);
      formData.append('userName', userName);
      formData.append('userEmail', userEmail);
      
      if (screenshot && view === 'issue') {
        formData.append('screenshot', screenshot);
      }

      console.log('📤 Sending feedback to API...');
      const response = await fetch('/api/feedback/submit', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to send feedback');
      }

      console.log('✅ Feedback sent successfully');
      setSubmittedType(view as 'issue' | 'idea');
      setView('success');
    } catch (error: any) {
      console.error('❌ Error sending feedback:', error);
      alert(error.message || 'Failed to send feedback. Please try again.');
      submissionInProgress.current = false; // Reset on error
    } finally {
      setSending(false);
      // Keep submissionInProgress true to prevent any further submissions
    }
  };

  if (!isOpen) return null;

  // Calculate position based on button
  const getPopupPosition = () => {
    if (!buttonRef.current) return {};
    const rect = buttonRef.current.getBoundingClientRect();
    return {
      position: 'fixed' as const,
      top: `${rect.bottom + 8}px`,
      right: `${window.innerWidth - rect.right}px`,
    };
  };

  return (
    <div
      ref={popupRef}
      style={getPopupPosition()}
      className="bg-white rounded-lg shadow-xl border border-gray-200 z-50 w-96"
    >
      {view === 'choice' && (
        <div className="p-6">
          <h3 className="text-sm text-gray-600 mb-4">What would you like to share?</h3>
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => setView('issue')}
              className="p-6 border-2 border-gray-200 rounded-lg hover:border-red-500 hover:bg-red-50 transition-all text-center group"
            >
              <div className="flex justify-center mb-3">
                <svg className="w-10 h-10 text-gray-400 group-hover:text-red-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="text-sm text-gray-900 group-hover:text-red-600 transition-colors">Issue</div>
              <div className="text-xs text-gray-500 group-hover:text-red-500 transition-colors mt-1">with the system</div>
            </button>
            <button
              onClick={() => setView('idea')}
              className="p-6 border-2 border-gray-200 rounded-lg hover:border-yellow-500 hover:bg-gray-50 transition-all text-center group"
            >
              <div className="flex justify-center mb-3">
                <svg className="w-10 h-10 text-gray-400 group-hover:text-yellow-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <div className="text-sm text-gray-900 group-hover:text-yellow-600 transition-colors">Idea</div>
              <div className="text-xs text-gray-500 group-hover:text-yellow-600 transition-colors mt-1">To Improve Qiqi</div>
            </button>
          </div>
        </div>
      )}

      {(view === 'issue' || view === 'idea') && (
        <div className="p-6">
          <button
            onClick={() => {
              setView('choice');
              setText('');
              setScreenshot(null);
            }}
            className="text-sm text-gray-500 hover:text-gray-700 mb-3"
          >
            ← Back
          </button>
          
          <h3 className="text-lg font-semibold mb-4">
            {view === 'issue' ? 'Report an Issue' : 'Share Your Idea'}
          </h3>
          
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={view === 'issue' ? 'I have an issue with.....' : 'It would be great if.....'}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black resize-none"
            rows={4}
          />

          {view === 'issue' && (
            <div className="mt-3 flex items-center justify-between text-sm">
              <div className="text-gray-600">
                Have technical issue? Contact{' '}
                <a href="mailto:orders@qiqiglobal.com" className="text-blue-600 hover:underline">
                  Orders
                </a>
              </div>
            </div>
          )}

          <div className="mt-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {view === 'issue' && (
                <label className="cursor-pointer">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <div className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 flex items-center gap-1">
                    📎 {screenshot ? screenshot.name.substring(0, 15) + '...' : 'Screenshot'}
                  </div>
                </label>
              )}
            </div>
            
            <button
              onClick={handleSend}
              disabled={!text.trim() || sending}
              className="px-4 py-2 bg-black text-white rounded hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm"
            >
              {sending ? 'Sending...' : 'Send'}
            </button>
          </div>
        </div>
      )}

      {view === 'success' && (
        <div className="p-6 text-center">
          <h3 className="text-sm font-normal mb-2">
            {submittedType === 'issue' ? 'Your issue has been reported!' : 'Your feedback has been sent. Thanks!'}
          </h3>
          <p className="text-xs text-gray-600 mb-6">
            {submittedType === 'issue' ? (
              'We will be in touch with you soon if your issue requires it.'
            ) : (
              'We do not always respond to feedback, but we are taking it very seriously and appreciate your help!'
            )}
          </p>
          <div className="flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-1.5 text-sm bg-black text-white rounded hover:bg-gray-800"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

