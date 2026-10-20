import React from 'react';
import { render, fireEvent, cleanup, act } from '@testing-library/react';
import App from './App';
import { Hero } from './hero/Hero';

beforeEach(() => {
  window.scrollTo = () => {};
});
afterEach(cleanup);

test('the language control names the current language while switching all page metadata', () => {
  const view = render(<App />);
  const language = view.getByRole('button', { name: '切换为英文' });
  expect(language).toHaveTextContent('中文');
  fireEvent.click(language);
  expect(view.getByRole('button', { name: 'Switch to Chinese' })).toHaveTextContent('EN');
  expect(document.title).toBe('Meridian — AI Development Workspace');
  expect(document.documentElement.lang).toBe('en');
  fireEvent.click(view.getByRole('button', { name: 'Switch to Chinese' }));
  expect(document.title).toBe('Meridian — AI 开发工作空间');
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
  expect(view.getByRole('heading', { name: '为完整项目而构建' })).toBeVisible();
  fireEvent.click(view.getByRole('button', { name: '切换为英文' }));
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
