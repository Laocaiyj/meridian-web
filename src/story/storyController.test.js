import { createStoryController, createStoryPlayback } from './storyController';
import { createQuartzScene } from '../quartz/quartzScene';

jest.mock('../quartz/quartzScene', () => ({ createQuartzScene: jest.fn() }));

let pending, next, cancelled, callback;
beforeEach(() => {
  pending = new Map();
  next = 0;
  cancelled = [];
  jest.spyOn(window, 'requestAnimationFrame').mockImplementation((fn) => {
    pending.set(++next, fn);
    return next;
  });
  jest.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
    cancelled.push(id);
    pending.delete(id);
  });
  callback = jest.fn();
});
afterEach(() => jest.restoreAllMocks());
function flush() {
  const frames = [...pending.values()];
  pending.clear();
  frames.forEach((fn) => fn());
}
function fixture() {
  let top = 0;
  const track = { getBoundingClientRect: () => ({ top, height: 2400 }) };
  const stage = document.createElement('div');
  stage.getBoundingClientRect = () => ({
    left: 48,
    width: 1120,
    top: 100,
    bottom: 700,
    height: 600,
  });
  return {
    track,
    stage,
    move: (value) => {
      top = value;
      window.dispatchEvent(new Event('scroll'));
    },
  };
}
test('scroll and resize share one request, reverse deterministically, and stop while inactive', () => {
  const f = fixture();
  const control = createStoryController(f.track, f.stage, callback);
  control.setActivity(true, false);
  f.move(-900);
  window.dispatchEvent(new Event('resize'));
  expect(pending.size).toBe(1);
  flush();
  const forward = callback.mock.calls.at(-1)[0].progress;
  f.move(-1800);
  flush();
  expect(callback.mock.calls.at(-1)[0].progress).toBeGreaterThan(forward);
  f.move(-900);
  flush();
  expect(callback.mock.calls.at(-1)[0].progress).toBe(forward);
  f.move(-1000);
  control.setActivity(false, false);
  expect(pending.size).toBe(0);
  const calls = callback.mock.calls.length;
  f.move(-1200);
  flush();
  expect(callback).toHaveBeenCalledTimes(calls);
  control.dispose();
  control.dispose();
  expect(cancelled.length).toBeGreaterThan(0);
});
test('reduced motion offers complete selected chapters without frame requests', () => {
  const f = fixture();
  const control = createStoryController(f.track, f.stage, callback);
  control.setActivity(false, true);
  control.selectChapter(1);
  expect(callback.mock.calls.at(-1)[0]).toMatchObject({ chapter: 1, phase: 1, static: true });
  expect(pending.size).toBe(0);
  control.dispose();
  f.move(-1200);
  expect(pending.size).toBe(0);
});

test('restoring motion aligns the selected static chapter instead of resetting it', () => {
  const f = fixture();
  const control = createStoryController(f.track, f.stage, callback);
  const scroll = jest.spyOn(window, 'scrollTo').mockImplementation(({ top }) => f.move(-top));
  control.setActivity(false, true);
  control.selectChapter(2);
  control.setActivity(true, false);
  flush();
  expect(scroll).toHaveBeenCalled();
  expect(callback.mock.calls.at(-1)[0].chapter).toBe(2);
  control.dispose();
});

