import React, { useState, useRef, useEffect, useId, useCallback } from 'react';
import { createPortal } from 'react-dom';

export interface CustomSelectOption {
  value: string | number;
  label: string;
  disabled?: boolean;
}

export interface CustomSelectProps {
  value: string | number;
  onChange: (value: string) => void;
  options: CustomSelectOption[];
  ariaLabel?: string;
  'aria-label'?: string;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  style?: React.CSSProperties;
  shellStyle?: React.CSSProperties;
  id?: string;
  name?: string;
}

export const CustomSelect: React.FC<CustomSelectProps> = ({
  value,
  onChange,
  options,
  ariaLabel: ariaLabelProp,
  'aria-label': ariaLabelAttr,
  disabled = false,
  className,
  triggerClassName,
  style,
  shellStyle,
  id,
  name,
}) => {
  const ariaLabel = ariaLabelProp || ariaLabelAttr;
  const [isOpen, setIsOpen] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const generatedId = useId();
  const listboxId = id ? `${id}-listbox` : `cfg-select-listbox-${generatedId}`;

  const currentOption = options.find((opt) => String(opt.value) === String(value)) ?? options[0];
  const currentLabel = currentOption ? currentOption.label : '';

  const [activeIndex, setActiveIndex] = useState<number>(() => {
    const idx = options.findIndex((opt) => String(opt.value) === String(value));
    return idx >= 0 ? idx : 0;
  });

  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});

  const updateMenuPosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const menuEl = menuRef.current;
    const menuWidth = menuEl ? menuEl.offsetWidth : rect.width;
    const menuHeight = menuEl ? menuEl.offsetHeight : 180;

    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const spaceAbove = rect.top - 8;
    const dropUp = spaceBelow < menuHeight && spaceAbove > spaceBelow;

    const top = dropUp
      ? Math.max(8, rect.top - menuHeight - 4)
      : Math.min(window.innerHeight - menuHeight - 8, rect.bottom + 4);

    let left = rect.left;
    if (left + menuWidth > window.innerWidth - 8) {
      left = Math.max(8, rect.right - menuWidth);
    }

    setMenuStyle({
      top: `${top}px`,
      left: `${left}px`,
      minWidth: `${rect.width}px`,
    });
  }, []);

  const closeMenu = useCallback((restoreFocus = false) => {
    setIsOpen(false);
    if (restoreFocus) {
      triggerRef.current?.focus();
    }
  }, []);

  const openMenu = useCallback(() => {
    if (disabled) return;
    const idx = options.findIndex((opt) => String(opt.value) === String(value));
    setActiveIndex(idx >= 0 ? idx : 0);
    setIsOpen(true);
  }, [disabled, options, value]);

  const selectOption = useCallback(
    (optValue: string | number, isDisabled?: boolean) => {
      if (isDisabled) return;
      const valStr = String(optValue);
      onChange(valStr);
      if (selectRef.current && selectRef.current.value !== valStr) {
        selectRef.current.value = valStr;
        selectRef.current.dispatchEvent(new Event('change', { bubbles: true }));
      }
      closeMenu(true);
    },
    [onChange, closeMenu]
  );

  // Position update when menu opens
  useEffect(() => {
    if (!isOpen) return;
    updateMenuPosition();

    const handleScrollOrResize = () => {
      updateMenuPosition();
    };

    window.addEventListener('scroll', handleScrollOrResize, { passive: true, capture: true });
    window.addEventListener('resize', handleScrollOrResize);

    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, { capture: true });
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [isOpen, updateMenuPosition]);

  // Click outside listener
  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node | null;
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        triggerRef.current &&
        !triggerRef.current.contains(target)
      ) {
        closeMenu();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [isOpen, closeMenu]);

  // Scroll active item into view
  useEffect(() => {
    if (!isOpen || !menuRef.current) return;
    const activeEl = menuRef.current.querySelector<HTMLElement>('.cfg-select-option.is-active');
    if (typeof activeEl?.scrollIntoView === 'function') {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }, [isOpen, activeIndex]);

  // Keyboard navigation on trigger / menu
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    if (!isOpen) {
      if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
        e.preventDefault();
        e.stopPropagation();
        openMenu();
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeMenu(true);
      return;
    }

    if (e.key === 'Tab') {
      closeMenu();
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation();
      setActiveIndex((prev) => {
        for (let i = 1; i <= options.length; i++) {
          const next = (prev + i) % options.length;
          if (!options[next].disabled) return next;
        }
        return prev;
      });
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      setActiveIndex((prev) => {
        for (let i = 1; i <= options.length; i++) {
          const next = (prev - i + options.length) % options.length;
          if (!options[next].disabled) return next;
        }
        return prev;
      });
      return;
    }

    if (e.key === 'Home') {
      e.preventDefault();
      e.stopPropagation();
      const first = options.findIndex((opt) => !opt.disabled);
      if (first >= 0) setActiveIndex(first);
      return;
    }

    if (e.key === 'End') {
      e.preventDefault();
      e.stopPropagation();
      for (let i = options.length - 1; i >= 0; i--) {
        if (!options[i].disabled) {
          setActiveIndex(i);
          break;
        }
      }
      return;
    }

    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      if (options[activeIndex] && !options[activeIndex].disabled) {
        selectOption(options[activeIndex].value, options[activeIndex].disabled);
      }
      return;
    }

    // Alphanumeric quick search
    if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
      const char = e.key.toLowerCase();
      const start = activeIndex + 1;
      const reordered = [...options.slice(start), ...options.slice(0, start)];
      const match = reordered.find(
        (opt) => !opt.disabled && opt.label.trim().toLowerCase().startsWith(char)
      );
      if (match) {
        e.preventDefault();
        e.stopPropagation();
        setActiveIndex(options.indexOf(match));
      }
    }
  };

  return (
    <div
      ref={shellRef}
      className={`cfg-select-shell ${className || ''}`.trim()}
      style={shellStyle}
    >
      <select
        ref={selectRef}
        id={id}
        name={name}
        className="cfg-select is-enhanced"
        aria-label={ariaLabel}
        value={value}
        disabled={disabled}
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} disabled={opt.disabled}>
            {opt.label}
          </option>
        ))}
      </select>

      <button
        ref={triggerRef}
        type="button"
        className={`cfg-select-trigger ${triggerClassName || ''}`.trim()}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-activedescendant={isOpen && activeIndex >= 0 ? `${listboxId}-opt-${activeIndex}` : undefined}
        aria-label={ariaLabel ? `${ariaLabel}: ${currentLabel}` : currentLabel}
        disabled={disabled}
        onClick={() => (isOpen ? closeMenu() : openMenu())}
        onKeyDown={handleKeyDown}
        style={style}
      >
        <span className="cfg-select-value">{currentLabel}</span>
        <svg
          className="cfg-select-chevron"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {isOpen &&
        createPortal(
          <div
            ref={menuRef}
            id={listboxId}
            role="listbox"
            aria-label={ariaLabel}
            className="cfg-select-menu"
            style={menuStyle}
            onKeyDown={handleKeyDown}
          >
            {options.map((opt, index) => {
              const isSelected = String(opt.value) === String(value);
              const isActive = activeIndex === index;
              return (
                <div
                  key={opt.value}
                  id={`${listboxId}-opt-${index}`}
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={opt.disabled}
                  className={`cfg-select-option ${isSelected ? 'is-selected' : ''} ${isActive ? 'is-active' : ''}`.trim()}
                  onClick={() => selectOption(opt.value, opt.disabled)}
                  onPointerEnter={() => !opt.disabled && setActiveIndex(index)}
                >
                  {opt.label}
                </div>
              );
            })}
          </div>,
          document.body
        )}
    </div>
  );
};

export default CustomSelect;
