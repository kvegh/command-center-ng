import React, { useEffect, useId, useRef, useState } from 'react';
import type { ThemeName } from './browser-workspace';

const themes: readonly ThemeName[] = ['classic', 'contrastful', 'light'];
type MenuKeyEvent = Pick<KeyboardEvent, 'key' | 'preventDefault' | 'stopPropagation'>;
type MenuActions = {
  focus: (theme: ThemeName) => void;
  choose: (theme: ThemeName) => void;
  close: (returnFocus: boolean) => void;
};

export function handleThemeMenuKey(event: MenuKeyEvent, current: ThemeName, actions: MenuActions) {
  const index = themes.indexOf(current);
  if (event.key === 'Tab') {
    actions.close(false);
    return;
  }
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' ', 'Escape'].includes(event.key)) return;
  event.preventDefault();
  // Escape belongs to this menu, never to the page's agent-interrupt shortcut.
  event.stopPropagation();
  if (event.key === 'Escape') actions.close(true);
  else if (event.key === 'Enter' || event.key === ' ') actions.choose(current);
  else if (event.key === 'Home') actions.focus(themes[0]);
  else if (event.key === 'End') actions.focus(themes[themes.length - 1]);
  else actions.focus(themes[(index + (event.key === 'ArrowDown' ? 1 : themes.length - 1)) % themes.length]);
}

export function ThemeSwitcher({ theme, onChange }: { theme: ThemeName; onChange: (theme: ThemeName) => void }) {
  const [focused, setFocused] = useState<ThemeName | null>(null);
  const picker = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const options = useRef<Array<HTMLButtonElement | null>>([]);
  const menuId = useId();
  const open = focused !== null;
  const close = (returnFocus: boolean) => {
    setFocused(null);
    if (returnFocus) button.current?.focus();
  };
  const choose = (value: ThemeName) => {
    onChange(value);
    close(true);
  };

  useEffect(() => {
    if (focused) options.current[themes.indexOf(focused)]?.focus();
  }, [focused]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !picker.current?.contains(event.target)) close(true);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  return <div className="theme-picker" ref={picker}
    onKeyDown={event => {
      if (open && event.key === 'Escape') handleThemeMenuKey(event, focused, { focus: setFocused, choose, close });
    }}>
    <button ref={button} type="button" className="icon-button theme-toggle"
      aria-label={`Choose theme; current theme: ${theme}`} title="Choose theme"
      aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
      onClick={() => open ? close(true) : setFocused(theme)}
      onKeyDown={event => {
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        event.stopPropagation();
        setFocused(event.key === 'ArrowUp' || event.key === 'End' ? themes[themes.length - 1] : themes[0]);
      }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3a9 9 0 1 0 0 18h1.2a2.3 2.3 0 0 0 1.6-3.9 1.6 1.6 0 0 1 1.1-2.7H18a3 3 0 0 0 3-3C21 6.8 17 3 12 3Z" />
        <circle cx="7.5" cy="10" r=".7" /><circle cx="10" cy="6.8" r=".7" />
        <circle cx="14" cy="6.8" r=".7" /><circle cx="17" cy="10" r=".7" />
      </svg>
    </button>
    {open && <div className="theme-menu" id={menuId} role="menu" aria-label="Theme"
      onKeyDown={event => handleThemeMenuKey(event, focused, { focus: setFocused, choose, close })}>
      {themes.map((value, index) => <button key={value} type="button" className="theme-option"
        ref={node => { options.current[index] = node; }}
        role="menuitemradio" aria-checked={theme === value} tabIndex={focused === value ? 0 : -1}
        onFocus={() => setFocused(value)} onClick={() => choose(value)}>
        <span className="theme-option-label">{value}</span>
        <span className="theme-option-check" aria-hidden="true">{theme === value ? '✓' : ''}</span>
      </button>)}
    </div>}
  </div>;
}