test('playback projects one frame to chapter, workspace and renderer without React ownership', () => {
  const f = fixture();
  const renderer = { resize: jest.fn(), render: jest.fn(), dispose: jest.fn() };
  createQuartzScene.mockReturnValue(renderer);
  const workspace = document.createElement('div');
  workspace.innerHTML = '<p data-when="corrected">fixed</p><p data-when="!corrected">issue</p>';
  const onChapter = jest.fn();
  const onRendererState = jest.fn();
  const artwork = {
    getBoundingClientRect: () => ({ width: 500, height: 600, top: 0, bottom: 600 }),
  };
  const canvas = document.createElement('canvas');
  const playback = createStoryPlayback({
    track: f.track,
    stage: f.stage,
    artwork,
    canvas,
    layer: document.createElement('div'),
    workspace,
    onChapter,
    onRendererState,
  });
  expect(createQuartzScene).not.toHaveBeenCalled();
  expect(workspace.dataset.progress).toBe('0.0000');
  expect(f.stage.style.getPropertyValue('--ink-weight')).toBe('500');
  expect(workspace.querySelector('[data-when="corrected"]').hidden).toBe(true);
  expect(renderer.render).not.toHaveBeenCalled();
  playback.setActivity(true, false);
  f.move(-1800);
  flush();
  expect(onChapter).toHaveBeenLastCalledWith(2);
  expect(workspace.dataset.progress).toBe('1.0000');
  expect(workspace.style.getPropertyValue('--phase')).toBe('1');
  expect(f.stage.style.getPropertyValue('--ink-weight')).toBe('700');
  f.move(-900);
  flush();
  const middleInk = f.stage.style.cssText;
  f.move(-1300);
  flush();
  expect(f.stage.style.cssText).not.toBe(middleInk);
  f.move(-900);
  flush();
  expect(f.stage.style.cssText).toBe(middleInk);
  f.move(-1800);
  flush();
  expect(workspace.querySelector('[data-when="corrected"]').hidden).toBe(false);
  expect(workspace.querySelector('[data-when="!corrected"]').hidden).toBe(true);
  expect(renderer.render).toHaveBeenLastCalledWith(
    expect.objectContaining({ progress: 1, active: true }),
  );
  expect(renderer.resize).toHaveBeenLastCalledWith(
    window.innerWidth,
    window.innerHeight,
    window.devicePixelRatio,
  );
  workspace.innerHTML = '<p data-when="verified">delivered</p>';
  const draws = renderer.render.mock.calls.length;
  playback.refreshWorkspace();
  expect(workspace.firstChild.hidden).toBe(false);
  expect(renderer.render).toHaveBeenCalledTimes(draws);
  playback.setActivity(false, false);
  expect(renderer.render).toHaveBeenLastCalledWith({ active: false });
  f.move(-900);
  flush();
  expect(renderer.render).toHaveBeenCalledTimes(draws + 1);
  playback.dispose();
  playback.dispose();
  expect(renderer.dispose).toHaveBeenCalledTimes(1);
  expect(pending.size).toBe(0);
  const stopped = renderer.render.mock.calls.length;
  playback.setActivity(true, false);
  playback.selectChapter(1);
  playback.refreshWorkspace();
  f.move(-1500);
  flush();
  expect(renderer.render).toHaveBeenCalledTimes(stopped);
  expect(pending.size).toBe(0);
});

test('static playback selects complete chapters while the renderer remains inactive', () => {
  const f = fixture();
  const renderer = { resize: jest.fn(), render: jest.fn(), dispose: jest.fn() };
  createQuartzScene.mockReturnValue(renderer);
  const workspace = document.createElement('div');
  workspace.innerHTML = '<p data-when="handedOff">ready</p><p data-when="!handedOff">writing</p>';
  const onChapter = jest.fn();
  const playback = createStoryPlayback({
    track: f.track,
    stage: f.stage,
    canvas: document.createElement('canvas'),
    layer: document.createElement('div'),
    artwork: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 500, height: 600 }) },
    workspace,
    onChapter,
    onRendererState: jest.fn(),
  });
  playback.setActivity(false, true);
  playback.selectChapter(1);
  expect(onChapter).toHaveBeenLastCalledWith(1);
  expect(workspace.querySelector('[data-when="handedOff"]').hidden).toBe(false);
  expect(workspace.querySelector('[data-when="!handedOff"]').hidden).toBe(true);
  expect(workspace.style.getPropertyValue('--phase')).toBe('1');
  expect(f.stage.style.getPropertyValue('--ink-weight')).toBe('700');
  expect(renderer.render.mock.calls.every(([frame]) => frame.active === false)).toBe(true);
  expect(renderer.resize).not.toHaveBeenCalled();
  expect(pending.size).toBe(0);
  playback.dispose();
});

test('inverse ink mirrors only narrative text, keeps links semantic and disposes its projection', () => {
  const f = fixture();
  createQuartzScene.mockReturnValue({ resize: jest.fn(), render: jest.fn(), dispose: jest.fn() });
  f.stage.innerHTML =
    '<div class="story-caption"><h3>Build</h3><p>One project</p></div><div class="story-chapters"><a id="project" href="#project">Project</a></div>';
  const ink = document.createElement('div');
  const workspace = document.createElement('div');
  const owner = createStoryPlayback({
    track: f.track,
    stage: f.stage,
    ink,
    workspace,
    artwork: { getBoundingClientRect: () => ({ width: 500, height: 600 }) },
    canvas: document.createElement('canvas'),
    layer: document.createElement('div'),
    onChapter: jest.fn(),
    onRendererState: jest.fn(),
  });
  owner.setActivity(true, false);
  flush();
  expect(ink.querySelector('.story-ink-caption').textContent).toBe('BuildOne project');
  expect(ink.querySelector('a').id).toBe('');
  expect(ink.querySelector('a').tabIndex).toBe(-1);
  expect(f.stage.querySelector('a').id).toBe('project');
  expect(ink.style.left).toBe('48px');
  expect(f.stage.dataset.ink).toBe('ready');
  f.stage.querySelector('h3').textContent = '检查';
  owner.refreshWorkspace();
  expect(ink.querySelector('h3').textContent).toBe('检查');
  owner.dispose();
  expect(ink.hidden).toBe(true);
  expect(f.stage.dataset.ink).toBeUndefined();
});
