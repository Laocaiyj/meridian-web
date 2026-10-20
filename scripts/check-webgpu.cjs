const { chromium } = require('@playwright/test');
const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const output = path.resolve(process.env.SITE_EVIDENCE_DIR || 'test-results/webgpu');
fs.mkdirSync(output, { recursive: true });
async function start(port, base = '') {
  const child = spawn(process.execPath, ['scripts/serve.cjs'], {
    env: { ...process.env, PORT: String(port), SITE_BASE_PATH: base },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    child.stdout.once('data', resolve);
    child.once('error', reject);
    child.once('exit', (code) => reject(new Error(`Preview exited ${code}`)));
  });
  return child;
}
async function move(page, value) {
  await page.evaluate((p) => {
    const t = document.querySelector('.story-track').getBoundingClientRect(),
      h = document.querySelector('.story-stage').getBoundingClientRect().height;
    scrollTo({
      top: scrollY + t.top - Math.max(32, (innerHeight - h) / 2) + (t.height - h) * p,
      behavior: 'instant',
    });
  }, value);
  await page.waitForFunction(
    (p) => Math.abs(Number(document.querySelector('.workspace-demo').dataset.progress) - p) < 0.001,
    value,
  );
}
async function probe(page) {
  await page.addInitScript(() => {
    window.__gpuQA = { draws: 0, devices: [], adapters: [], hidden: false };
    Object.defineProperty(document, 'hidden', { get: () => window.__gpuQA.hidden });
    const gpu = navigator.gpu;
    if (!gpu) return;
    const request = gpu.requestAdapter.bind(gpu);
    gpu.requestAdapter = async (...args) => {
      const adapter = await request(...args);
      if (!adapter) return adapter;
      window.__gpuQA.adapters.push({
        fallback: adapter.info?.isFallbackAdapter ?? adapter.isFallbackAdapter,
        vendor: adapter.info?.vendor,
        architecture: adapter.info?.architecture,
      });
      const getDevice = adapter.requestDevice.bind(adapter);
      adapter.requestDevice = async (...options) => {
        const device = await getDevice(...options);
        window.__gpuQA.devices.push(device);
        const submit = device.queue.submit.bind(device.queue);
        device.queue.submit = (...commands) => {
          window.__gpuQA.draws++;
          return submit(...commands);
        };
        return device;
      };
      return adapter;
    };
  });
}
async function pixels(page, name, minimumColors = 100) {
  const result = await page.evaluate(async () => {
    const canvas = document.querySelector('.quartz-journey canvas');
    const data = await new Promise((resolve) => {
      window.dispatchEvent(new Event('scroll'));
      requestAnimationFrame(() => resolve(canvas.toDataURL('image/png')));
    });
    const image = new Image();
    image.src = data;
    await image.decode();
    const copy = document.createElement('canvas');
    copy.width = image.width;
    copy.height = image.height;
    const context = copy.getContext('2d');
    context.drawImage(image, 0, 0);
    const values = context.getImageData(0, 0, image.width, image.height).data;
    const colors = new Set(),
      rootRows = new Set();
    let minX = image.width,
      minY = image.height,
      maxY = -1,
      maxX = -1,
      painted = 0,
      primaryMinY = image.height,
      primaryMaxY = -1,
      primaryPainted = 0,
      primaryBounds = [image.width, image.height, -1, -1],
      accentPainted = 0,
      accentBounds = [image.width, image.height, -1, -1];
    for (let i = 0; i < values.length; i += 4) {
      if (values[i + 3] < 128) continue;
      colors.add(`${values[i]},${values[i + 1]},${values[i + 2]}`);
      const x = (i / 4) % image.width;
      minX = Math.min(minX, x);
      const y = Math.floor(i / 4 / image.width);
      if (x >= image.width - 2) rootRows.add(y);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      maxX = Math.max(maxX, x);
      painted++;
      if (values[i + 2] > values[i] + 5 && values[i] > values[i + 1] + 8) {
        primaryPainted++;
        primaryBounds[0] = Math.min(primaryBounds[0], x);
        primaryBounds[1] = Math.min(primaryBounds[1], y);
        primaryBounds[2] = Math.max(primaryBounds[2], x);
        primaryBounds[3] = Math.max(primaryBounds[3], y);
        primaryMinY = Math.min(primaryMinY, y);
        primaryMaxY = Math.max(primaryMaxY, y);
      }
      if (
        Math.max(values[i], values[i + 1], values[i + 2]) < 125 &&
        Math.max(values[i], values[i + 1], values[i + 2]) -
          Math.min(values[i], values[i + 1], values[i + 2]) <
          20
      ) {
        accentPainted++;
        accentBounds[0] = Math.min(accentBounds[0], x);
        accentBounds[1] = Math.min(accentBounds[1], y);
        accentBounds[2] = Math.max(accentBounds[2], x);
        accentBounds[3] = Math.max(accentBounds[3], y);
      }
    }
    return {
      data,
      primaryHeight: primaryMaxY - primaryMinY + 1,
      primaryPainted,
      primaryBounds,
      accentPainted,
      accentBounds,
      colors: colors.size,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
      painted,
      rootRows: rootRows.size,
      bounds: [minX, minY, maxX, maxY],
      canvas: [image.width, image.height],
    };
  });
  const buffer = Buffer.from(result.data.split(',')[1], 'base64');
  fs.writeFileSync(`${output}/${name}.png`, buffer);
  assert(
    result.colors > minimumColors,
    `Fan needs actual facet pixels, got ${result.colors} colors`,
  );
  assert(result.painted > 1000, 'Fan must be visibly rendered');
  return {
    primaryHeight: result.primaryHeight,
    primaryPainted: result.primaryPainted,
    primaryBounds: result.primaryBounds,
    accentPainted: result.accentPainted,
    accentBounds: result.accentBounds,
    sha256: createHash('sha256').update(buffer).digest('hex'),
    colors: result.colors,
    width: result.width,
    height: result.height,
    painted: result.painted,
    bounds: result.bounds,
    rootRows: result.rootRows,
    canvas: result.canvas,
  };
}
async function main() {
  const servers = [],
    results = [];
  let browser;
  try {
    servers.push(await start(4180));
    servers.push(await start(4181, '/product-web'));
    browser = await chromium.launch({ headless: false });
    for (const [name, url] of [
      ['root', 'http://127.0.0.1:4180/'],
      ['subpath', 'http://127.0.0.1:4181/product-web/'],
    ]) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await probe(page);
      await page.goto(url);
      await page.waitForFunction(
        () => document.querySelector('.quartz-journey').dataset.renderer === 'ready',
      );
      const actor = await page.locator('.quartz-journey canvas').elementHandle();
      assert.equal(await page.locator('.quartz-journey').getAttribute('data-progress'), '0.0000');
      await page.waitForTimeout(120);
      const settled = await page.evaluate(() => window.__gpuQA.draws);
      await page.waitForTimeout(200);
      assert.equal(await page.evaluate(() => window.__gpuQA.draws), settled, 'Hero must settle');
      const pinned = await page.locator('.quartz-journey').evaluate((n) => n.style.cssText);
      await page.evaluate(() => scrollTo({ top: innerHeight * 0.5, behavior: 'instant' }));
      await page.waitForTimeout(100);
      // The light cropped tip has fewer shades; opened views retain the full diversity check.
      const hero = await pixels(page, `gpu-${name}-reveal`, 32);
      assert.equal(
        await page.locator('.quartz-journey').getAttribute('data-accent-progress'),
        '0.0000',
        'The accent stays outside the first section',
      );
      for (const fraction of [0.25, 0.5, 0.75, 1]) {
        await page.evaluate(
          (f) => scrollTo({ top: innerHeight * f, behavior: 'instant' }),
          fraction,
        );
        await page.waitForTimeout(80);
        assert.equal(await page.locator('canvas').count(), 1, 'One canvas throughout handoff');
        assert(await actor.evaluate((n) => n === document.querySelector('.quartz-journey canvas')));
        assert.equal(
          await page.locator('.quartz-journey').evaluate((n) => n.style.cssText),
          pinned,
          'The root and scale stay fixed',
        );
      }
      await move(page, 0.15);
      await page.waitForFunction(
        () => document.querySelector('.interference-art').dataset.renderer === 'ready',
      );
      await page.evaluate(() => window.__gpuQA.devices.at(-1).queue.onSubmittedWorkDone());
      const first = await pixels(page, `gpu-${name}-first`);
      await move(page, 0.8);
      await page.evaluate(() => window.__gpuQA.devices.at(-1).queue.onSubmittedWorkDone());
      const second = await pixels(page, `gpu-${name}-second`);
      assert.notEqual(first.sha256, second.sha256, 'Scroll must change actual artwork pixels');
      assert(
        second.primaryHeight / second.canvas[1] > (hero.primaryHeight / hero.canvas[1]) * 1.3,
        'The fan must open across the hero-to-story journey, not only change color',
      );
      for (const frame of [first, second]) {
        const crop = await page.locator('.quartz-journey canvas').evaluate((canvas) => {
          const box = canvas.getBoundingClientRect();
          return { top: box.top, height: box.height, viewport: innerHeight };
        });
        assert(
          Math.abs(crop.top) < 1 && Math.abs(crop.height - crop.viewport) < 1,
          'The high-resolution canvas boundary must coincide with the viewport, never cut inside it',
        );
        assert(
          frame.bounds[2] >= frame.canvas[0] - 4,
          'Fan pivot must stay connected to the page right edge',
        );
        assert(
          frame.rootRows >= 20,
          'The root must have visible thickness rather than a needle point',
        );
      }
      assert(
        second.accentPainted > 500,
        'The graphite upper-left sculpture must share the scene with the lavender sculpture',
      );
      await move(page, 0.15);
      const reversed = await pixels(page, `gpu-${name}-reversed`);
      assert.equal(
        reversed.sha256,
        first.sha256,
        'Reverse scroll must restore exactly the same fan',
      );
      await move(page, 1);
      const final = await pixels(page, `gpu-${name}-final`);
      assert.notEqual(final.sha256, hero.sha256);
      const [left, top, right, bottom] = final.accentBounds;
      assert(
        right - left > final.canvas[0] * 0.4 && bottom > top,
        'The inverted upper fan must retain a wide spread after tilting',
      );
      await page.waitForTimeout(100);
      const idle = await page.evaluate(() => window.__gpuQA.draws);
      await page.waitForTimeout(250);
      assert.equal(await page.evaluate(() => window.__gpuQA.draws), idle, 'Idle must not submit');
      await page.evaluate(() => {
        window.__gpuQA.hidden = true;
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await page.waitForTimeout(100);
      const hidden = await page.evaluate(() => window.__gpuQA.draws);
      await page.evaluate(() => window.dispatchEvent(new Event('scroll')));
      await page.waitForTimeout(150);
      assert.equal(
        await page.evaluate(() => window.__gpuQA.draws),
        hidden,
        'Hidden must not submit',
      );
      await page.evaluate(() => {
        window.__gpuQA.hidden = false;
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await page.waitForTimeout(100);
      await page.evaluate(() => window.__gpuQA.devices.at(-1).destroy());
      await page.waitForFunction(
        () =>
          window.__gpuQA.devices.length === 2 &&
          document.querySelector('.interference-art').dataset.renderer === 'ready',
      );
      await page.evaluate(() => window.__gpuQA.devices.at(-1).destroy());
      await page.waitForFunction(
        () => document.querySelector('.interference-art').dataset.renderer === 'fallback',
      );
      const details = await page.evaluate(() => ({
        canvases: document.querySelectorAll('canvas').length,
        adapters: window.__gpuQA.adapters,
        devices: window.__gpuQA.devices.length,
        draws: window.__gpuQA.draws,
        pixels:
          document.querySelector('.quartz-journey canvas').width *
          document.querySelector('.quartz-journey canvas').height,
      }));
      assert.equal(details.canvases, 1);
      assert.equal(details.devices, 2);
      assert(
        details.adapters.length === 2 &&
          details.adapters.every((adapter) => adapter.fallback === false),
        'Positive hardware acceptance requires non-fallback adapters',
      );
      assert(details.pixels <= 1600000);
      assert.deepEqual(errors, []);
      results.push({
        path: name,
        first,
        second,
        reversed,
        ...details,
        idleAndHiddenStopped: true,
        rebuildOnceThenFallback: true,
        errors,
      });
      await page.close();
    }
    fs.writeFileSync(
      `${output}/webgpu-native.json`,
      JSON.stringify(
        { capturedAt: new Date().toISOString(), browser: browser.version(), headed: true, results },
        null,
        2,
      ) + '\n',
    );
    console.log(
      'Native WebGPU: actual crystal fan opens and reverses exactly; idle/hidden stop; one rebuild then fallback. Both paths passed.',
    );
  } finally {
    await browser?.close();
    for (const child of servers) child.kill();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
