import React, { useEffect, useRef, useState } from 'react';
import './DownloadDialog.css';

/** @typedef {{id: 'windows' | 'macos' | 'android' | 'ios', name: string, status: 'unavailable'}} DownloadPlatform */

const platformIcons = { windows: 'windows', macos: 'apple', android: 'android', ios: 'apple' };

/** @param {{open: boolean, onClose: () => void, content: import('../content/site').SiteContent['download']}} props */
export function DownloadDialog({ open, onClose, content }) {
  const dialogRef = useRef(null);
  const closeRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const dialog = dialogRef.current;
    const opener = document.activeElement;
    const overflow = document.body.style.overflow;
    dialog.showModal();
    closeRef.current.focus();
    document.body.style.overflow = 'hidden';
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, [open]);

  const dismissBackdrop = (event) => {
    if (event.target !== event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    )
      onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      className="download-dialog"
      aria-modal="true"
      aria-labelledby="download-title"
      aria-describedby="download-description"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={dismissBackdrop}
    >
      <button
        ref={closeRef}
        type="button"
        className="dialog-close"
        aria-label={content.close}
        onClick={onClose}
      >
        <svg
          viewBox="0 0 20 20"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          aria-hidden="true"
          focusable="false"
        >
          <path d="m5 5 10 10M15 5 5 15" />
        </svg>
      </button>
      <header className="download-heading">
        <img src={`${process.env.PUBLIC_URL}/meridian-icon.png`} width="40" height="40" alt="" />
        <div>
          <h2 id="download-title">{content.title}</h2>
          <p id="download-description">{content.description}</p>
        </div>
      </header>
      {/* eslint-disable-next-line jsx-a11y/no-redundant-roles -- Safari drops list semantics when markers are hidden. */}
      <ul className="download-platforms" role="list" aria-label={content.platformsLabel}>
        {content.platforms.map((platform) => (
          <li key={platform.id} className="download-platform">
            <img
              className="platform-icon"
              src={`${process.env.PUBLIC_URL}/brand/platforms/${platformIcons[platform.id]}.svg`}
              width="24"
              height="24"
              alt=""
              decoding="async"
            />
            <span className="platform-name">{platform.name}</span>
            <button
              type="button"
              className="platform-download"
              aria-label={`${platform.name} · ${content.unavailable}`}
              disabled
            >
              {content.unavailable}
            </button>
          </li>
        ))}
      </ul>
    </dialog>
  );
}

export function DownloadEntry({ label, content }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="primary-button" onClick={() => setOpen(true)}>
        {label}
      </button>
      <DownloadDialog open={open} onClose={() => setOpen(false)} content={content} />
    </>
  );
}
