'use client';

/**
 * FeedbackPopup — the in-app "Issue / Idea" capture dialog reached from
 * the topbar Feedback button. Submits to /api/feedback/submit which emails
 * the configured Qiqi inbox.
 *
 * Re-implemented on qq Dialog so it shares the rest of the redesign's
 * visual language. The legacy popup positioned itself relative to its
 * trigger button — the new Dialog centers itself, so the `buttonRef`
 * prop is now optional and kept only for backwards compatibility.
 */

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Lightbulb, ArrowLeft, Paperclip, Send, X } from 'lucide-react';

import { supabase } from '../../../lib/supabaseClient';
import { fetchWithAuth } from '../../../lib/fetchWithAuth';
import { useToast } from './ToastProvider';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../qq/dialog';
import { Button } from '../qq/button';
import { Alert, AlertDescription } from '../qq/alert';

type View = 'choice' | 'issue' | 'idea' | 'success';

interface FeedbackPopupProps {
  isOpen: boolean;
  onClose: () => void;
  /** @deprecated — no longer needed (Dialog is centered, not anchored). */
  buttonRef?: React.RefObject<HTMLButtonElement>;
}

export default function FeedbackPopup({ isOpen, onClose }: FeedbackPopupProps) {
  const toast = useToast();
  const [view, setView] = useState<View>('choice');
  const [text, setText] = useState('');
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [submittedType, setSubmittedType] = useState<'issue' | 'idea'>('idea');
  const submissionInProgress = useRef(false);

  // Cached user info for the API payload
  const [userName, setUserName] = useState('User');
  const [userEmail, setUserEmail] = useState('');

  // Reset every time the dialog opens
  useEffect(() => {
    if (!isOpen) return;
    setView('choice');
    setText('');
    setScreenshot(null);
    submissionInProgress.current = false;
    (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;
        const res = await fetchWithAuth(`/api/user-profile?userId=${user.id}`);
        const data = await res.json().catch(() => ({}));
        if (data?.success && data.user?.name) setUserName(data.user.name);
        setUserEmail(user.email || '');
      } catch {
        // non-fatal — the API can still send with fallbacks
      }
    })();
  }, [isOpen]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) setScreenshot(e.target.files[0]);
  };

  const handleSend = async () => {
    if (!text.trim() || sending || submissionInProgress.current) return;
    submissionInProgress.current = true;
    setSending(true);
    try {
      const formData = new FormData();
      formData.append('type', view);
      formData.append('text', text);
      formData.append('userName', userName);
      formData.append('userEmail', userEmail);
      if (screenshot && view === 'issue') formData.append('screenshot', screenshot);

      const res = await fetch('/api/feedback/submit', { method: 'POST', body: formData });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to send feedback');
      }
      setSubmittedType(view as 'issue' | 'idea');
      setView('success');
    } catch (err: any) {
      toast.error(err.message || 'Failed to send feedback. Please try again.');
      submissionInProgress.current = false;
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md p-0 overflow-hidden">
        {/* CHOICE */}
        {view === 'choice' && (
          <>
            <DialogHeader className="px-6 pt-6 pb-2">
              <DialogTitle>Share with Qiqi</DialogTitle>
            </DialogHeader>
            <div className="px-6 pb-6">
              <p className="text-sm text-muted-foreground mb-4">
                What would you like to share?
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setView('issue')}
                  className="group p-5 border border-border rounded-md hover:border-foreground/40 hover:bg-secondary/40 transition-colors text-left"
                >
                  <div className="h-9 w-9 rounded-md bg-brand-magenta/10 text-brand-magenta inline-flex items-center justify-center mb-3 group-hover:bg-brand-magenta/15 transition-colors">
                    <AlertTriangle className="h-4 w-4" />
                  </div>
                  <div className="text-sm font-medium">Issue</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Something broken
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setView('idea')}
                  className="group p-5 border border-border rounded-md hover:border-foreground/40 hover:bg-secondary/40 transition-colors text-left"
                >
                  <div className="h-9 w-9 rounded-md bg-brand-periwinkle/10 text-brand-periwinkle inline-flex items-center justify-center mb-3 group-hover:bg-brand-periwinkle/15 transition-colors">
                    <Lightbulb className="h-4 w-4" />
                  </div>
                  <div className="text-sm font-medium">Idea</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Suggest an improvement
                  </div>
                </button>
              </div>
            </div>
          </>
        )}

        {/* ISSUE / IDEA FORM */}
        {(view === 'issue' || view === 'idea') && (
          <>
            <DialogHeader className="px-6 pt-6 pb-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setView('choice');
                    setText('');
                    setScreenshot(null);
                  }}
                  className="h-6 w-6 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                  aria-label="Back"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <DialogTitle>
                  {view === 'issue' ? 'Report an issue' : 'Share an idea'}
                </DialogTitle>
              </div>
            </DialogHeader>
            <div className="px-6 pb-6 space-y-3">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={
                  view === 'issue'
                    ? 'I have an issue with…'
                    : "It would be great if…"
                }
                rows={5}
                autoFocus
                className="w-full px-3 py-2 text-sm border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 resize-y min-h-[120px]"
              />

              {view === 'issue' && (
                <p className="text-xs text-muted-foreground">
                  Stuck on something technical?{' '}
                  <a
                    href="mailto:orders@qiqiglobal.com"
                    target="_blank"
                    rel="noopener"
                    className="text-foreground underline hover:no-underline"
                  >
                    Email us directly
                  </a>
                  .
                </p>
              )}

              {screenshot && view === 'issue' && (
                <Alert>
                  <AlertDescription className="flex items-center justify-between gap-2">
                    <span className="truncate">
                      <Paperclip className="inline h-3.5 w-3.5 mr-1.5" />
                      {screenshot.name}{' '}
                      <span className="text-muted-foreground text-xs">
                        ({(screenshot.size / 1024).toFixed(1)} KB)
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setScreenshot(null)}
                      className="text-muted-foreground hover:text-foreground"
                      aria-label="Remove attachment"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                {view === 'issue' && !screenshot && (
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-input rounded-md hover:bg-secondary transition-colors">
                      <Paperclip className="h-3.5 w-3.5" />
                      Attach screenshot
                    </span>
                  </label>
                )}
                <Button onClick={handleSend} disabled={!text.trim() || sending} loading={sending}>
                  <Send className="h-3.5 w-3.5" />
                  Send
                </Button>
              </div>
            </div>
          </>
        )}

        {/* SUCCESS */}
        {view === 'success' && (
          <>
            <DialogHeader className="px-6 pt-6 pb-2">
              <DialogTitle>
                {submittedType === 'issue'
                  ? 'Issue reported'
                  : 'Thanks for the idea'}
              </DialogTitle>
            </DialogHeader>
            <div className="px-6 pb-6 space-y-4">
              <p className="text-sm text-muted-foreground">
                {submittedType === 'issue'
                  ? "We'll be in touch if your issue needs follow-up."
                  : "We don't always reply, but we read every suggestion — thank you."}
              </p>
              <div className="flex justify-end">
                <Button onClick={onClose}>Close</Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
