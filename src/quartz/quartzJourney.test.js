import { createQuartzJourney } from './quartzJourney';
import { createQuartzScene } from './quartzScene';
jest.mock('./quartzScene', () => ({ createQuartzScene: jest.fn() }));
let y, state, renderer;
beforeEach(() => {
  y = 0;
  renderer = { resize: jest.fn(), render: jest.fn(), dispose: jest.fn() };
  createQuartzScene.mockImplementation((canvas, callback) => {
    state = callback;
    return renderer;
  });
});
function fixture() {
  const layer = document.createElement('div');
  layer.innerHTML = '<img class="quartz-poster-main"/><img class="quartz-poster-accent"/><canvas/>';
  const rect = (left, top, width, height) => ({ left, top, width, height, bottom: top + height });
  const hero = { getBoundingClientRect: () => rect(0, -y, 1280, 800) };
  const artwork = { getBoundingClientRect: () => rect(600, 1000 - y, 680, 1000) };
  const boundary = { getBoundingClientRect: () => ({ bottom: 10000 }) };
  const refresh = jest.fn();
  const owner = createQuartzJourney({
    hero,
    boundary,
    artwork,
    layer,
    canvas: layer.querySelector('canvas'),
    refresh,
    onState: jest.fn(),
  });
  const frame = (progress = 0) => ({ progress, static: false, handoff: 1000, scroll: y });
  return { owner, layer, frame, refresh, artwork, boundary };
}
test('the root and scale remain fixed across the hero and story while opening reverses exactly', () => {
  const f = fixture();
  f.owner.setActivity(true, false);
  const boxes = [],
    poses = [];
  for (y = 0; y <= 1000; y += 250) {
    f.owner.present(f.frame());
    boxes.push(f.layer.style.cssText);
    poses.push(renderer.render.mock.calls.at(-1)[0]);
  }
  expect(createQuartzScene).toHaveBeenCalledTimes(1);
  expect(new Set(boxes).size).toBe(1);
  expect(poses[0].progress).toBe(0);
  expect(poses.at(-1).progress).toBe(0.5);
  expect(poses.every((p, i) => !i || p.progress >= poses[i - 1].progress)).toBe(true);
  y = 500;
  f.owner.present(f.frame());
  expect(renderer.render.mock.calls.at(-1)[0]).toEqual(poses[2]);
  f.owner.dispose();
});
test('there is no entrance clock or continuation; unchanged frames never submit again', () => {
  const f = fixture();
  f.owner.setActivity(true, false);
  f.owner.present(f.frame());
  state('ready');
  const count = renderer.render.mock.calls.length;
  for (let i = 0; i < 120; i++) expect(f.owner.present(f.frame())).toBe(false);
  expect(renderer.render).toHaveBeenCalledTimes(count);
  y = 200;
  f.owner.present(f.frame());
  expect(renderer.render).toHaveBeenCalledTimes(count + 1);
  f.owner.dispose();
});
test('reduced motion creates no device; background and failure have no continuing work', () => {
  const f = fixture();
  f.owner.setActivity(false, true);
  f.owner.present({ ...f.frame(), static: true });
  expect(createQuartzScene).not.toHaveBeenCalled();
  f.owner.setActivity(true, false);
  f.owner.present(f.frame());
  f.owner.setActivity(false, false);
  expect(renderer.render).toHaveBeenLastCalledWith({ active: false });
  state('ready');
  f.owner.setActivity(true, false);
  f.owner.present(f.frame());
  state('fallback');
  expect(f.owner.present(f.frame())).toBe(false);
  f.owner.dispose();
  f.owner.dispose();
  expect(renderer.dispose).toHaveBeenCalledTimes(1);
  const calls = f.refresh.mock.calls.length;
  state('ready');
  expect(f.refresh).toHaveBeenCalledTimes(calls);
});

test('same-aspect resize and DPR changes still update backing dimensions', () => {
  const f = fixture();
  f.owner.setActivity(true, false);
  f.owner.present(f.frame(0.8));
  f.artwork.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1360, height: 2000 });
  f.owner.present(f.frame(0.8));
  expect(renderer.resize).toHaveBeenLastCalledWith(
    window.innerWidth,
    window.innerHeight,
    window.devicePixelRatio,
  );
  const previous = window.devicePixelRatio;
  Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 2 });
  f.owner.present(f.frame(0.8));
  expect(renderer.resize).toHaveBeenLastCalledWith(window.innerWidth, window.innerHeight, 2);
  Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: previous });
  f.owner.dispose();
});
test('a ready scene switches to the complete poster in a short window and restores GPU state', () => {
  const f = fixture();
  f.owner.setActivity(true, false);
  f.owner.present(f.frame(0.8));
  state('ready');
  f.owner.present(f.frame(0.8));
  expect(f.layer.dataset.renderer).toBe('ready');
  f.owner.present({ ...f.frame(0.8), static: true });
  expect(f.layer.dataset.renderer).toBe('static');
  f.owner.present(f.frame(0.8));
  expect(f.layer.dataset.renderer).toBe('ready');
  f.owner.dispose();
});

