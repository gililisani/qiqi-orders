'use client';

/**
 * Admin-only: set a manual unit price on one order line (or put it back on
 * the catalog price). The price is saved with the order — the server keeps
 * it through later client edits and logs every change in the internal order
 * history.
 */

import React, { useEffect, useState } from 'react';
import { formatCurrency } from '../../../lib/formatters';
import { MAX_MANUAL_UNIT_PRICE } from '../../../lib/orderSave';

import { Button } from '../qq/button';
import { Input } from '../qq/input';
import { Label } from '../qq/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../qq/dialog';

export interface ManualPriceTarget {
  productId: number;
  isSupportFund: boolean;
  sku: string;
  name: string;
  /** Catalog price at the company's tier (null = the catalog has none). */
  catalogPrice: number | null;
  tierLabel: string;
  currentPrice: number;
  isManual: boolean;
}

export function ManualPriceDialog({
  target,
  onClose,
  onApply,
}: {
  target: ManualPriceTarget | null;
  onClose: () => void;
  /** null = back to the catalog price. */
  onApply: (price: number | null) => void;
}) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (target) {
      setValue(String(target.currentPrice));
      setError(null);
    }
  }, [target]);

  const submit = () => {
    const n = Number(value.trim());
    if (value.trim() === '' || !Number.isFinite(n) || n < 0 || n > MAX_MANUAL_UNIT_PRICE) {
      setError('Enter a price of 0 or more.');
      return;
    }
    const price = Math.round(n * 100) / 100;
    // Typing the catalog price back in is the same as resetting it.
    const catalog = target?.catalogPrice ?? null;
    onApply(catalog !== null && Math.abs(price - catalog) < 0.005 ? null : price);
  };

  return (
    <Dialog open={!!target} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Set unit price</DialogTitle>
          <DialogDescription>
            {target ? `${target.sku} · ${target.name}` : ''}
          </DialogDescription>
        </DialogHeader>
        {target && (
          <div className="space-y-3 py-1">
            {target.catalogPrice !== null ? (
              <p className="text-sm text-muted-foreground">
                Catalog price ({target.tierLabel}):{' '}
                <span className="font-mono text-foreground">{formatCurrency(target.catalogPrice)}</span>
              </p>
            ) : (
              <p className="text-sm text-amber-700">
                The catalog has no {target.tierLabel} price for this product — the line needs a
                manual price (or remove it from the order).
              </p>
            )}
            <div>
              <Label htmlFor="manual-price" className="text-sm font-medium">
                Price per unit (USD)
              </Label>
              <Input
                id="manual-price"
                inputMode="decimal"
                autoFocus
                onFocus={(e) => e.target.select()}
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    submit();
                  }
                }}
                className="mt-1.5 font-mono"
              />
              {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
            </div>
            <p className="text-xs text-muted-foreground">
              Applies to this order only and is kept if the client edits the order. The
              client sees the new price; the change is logged in the internal order history.
            </p>
          </div>
        )}
        <DialogFooter className="gap-2 sm:gap-2">
          {target?.isManual && target.catalogPrice !== null && (
            <Button variant="outline" onClick={() => onApply(null)} className="sm:mr-auto">
              Use catalog price
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit}>Set price</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
