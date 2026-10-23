import React from 'react';
import { render, fireEvent, cleanup, act } from '@testing-library/react';
import App from './App';
import { Hero } from './hero/Hero';

beforeEach(() => {
  window.scrollTo = () => {};
  localStorage.clear();
  localStorage.setItem('meridian-language', 'zh');
});
afterEach(cleanup);
const chooseLanguage = (view, code) => {
  fireEvent.click(view.getByRole('combobox'));
  fireEvent.click(
    view.getByRole('option', {
      name: { en: 'English', zh: '中文', ja: '日本語', ko: '한국어' }[code],
      exact: true,
    }),
  );
};

test('language picker opens a styled list and cancels keyboard browsing without changing language', () => {
  localStorage.clear();
  const view = render(<App />);
  const picker = view.getByRole('combobox', { name: 'Language' });
  expect(view.queryByRole('listbox')).toBeNull();
  fireEvent.click(picker);
  expect(view.getByRole('listbox')).toBeVisible();
  expect(view.getByRole('option', { name: 'English' })).toHaveAttribute('aria-selected', 'true');
  fireEvent.keyDown(picker, { key: 'ArrowDown' });
  fireEvent.keyDown(picker, { key: 'Escape' });
  expect(view.queryByRole('listbox')).toBeNull();
  expect(document.documentElement.lang).toBe('en');
  expect(picker).toHaveFocus();
  fireEvent.keyDown(picker, { key: 'End' });
  fireEvent.keyDown(picker, { key: 'Enter' });
  expect(document.documentElement.lang).toBe('ko');
});

// Captures missing locale routing, stale metadata and preferences lost on remount.
test('first visit uses English regardless of browser language', () => {
  localStorage.clear();
  const view = render(<App />);
  expect(view.getByRole('combobox', { name: 'Language' }).value).toBe('en');
  expect(document.documentElement.lang).toBe('en');
  expect(view.getByRole('link', { name: 'See how it works' })).toBeVisible();
});

test.each([
  ['ja', 'ja', '使い方を見る', 'Meridian をダウンロード'],
  ['ko', 'ko', '작동 방식 보기', 'Meridian 다운로드'],
])(
  'switching to %s updates content, dialog and saved preference',
  (code, locale, action, title) => {
    localStorage.clear();
    const view = render(<App />);
    chooseLanguage(view, code);
    expect(document.documentElement.lang).toBe(locale);
    expect(view.getByRole('link', { name: action })).toBeVisible();
    expect(localStorage.getItem('meridian-language')).toBe(code);
    fireEvent.click(
      view.getByRole('button', { name: code === 'ja' ? 'ダウンロード' : '다운로드', exact: true }),
    );
    expect(view.getByRole('dialog', { name: title })).toBeVisible();
    view.unmount();
    const restored = render(<App />);
    expect(restored.getByRole('combobox').value).toBe(code);
  },
);

test('unsupported saved languages safely fall back to English', () => {
  localStorage.setItem('meridian-language', 'fr');
  const view = render(<App />);
  expect(view.getByRole('link', { name: 'See how it works' })).toBeVisible();
  expect(document.documentElement.lang).toBe('en');
});

test('the language selector switches Chinese and English metadata', () => {
  const view = render(<App />);
  const language = view.getByRole('combobox', { name: '语言' });
  expect(language.value).toBe('zh');
  chooseLanguage(view, 'en');
  expect(view.getByRole('combobox', { name: 'Language' }).value).toBe('en');
  expect(document.title).toBe('Meridian — AI Development Workspace');
  expect(document.documentElement.lang).toBe('en');
  chooseLanguage(view, 'zh');
  expect(document.title).toBe('Meridian — AI 开发工作空间');
});

test('blocked browser storage does not prevent language selection', () => {
  const read = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  const write = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  try {
    const view = render(<App />);
    expect(document.documentElement.lang).toBe('en');
    chooseLanguage(view, 'ko');
    expect(view.getByRole('link', { name: '작동 방식 보기' })).toBeVisible();
    expect(document.documentElement.lang).toBe('ko');
  } finally {
    read.mockRestore();
    write.mockRestore();
  }
});

test('the App wordmark and download entry share the hero without a navigation bar', () => {
  const view = render(<App />);
  expect(view.queryByRole('navigation')).toBeNull();
  const wordmark = view.getByRole('img', { name: 'Meridian' });
  expect(wordmark.getAttribute('src')).toContain('meridian-wordmark-positive.svg');
  const hero = wordmark.closest('header');
  expect(hero.contains(view.getByRole('button', { name: '下载' }))).toBe(true);
  fireEvent.click(view.getByRole('button', { name: '下载' }));
  expect(view.getByRole('dialog', { name: '下载 Meridian' })).toBeVisible();
  expect(view.getByRole('button', { name: /Windows/ })).toBeDisabled();
  expect(view.getByRole('button', { name: /macOS/ })).toBeDisabled();
});

test('automatic presentation exposes no playback or motion-switch buttons', () => {
  const view = render(<App />);
  expect(view.queryAllByRole('button', { name: /暂停|继续|播放|动态效果/ })).toHaveLength(0);
});

test('the hero leads into the product workflow and keeps downloads as a separate action', () => {
  const view = render(<App />);
  const hero = view.getByRole('img', { name: 'Meridian' }).closest('header');
  const entry = view.getByRole('link', { name: '看看如何工作' });
  expect(entry.getAttribute('href')).toBe('#showcase');
  expect(hero.contains(entry)).toBe(true);
  expect(view.getByRole('heading', { name: '让下一版，不再只靠你一个人' })).toBeVisible();
  chooseLanguage(view, 'en');
  expect(view.getByRole('link', { name: 'See how it works' }).getAttribute('href')).toBe(
    '#showcase',
  );
  fireEvent.click(view.getByRole('button', { name: 'Download', exact: true }));
  expect(view.getByRole('dialog', { name: 'Download Meridian' })).toBeVisible();
});

test('the wordmark aligns its six bands once and cancels them on disposal', () => {
  const animations = [];
  const original = Element.prototype.animate;
  const animate = (Element.prototype.animate = jest.fn(() => {
    const animation = { cancel: jest.fn(), finished: new Promise(() => {}) };
    animations.push(animation);
    return animation;
  }));
  const content = { title: 'AI workspace', paragraph: 'Project context' };
  const download = { trigger: 'Download', unavailable: 'Unavailable', platforms: [] };
  const view = render(<Hero content={content} download={download} />);
  fireEvent.load(view.getByRole('img', { name: 'Meridian' }));
  expect(animate).toHaveBeenCalledTimes(6);
  view.rerender(<Hero content={{ ...content, title: '开发工作空间' }} download={download} />);
  expect(animate).toHaveBeenCalledTimes(6);
  act(() => {
    view.unmount();
  });
  expect(animations.every((animation) => animation.cancel.mock.calls.length === 1)).toBe(true);
  Element.prototype.animate = original;
});
