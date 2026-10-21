import React, { useEffect, useRef, useState } from 'react';
import { languages } from './site';

export function LanguagePicker({ language, label, onChange }) {
  const root = useRef(null);
  const trigger = useRef(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const selected = languages.findIndex(({ code }) => code === language);
  const expand = () => {
    setActive(selected);
    setOpen(true);
  };
  const choose = (code) => {
    onChange(code);
    setOpen(false);
    trigger.current.focus({ preventScroll: true });
  };
  useEffect(() => {
    if (!open) return undefined;
    const dismiss = (event) => {
      if (!root.current.contains(event.target)) setOpen(false);
    };
    const close = () => setOpen(false);
    document.addEventListener('pointerdown', dismiss);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      window.removeEventListener('resize', close);
    };
  }, [open]);
  const onKeyDown = (event) => {
    const { key } = event;
    if (key === 'Tab') {
      setOpen(false);
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' ', 'Escape'].includes(key)) return;
    event.preventDefault();
    if (key === 'Escape') {
      setOpen(false);
      trigger.current.focus({ preventScroll: true });
    } else if (key === 'Enter' || key === ' ') {
      if (open) choose(languages[active].code);
      else expand();
    } else {
      setOpen(true);
      if (key === 'Home') setActive(0);
      else if (key === 'End') setActive(languages.length - 1);
      else if (!open) setActive(selected);
      else
        setActive(
          (index) => (index + (key === 'ArrowDown' ? 1 : -1) + languages.length) % languages.length,
        );
    }
  };
  return (
    <div
      className="language-picker"
      ref={root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        ref={trigger}
        type="button"
        role="combobox"
        className="language-button"
        value={language}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls="site-languages"
        aria-activedescendant={open ? `site-language-${languages[active].code}` : undefined}
        onKeyDown={onKeyDown}
        onClick={() => (open ? setOpen(false) : expand())}
      >
        <span lang={languages[selected].locale}>{languages[selected].label}</span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <path d={open ? 'm4 10 4-4 4 4' : 'm4 6 4 4 4-4'} />
        </svg>
      </button>
      {open && (
        <ul id="site-languages" className="language-options" role="listbox" aria-label={label}>
          {languages.map(({ code, locale, label: name }, index) => (
            <li
              id={`site-language-${code}`}
              key={code}
              role="option"
              aria-selected={code === language}
              className={index === active ? 'is-active' : undefined}
              lang={locale}
              onPointerMove={() => setActive(index)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(code)}
            >
              <span>{name}</span>
              {code === language && (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  aria-hidden="true"
                >
                  <path d="m3 8 3 3 7-7" />
                </svg>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
