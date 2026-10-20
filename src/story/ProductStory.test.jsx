import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { ProductStory } from './ProductStory';
import { getSiteContent } from '../content/site';
import { createQuartzScene } from '../quartz/quartzScene';

jest.mock('../useMotionActivity', () => ({
  useMotionActivity: () => ({ active: true, reduced: false }),
}));
jest.mock('../quartz/quartzScene', () => ({ createQuartzScene: jest.fn() }));

test('repeated mounting cancels pending work and disposes each resource owner', () => {
  const pending = new Map();
  let next = 0;
  const request = jest.spyOn(window, 'requestAnimationFrame').mockImplementation((fn) => {
    pending.set(++next, fn);
    return next;
  });
  const cancel = jest
    .spyOn(window, 'cancelAnimationFrame')
    .mockImplementation((id) => pending.delete(id));
  const owners = [];
  createQuartzScene.mockImplementation(() => {
    const owner = { resize: jest.fn(), render: jest.fn(), dispose: jest.fn() };
    owners.push(owner);
    return owner;
  });
  for (let i = 0; i < 3; i++) {
    const view = render(<ProductStory content={getSiteContent('zh').story} />);
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });
    expect(pending.size).toBe(1);
    act(() => {
      view.unmount();
    });
    expect(pending.size).toBe(0);
  }
  act(() => {
    window.dispatchEvent(new Event('resize'));
  });
  expect(pending.size).toBe(0);
  expect(owners).toHaveLength(3);
  expect(owners.every((owner) => owner.dispose.mock.calls.length === 1)).toBe(true);
  cleanup();
  request.mockRestore();
  cancel.mockRestore();
});
