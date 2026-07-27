"use client";

import type { ComponentProps, KeyboardEvent, ReactNode } from "react";
import {
  Children,
  isValidElement,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

const CONTROL =
  "block w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-[0_1px_1px_rgba(15,23,42,0.03)] transition-colors placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500";

export function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
  htmlFor,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <label
        htmlFor={htmlFor}
        className="mb-1.5 flex items-center gap-1 text-[13px] font-medium text-slate-700"
      >
        {label}
        {required ? (
          <span className="text-rose-500" aria-hidden>
            *
          </span>
        ) : null}
      </label>
      {children}
      {error ? (
        <p className="mt-1.5 text-[12px] font-medium text-rose-600">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-[12px] leading-5 text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(CONTROL, "h-9", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(CONTROL, "py-2 leading-6", className)} {...props} />;
}

const SELECT_TRIGGER =
  "flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-slate-300 bg-white px-3 text-slate-900 shadow-[0_1px_1px_rgba(15,23,42,0.03)] transition-colors hover:border-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500";

type OptionData = { value: string; label: ReactNode; disabled: boolean };

/** Read the `<option>` children of a native-style select into plain data. */
function collectOptions(children: ReactNode): OptionData[] {
  const out: OptionData[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement(child) || child.type !== "option") return;
    const props = child.props as {
      value?: string | number;
      children?: ReactNode;
      disabled?: boolean;
    };
    out.push({
      value: String(props.value ?? ""),
      label: props.children,
      disabled: Boolean(props.disabled),
    });
  });
  return out;
}

/**
 * A single-select dropdown that matches {@link MultiSelect}: an animated chevron
 * and a styled option menu instead of the browser's native control. It accepts
 * the same `<option>` children as a native `<select>` and reports the chosen
 * value string through `onChange`. Supports controlled (`value`) and uncontrolled
 * (`defaultValue`) use, disabled options, and keyboard navigation.
 */
export function SelectMenu({
  value: controlledValue,
  defaultValue,
  onChange,
  children,
  id,
  disabled,
  required,
  placeholder,
  className,
  "aria-label": ariaLabel,
}: {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  children: ReactNode;
  id?: string;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  className?: string;
  "aria-label"?: string;
}) {
  const options = useMemo(() => collectOptions(children), [children]);
  const isControlled = controlledValue !== undefined;
  const [internal, setInternal] = useState(defaultValue ?? "");
  const value = isControlled ? controlledValue : internal;

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const baseId = useId();
  const listId = `${baseId}-list`;

  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;

  function openMenu() {
    const firstEnabled = options.findIndex((option) => !option.disabled);
    setActiveIndex(
      selectedIndex >= 0 && !options[selectedIndex]?.disabled ? selectedIndex : firstEnabled,
    );
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function onDocClick(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  function choose(next: string) {
    if (next !== value) {
      if (!isControlled) setInternal(next);
      onChange?.(next);
    }
    setOpen(false);
    buttonRef.current?.focus();
  }

  function moveActive(direction: 1 | -1) {
    const enabled = options.flatMap((option, index) => (option.disabled ? [] : [index]));
    if (enabled.length === 0) return;
    const position = enabled.indexOf(activeIndex);
    const nextPosition =
      position === -1
        ? direction === 1
          ? 0
          : enabled.length - 1
        : (position + direction + enabled.length) % enabled.length;
    setActiveIndex(enabled[nextPosition]);
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
        event.preventDefault();
        openMenu();
      }
      return;
    }
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        moveActive(1);
        break;
      case "ArrowUp":
        event.preventDefault();
        moveActive(-1);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        if (activeIndex >= 0 && options[activeIndex] && !options[activeIndex].disabled) {
          choose(options[activeIndex].value);
        }
        break;
      case "Escape":
        event.preventDefault();
        setOpen(false);
        break;
      case "Tab":
        setOpen(false);
        break;
    }
  }

  return (
    <div ref={containerRef} className={cn("relative w-full text-sm", className)}>
      <button
        ref={buttonRef}
        type="button"
        id={id}
        role="combobox"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-controls={open ? listId : undefined}
        aria-expanded={open}
        aria-required={required}
        aria-label={ariaLabel}
        aria-activedescendant={
          open && activeIndex >= 0 ? `${baseId}-opt-${activeIndex}` : undefined
        }
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
        className={cn(SELECT_TRIGGER, !selected && "text-slate-400")}
      >
        <span className="truncate">{selected ? selected.label : (placeholder ?? "Select…")}</span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-slate-400 transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {open ? (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1.5 max-h-60 w-max min-w-full max-w-[min(20rem,90vw)] overflow-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg shadow-slate-900/5"
        >
          {options.map((option, index) => {
            const isSelected = option.value === value;
            const isActive = index === activeIndex;
            return (
              <li
                key={`${option.value}-${index}`}
                id={`${baseId}-opt-${index}`}
                role="option"
                aria-selected={isSelected}
                aria-disabled={option.disabled || undefined}
                data-active={isActive || undefined}
                onMouseEnter={() => !option.disabled && setActiveIndex(index)}
                onClick={() => !option.disabled && choose(option.value)}
                className={cn(
                  "flex cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 text-[13px] text-slate-700",
                  isActive && !option.disabled && "bg-slate-100",
                  isSelected && "font-medium text-brand-700",
                  option.disabled && "cursor-not-allowed text-slate-300",
                )}
              >
                <span className="truncate">{option.label}</span>
                {isSelected ? (
                  <Check className="size-4 shrink-0 text-brand-600" aria-hidden />
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

export function Checkbox({
  label,
  description,
  className,
  id,
  ...props
}: ComponentProps<"input"> & { label: ReactNode; description?: ReactNode }) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <div className={cn("flex items-start gap-2.5", className)}>
      <input
        id={inputId}
        type="checkbox"
        className="mt-0.5 size-4 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-2 focus:ring-brand-500/30"
        {...props}
      />
      <label htmlFor={inputId} className="min-w-0 cursor-pointer select-none">
        <span className="block text-[13px] font-medium leading-5 text-slate-800">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-[12px] leading-5 text-slate-500">{description}</span>
        ) : null}
      </label>
    </div>
  );
}

export function FormError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <div
      role="alert"
      className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-[13px] font-medium text-rose-700"
    >
      {children}
    </div>
  );
}
