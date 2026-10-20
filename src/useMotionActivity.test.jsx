import React, { useRef } from 'react';
import { render, act, cleanup } from '@testing-library/react';
import { useMotionActivity } from './useMotionActivity';

function MotionStatus({ paused = false }) {
  const target = useRef(null);
  const { active, reduced } = useMotionActivity(target, paused);
  return (
    <div ref={target} role="status">
      {reduced ? 'reduced' : active ? 'running' : 'stopped'}
    </div>
  );
}

let observers, media, listeners, hidden;
beforeEach(() => {
  observers = new Set();
  listeners = new Set();
  hidden = false;
  media = {
    matches: false,
    addEventListener: (event, callback) => listeners.add(callback),
    removeEventListener: (event, callback) => listeners.delete(callback),
  };
  window.matchMedia = () => media;
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  global.IntersectionObserver = class {
    constructor(callback) {
      this.callback = callback;
    }
    observe() {
      observers.add(this);
    }
    disconnect() {
      observers.delete(this);
    }
  };
});
afterEach(cleanup);
const enter = () =>
  act(() => {
    for (const observer of observers) observer.callback([{ isIntersecting: true }]);
  });

test('running requires visibility and respects explicit user pause', () => {
  const view = render(<MotionStatus />);
  expect(view.getByRole('status')).toHaveTextContent('stopped');
  enter();
  expect(view.getByRole('status')).toHaveTextContent('running');
  act(() => {
    hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(view.getByRole('status')).toHaveTextContent('stopped');
  act(() => {
    hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(view.getByRole('status')).toHaveTextContent('running');
  view.rerender(<MotionStatus paused />);
  expect(view.getByRole('status')).toHaveTextContent('stopped');
});

test('a live system preference change stops motion and restores it when allowed', () => {
  const view = render(<MotionStatus />);
  enter();
  act(() => {
    media.matches = true;
    for (const callback of listeners) callback();
  });
  expect(view.getByRole('status')).toHaveTextContent('reduced');
  act(() => {
    media.matches = false;
    for (const callback of listeners) callback();
  });
  expect(view.getByRole('status')).toHaveTextContent('running');
});

test('unmount releases browser subscriptions before another mount', () => {
  for (let i = 0; i < 3; i++) {
    const view = render(<MotionStatus />);
    enter();
    expect(view.getByRole('status')).toHaveTextContent('running');
    expect(observers.size).toBe(1);
    expect(listeners.size).toBe(1);
    act(() => {
      view.unmount();
    });
    expect(observers.size).toBe(0);
    expect(listeners.size).toBe(0);
  }
});
