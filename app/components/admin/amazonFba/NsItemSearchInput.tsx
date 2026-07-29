'use client';

/**
 * Debounced NetSuite item search box (backed by /api/netsuite/amazon-fba/item-search).
 * Calls onSelect with the picked item; shows the current selection inline.
 */

import { useEffect, useRef, useState } from 'react';
import { fetchWithAuth } from '../../../../lib/fetchWithAuth';
import { Input } from '../../qq/input';

export interface NsItem {
  id: string;
  itemid: string;
  displayname?: string;
}

export function NsItemSearchInput({
  selected,
  onSelect,
  placeholder = 'Search NetSuite items…',
}: {
  selected: NsItem | null;
  onSelect: (item: NsItem | null) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<NsItem[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const id = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetchWithAuth(
          `/api/netsuite/amazon-fba/item-search?q=${encodeURIComponent(query.trim())}`
        );
        const data = await res.json();
        if (res.ok) setResults(data.items || []);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(id);
  }, [query]);

  return (
    <div className="relative" ref={boxRef}>
      <Input
        value={selected ? selected.itemid : query}
        onChange={(e) => {
          if (selected) onSelect(null);
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
      />
      {open && !selected && (query.trim().length >= 2 || results.length > 0) && (
        <ul className="absolute z-20 mt-1 w-full max-h-56 overflow-auto border border-border bg-background rounded-md shadow-md">
          {searching && <li className="px-3 py-2 text-xs text-muted-foreground">Searching…</li>}
          {!searching && results.length === 0 && (
            <li className="px-3 py-2 text-xs text-muted-foreground">No items found.</li>
          )}
          {results.map((item) => (
            <li
              key={item.id}
              onClick={() => {
                onSelect(item);
                setQuery('');
                setOpen(false);
              }}
              className="px-3 py-2 text-sm cursor-pointer hover:bg-muted"
            >
              <span className="font-mono text-xs mr-2">{item.itemid}</span>
              <span className="text-muted-foreground text-xs">{item.displayname || ''}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
