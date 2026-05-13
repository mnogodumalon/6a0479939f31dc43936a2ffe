import { useEffect, useMemo, useRef, useState } from 'react';
import { IconCheck, IconChevronDown, IconSearch, IconX } from '@tabler/icons-react';

interface ComboboxItem {
  id: string;
  label: string;
  hint?: string;
  initials?: string;
  avatarColor?: string;
}

interface ComboboxProps {
  items: ComboboxItem[];
  value: string | null | undefined;
  onChange: (id: string | null) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  id?: string;
  invalid?: boolean;
}

const AVATAR_PALETTE = [
  '#1e3a8a', '#7c3aed', '#db2777', '#ea580c', '#16a34a',
  '#0891b2', '#4338ca', '#be123c', '#047857', '#9333ea',
];

function colorFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length];
}

function initialsFor(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Combobox({
  items, value, onChange,
  placeholder = '—',
  searchPlaceholder = 'Suchen…',
  emptyText = 'Kein Treffer',
  disabled = false,
  id,
  invalid = false,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = items.find(i => i.id === value) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(i =>
      i.label.toLowerCase().includes(q) ||
      (i.hint ?? '').toLowerCase().includes(q)
    );
  }, [items, query]);

  useEffect(() => { setActiveIdx(0); }, [query, open]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!popRef.current?.contains(e.target as Node) && !triggerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = filtered[activeIdx];
      if (item) { onChange(item.id); setOpen(false); setQuery(''); }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
        className={`flex h-10 w-full items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm
          ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2
          disabled:cursor-not-allowed disabled:opacity-50
          ${invalid ? 'border-destructive' : 'border-input'}`}
      >
        {selected ? (
          <>
            <span
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
              style={{ background: selected.avatarColor ?? colorFor(selected.id) }}
            >
              {selected.initials ?? initialsFor(selected.label)}
            </span>
            <span className="flex-1 min-w-0 truncate text-left">{selected.label}</span>
            {selected.hint && <span className="hidden sm:inline shrink-0 text-xs text-muted-foreground">{selected.hint}</span>}
            <button
              type="button"
              onClick={e => { e.stopPropagation(); onChange(null); }}
              className="shrink-0 rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Auswahl entfernen"
            >
              <IconX size={14} />
            </button>
          </>
        ) : (
          <span className="flex-1 truncate text-left text-muted-foreground">{placeholder}</span>
        )}
        <IconChevronDown size={14} className="shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <div
          ref={popRef}
          className="absolute left-0 right-0 z-50 mt-1 max-h-72 overflow-hidden rounded-lg border bg-popover shadow-lg"
        >
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <IconSearch size={14} className="text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKey}
              placeholder={searchPlaceholder}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="rounded-full p-0.5 text-muted-foreground hover:bg-muted"
                aria-label="Suche leeren"
              >
                <IconX size={12} />
              </button>
            )}
          </div>
          <div className="max-h-60 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-muted-foreground">{emptyText}</div>
            ) : filtered.map((item, idx) => {
              const active = idx === activeIdx;
              const isSel = item.id === value;
              return (
                <button
                  key={item.id}
                  type="button"
                  onMouseEnter={() => setActiveIdx(idx)}
                  onClick={() => { onChange(item.id); setOpen(false); setQuery(''); }}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm
                    ${active ? 'bg-accent' : ''}`}
                >
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
                    style={{ background: item.avatarColor ?? colorFor(item.id) }}
                  >
                    {item.initials ?? initialsFor(item.label)}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block truncate font-medium">{item.label}</span>
                    {item.hint && <span className="block truncate text-[11px] text-muted-foreground">{item.hint}</span>}
                  </span>
                  {isSel && <IconCheck size={14} className="shrink-0 text-primary" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