test('after unfolding the actor leaves with the second chapter and never covers the third', () => {
  const f = fixture();
  f.owner.setActivity(true, false);
  f.owner.present(f.frame(1));
  const draws = renderer.render.mock.calls.length;
  f.boundary.getBoundingClientRect = () => ({ bottom: 500 });
  f.owner.present(f.frame(1));
  expect(parseFloat(f.layer.style.top) + parseFloat(f.layer.style.height)).toBe(500);
  expect(renderer.render).toHaveBeenCalledTimes(draws + 1);
  f.boundary.getBoundingClientRect = () => ({ bottom: 0 });
  f.owner.present(f.frame(1));
  expect(f.layer.hidden).toBe(true);
  f.owner.dispose();
});

test('the inverted accent opens below a top-edge root only inside the second section', () => {
  const f = fixture();
  f.owner.setActivity(true, false);
  f.boundary.getBoundingClientRect = () => ({ top: 180, bottom: 10000 });
  y = 620;
  f.owner.present(f.frame());
  expect(renderer.render.mock.calls.at(-1)[0].accentProgress).toBe(0);
  f.boundary.getBoundingClientRect = () => ({ top: -400, bottom: 10000 });
  y = 1200;
  f.owner.present(f.frame(0.5));
  const pose = renderer.render.mock.calls.at(-1)[0];
  const rootY = parseFloat(f.layer.style.top) + ((1 - pose.accentY) * 1000) / 2;
  expect(rootY).toBeCloseTo(-220, 6);
  expect(pose.accentProgress).toBeGreaterThan(0);
  const matrix = f.layer
    .querySelector('.quartz-poster-accent')
    .style.transform.match(/matrix\(([^)]+)\)/)[1]
    .split(',')
    .map(Number);
  expect(matrix[0]).toBeLessThan(0);
  expect(matrix[1]).toBeLessThan(0);
  expect(matrix[2]).toBeGreaterThan(0);
  expect(matrix[3]).toBeLessThan(0);
  const rootX = matrix[0] * 680 + (matrix[2] * 1000) / 2 + matrix[4];
  expect(rootX).toBeCloseTo(window.innerWidth * 0.18, 6);
  const previous = pose.accentY;
  y = 1400;
  f.owner.present(f.frame(0.7));
  expect(renderer.render.mock.calls.at(-1)[0].accentY).toBe(previous);
  f.owner.dispose();
});

test('the backing store covers the visible window while preserving the full sculpture projection', () => {
  const f = fixture();
  f.owner.setActivity(true, false);
  f.owner.present(f.frame(0.8));
  expect(renderer.resize).toHaveBeenLastCalledWith(
    window.innerWidth,
    window.innerHeight,
    window.devicePixelRatio,
  );
  const pose = renderer.render.mock.calls.at(-1)[0];
  expect(pose.cropHeight).toBeCloseTo(window.innerHeight / 1000, 6);
  expect(pose.cropY).toBeCloseTo((1000 - window.innerHeight) / 2000, 6);
  expect(pose.viewportAspect).toBe(window.innerWidth / 1000);
  expect(
    parseFloat(f.layer.querySelector('canvas').style.top) + parseFloat(f.layer.style.top),
  ).toBe(0);
  f.owner.dispose();
});

test('flow sculpture follows scroll independently of the selected phone chapter', () => {
  const f = fixture();
  f.owner.setActivity(true, false);
  y = 1300;
  f.owner.present({ ...f.frame(0.333), narrow: true });
  const first = renderer.render.mock.calls.at(-1)[0].progress;
  f.owner.present({ ...f.frame(0.999), narrow: true });
  expect(renderer.render.mock.calls.at(-1)[0].progress).toBe(first);
  y = 1500;
  f.owner.present({ ...f.frame(0.999), narrow: true });
  expect(renderer.render.mock.calls.at(-1)[0].progress).toBeGreaterThan(first);
  f.owner.dispose();
});

test('phone unfolding finishes before the fixed roots start leaving the second section', () => {
  const f = fixture();
  f.boundary.getBoundingClientRect = () => ({ top: 800 - y, bottom: 4000 - y });
  f.owner.setActivity(true, false);
  const exitAt = 4000 - (window.innerHeight + 1000) / 2;
  y = exitAt - 20;
  f.owner.present({ ...f.frame(), narrow: true });
  const fixedTop = parseFloat(f.layer.style.top);
  expect(Number(f.layer.dataset.progress)).toBeLessThan(1);
  y = exitAt + 20;
  f.owner.present({ ...f.frame(), narrow: true });
  expect(Number(f.layer.dataset.progress)).toBe(1);
  expect(Number(f.layer.dataset.accentProgress)).toBe(1);
  expect(parseFloat(f.layer.style.top)).toBeLessThan(fixedTop);
  f.owner.dispose();
});
