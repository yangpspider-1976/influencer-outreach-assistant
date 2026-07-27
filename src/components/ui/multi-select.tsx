"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

const TRIGGER =
  "flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-[0_1px_1px_rgba(15,23,42,0.03)] transition-colors hover:border-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500";

/**
 * A dropdown that selects any number of options with checkboxes. Closes on
 * outside click or Escape. Selection is controlled by the parent.
 */
export function MultiSelect({
  id,
  options,
  selected,
  onChange,
  placeholder = "Select…",
  allLabel = "All selected",
  disabled,
}: {
  id?: string;
  options: readonly string[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  allLabel?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const allSelected = options.length > 0 && selected.length === options.length;

  function toggle(option: string) {
    onChange(
      selected.includes(option)
        ? selected.filter((value) => value !== option)
        : [...selected, option],
    );
  }

  function toggleAll() {
    onChange(allSelected ? [] : [...options]);
  }

  const summary =
    selected.length === 0
      ? placeholder
      : allSelected
        ? allLabel
        : selected.length === 1
          ? selected[0]
          : `${selected[0]} +${selected.length - 1} more`;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        id={id}
        onClick={() => setOpen((value) => !value)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(TRIGGER, selected.length === 0 && "text-slate-400")}
      >
        <span className="truncate">{summary}</span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-slate-400 transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {open ? (
        <div
          className="absolute z-20 mt-1.5 w-full min-w-[220px] rounded-lg border border-slate-200 bg-white p-1 shadow-lg shadow-slate-900/5"
          role="listbox"
          aria-multiselectable
        >
          <div className="flex items-center justify-between px-2 py-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              {selected.length} selected
            </span>
            <button
              type="button"
              onClick={toggleAll}
              className="text-[12px] font-medium text-brand-600 hover:text-brand-700"
            >
              {allSelected ? "Clear all" : "Select all"}
            </button>
          </div>
          <ul className="max-h-56 overflow-auto">
            {options.map((option) => {
              const checked = selected.includes(option);
              return (
                <li key={option}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={checked}
                    onClick={() => toggle(option)}
                    className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] text-slate-700 hover:bg-slate-50"
                  >
                    <span
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
                        checked
                          ? "border-brand-600 bg-brand-600 text-white"
                          : "border-slate-300 bg-white",
                      )}
                    >
                      {checked ? <Check className="size-3" aria-hidden /> : null}
                    </span>
                    <span className="truncate">{option}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
