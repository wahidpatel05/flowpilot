"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { isNavigationKey, nextActiveIndex } from "../lib/listboxNavigation";

export interface SelectOption {
  value: string;
  /** The line to lead with. */
  primary: string;
  /** Supporting detail, shown smaller beside it. */
  secondary?: string;
}

/**
 * A dropdown in the brand's neo-brutalist style.
 *
 * A native `<select>` is styleable only down to its box — the popup itself is
 * drawn by the OS and cannot carry the hard stroke and offset shadow the rest
 * of the app uses. So this is a custom listbox, which means re-earning what
 * the native element gave away for free: full keyboard support (arrows with
 * wrapping, Home/End, Enter/Space, Escape), the ARIA listbox roles a screen
 * reader needs, click-outside dismissal, and focus returning to the trigger on
 * close.
 */
export function Select({
  options,
  value,
  onChange,
  placeholder = "Choose…",
  ariaLabel,
}: {
  options: readonly SelectOption[];
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const optionRefs = useRef<(HTMLLIElement | null)[]>([]);
  const listboxId = useId();

  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    setActiveIndex(-1);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  // Opening highlights whatever is already chosen, so the list starts where
  // the clerk left it rather than at the top.
  const openList = useCallback(() => {
    setOpen(true);
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }, [selectedIndex]);

  const commit = useCallback(
    (index: number) => {
      const option = options[index];
      if (option === undefined) return;
      onChange(option.value);
      close(true);
    },
    [options, onChange, close],
  );

  // Dismiss on a click anywhere else. pointerdown rather than click so the
  // list closes on press, matching how a native select behaves.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current?.contains(event.target as Node) === true) return;
      close(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, close]);

  // Keep the highlighted option in view when arrowing through a long list.
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    optionRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      if (open) {
        event.preventDefault();
        close(true);
      }
      return;
    }

    if (event.key === "Tab") {
      if (open) close(false);
      return;
    }

    if (!open) {
      // Any of the opening keys should reveal the list, not move a highlight
      // that isn't visible yet.
      if (isNavigationKey(event.key) || event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openList();
      }
      return;
    }

    if (isNavigationKey(event.key)) {
      event.preventDefault();
      // Captured before the updater runs: re-reading event.key inside the
      // callback would lose the narrowing isNavigationKey just established.
      const key = event.key;
      setActiveIndex((current) => nextActiveIndex(current, key, options.length));
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      commit(activeIndex);
    }
  }

  return (
    <div className="fp-select" ref={rootRef} onKeyDown={onKeyDown}>
      <button
        type="button"
        ref={triggerRef}
        className="fp-select-trigger"
        data-open={open ? "true" : undefined}
        data-placeholder={selected === undefined ? "true" : undefined}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label={ariaLabel}
        onClick={() => (open ? close(false) : openList())}
      >
        <span className="fp-select-value">
          {selected === undefined ? (
            placeholder
          ) : (
            <>
              <span className="fp-select-primary">{selected.primary}</span>
              {selected.secondary !== undefined ? (
                <span className="fp-select-secondary">{selected.secondary}</span>
              ) : null}
            </>
          )}
        </span>
        <span className="fp-select-chevron" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </button>

      {open ? (
        <ul
          className="fp-select-list"
          id={listboxId}
          role="listbox"
          aria-label={ariaLabel}
          aria-activedescendant={
            activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined
          }
          tabIndex={-1}
        >
          {options.map((option, index) => (
            <li
              key={option.value}
              id={`${listboxId}-option-${index}`}
              ref={(node) => {
                optionRefs.current[index] = node;
              }}
              className="fp-select-option"
              role="option"
              aria-selected={option.value === value}
              data-active={index === activeIndex ? "true" : undefined}
              onPointerEnter={() => setActiveIndex(index)}
              onClick={() => commit(index)}
            >
              <span className="fp-select-primary">{option.primary}</span>
              {option.secondary !== undefined ? (
                <span className="fp-select-secondary">{option.secondary}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
