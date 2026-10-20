import React from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { DownloadEntry } from './DownloadDialog';
import { getSiteContent } from '../content/site';

afterEach(cleanup);

test('unreleased downloads cannot navigate to a placeholder installer', () => {
  const view = render(<DownloadEntry label="下载" content={getSiteContent('zh').download} />);
  fireEvent.click(view.getByRole('button', { name: '下载' }));
  expect(view.queryAllByRole('link').filter((link) => /example\.com/.test(link.href))).toHaveLength(
    0,
  );
  expect(view.getByRole('button', { name: /Windows/ })).toBeDisabled();
  expect(view.getByRole('button', { name: /macOS/ })).toBeDisabled();
});

test('the download sheet exposes a named modal dialog', () => {
  const view = render(<DownloadEntry label="下载" content={getSiteContent('zh').download} />);
  fireEvent.click(view.getByRole('button', { name: '下载' }));
  expect(view.getByRole('dialog', { name: '下载 Meridian' })).toHaveAttribute('aria-modal', 'true');
});

test.each(['zh', 'en'])('four platforms have separate unavailable actions in %s', (language) => {
  const content = getSiteContent(language).download;
  const view = render(<DownloadEntry label={content.trigger} content={content} />);
  fireEvent.click(view.getByRole('button', { name: content.trigger }));
  const platforms = view.getAllByRole('listitem');
  expect(platforms).toHaveLength(4);
  ['Windows', 'macOS', 'Android', 'iOS'].forEach((name, index) => {
    expect(platforms[index]).toHaveTextContent(name);
    const action = view.getByRole('button', { name: `${name} · ${content.unavailable}` });
    expect(action).toBeDisabled();
    expect(action).toHaveTextContent(content.unavailable);
  });
  expect(view.getAllByRole('button', { name: content.close })).toHaveLength(1);
  expect(view.queryAllByRole('link')).toHaveLength(0);
});
