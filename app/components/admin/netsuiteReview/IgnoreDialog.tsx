'use client';

/** Ignore one or more NetSuite documents — a reason is required. */

import { useEffect, useState } from 'react';
import { Button } from '../../qq/button';
import { Input } from '../../qq/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../qq/dialog';

const QUICK = ['Private label', 'Not a Qiqi product', 'Duplicate in NetSuite', 'Billed to the wrong customer'];

export function IgnoreDialog({
  count,
  saving,
  onClose,
  onConfirm,
}: {
  count: number; // 0 = closed
  saving: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  useEffect(() => setReason(''), [count]);

  return (
    <Dialog open={count > 0} onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Ignore {count === 1 ? 'this document' : `${count} documents`}</DialogTitle>
          <DialogDescription>Ignored documents never count toward sales. Say why, for whoever reviews this later.</DialogDescription>
        </DialogHeader>
        <Input autoFocus placeholder="Reason" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
        <div className="flex flex-wrap gap-2">
          {QUICK.map((q) => (
            <Button key={q} type="button" size="sm" variant="secondary" onClick={() => setReason(q)}>
              {q}
            </Button>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => onConfirm(reason.trim())} disabled={!reason.trim() || saving} loading={saving}>
            Ignore
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
