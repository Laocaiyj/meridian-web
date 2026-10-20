import React, { useEffect, useRef } from 'react';
import { DownloadEntry } from '../download/DownloadDialog';
import './Hero.css';

const stripeTops = [0, 17.6, 35.2, 52.8, 70.4, 88];

export function Hero({ content, download, heroRef }) {
  const markRef = useRef(null);
  useEffect(() => {
    const mark = markRef.current;
    const image = mark.querySelector('.hero-wordmark-source');
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const mountedAt = performance.now();
    let animations = [];
    let disposed = false;
    const finish = () => {
      mark.dataset.motion = 'complete';
      animations.forEach((animation) => animation.cancel());
      animations = [];
    };
    const start = () => {
      if (disposed || mark.dataset.motion !== 'pending') return;
      if (preference.matches || document.hidden || performance.now() - mountedAt > 1000) {
        finish();
        return;
      }
      const bands = Array.from(mark.querySelectorAll('.hero-wordmark-band'));
      if (!bands[0]?.animate) {
        finish();
        return;
      }
      mark.dataset.motion = 'running';
      try {
        bands.forEach((band, index) => {
          const top = stripeTops[index];
          const bottom = 88 - top;
          animations.push(
            band.animate(
              [
                {
                  clipPath: `inset(${top}% 100% ${bottom}% 0)`,
                  transform: `translateX(${index % 2 ? -12 : 12}px)`,
                  opacity: 0.5,
                },
                {
                  clipPath: `inset(${top}% 0 ${bottom}% 0)`,
                  transform: 'translateX(0)',
                  opacity: 1,
                },
              ],
              {
                duration: 760,
                delay: index * 36,
                easing: 'cubic-bezier(.22, 1, .36, 1)',
                fill: 'both',
              },
            ),
          );
        });
        Promise.all(animations.map((animation) => animation.finished)).then(
          () => !disposed && finish(),
          () => {},
        );
      } catch {
        finish();
      }
    };
    const visibility = () => document.hidden && finish();
    const reduced = () => preference.matches && finish();
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) finish();
    });
    observer.observe(mark);
    document.addEventListener('visibilitychange', visibility);
    preference.addEventListener('change', reduced);
    image.addEventListener('load', start);
    image.addEventListener('error', finish);
    if (image.complete) start();
    if (preference.matches) finish();
    return () => {
      disposed = true;
      finish();
      observer.disconnect();
      document.removeEventListener('visibilitychange', visibility);
      preference.removeEventListener('change', reduced);
      image.removeEventListener('load', start);
      image.removeEventListener('error', finish);
    };
  }, []);
  const source = `${process.env.PUBLIC_URL}/brand/meridian-wordmark-positive.svg`;
  return (
    <header id="header" className="hero" ref={heroRef}>
      <div className="hero-copy">
        <h1>
          <span className="hero-wordmark" ref={markRef} data-motion="pending">
            <img
              className="hero-wordmark-source"
              src={source}
              alt="Meridian"
              width="756.351"
              height="100"
            />
            {stripeTops.map((top) => (
              <span className="hero-wordmark-band" key={top} aria-hidden="true">
                <img src={source} alt="" width="756.351" height="100" />
              </span>
            ))}
          </span>
        </h1>
        <p className="hero-subtitle">{content.title}</p>
        <h2 className="hero-headline">{content.headline}</h2>
        <p className="hero-description">{content.paragraph}</p>
        <div className="hero-actions">
          <a className="hero-workflow" href="#showcase">
            {content.action}
            <svg
              width="18"
              height="18"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M4 10h12m-5-5 5 5-5 5" />
            </svg>
          </a>
          <div className="hero-download">
            <DownloadEntry label={download.trigger} content={download} />
            <p className="download-availability">{download.unavailable}</p>
          </div>
        </div>
      </div>
    </header>
  );
}
