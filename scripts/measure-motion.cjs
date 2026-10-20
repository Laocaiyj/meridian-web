const { chromium } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ headless: false });
  const samples = [];
  try {
    for (let sample = 0; sample < 3; sample++) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      await page.addInitScript(() => {
        window.__motionProbe = { callbacks: 0, draws: 0, textures: 0, hidden: false, submits: [] };
        const raf = requestAnimationFrame;
        window.requestAnimationFrame = (cb) =>
          raf((t) => {
            window.__motionProbe.callbacks++;
            cb(t);
          });
        Object.defineProperty(document, 'hidden', { get: () => window.__motionProbe.hidden });
        const request = navigator.gpu.requestAdapter.bind(navigator.gpu);
        navigator.gpu.requestAdapter = async (...args) => {
          const adapter = await request(...args);
          if (!adapter) return adapter;
          const get = adapter.requestDevice.bind(adapter);
          adapter.requestDevice = async (...args) => {
            const device = await get(...args);
            const submit = device.queue.submit.bind(device.queue),
              texture = device.createTexture.bind(device);
            device.queue.submit = (...a) => {
              window.__motionProbe.draws++;
              window.__motionProbe.submits.push(performance.now());
              return submit(...a);
            };
            device.createTexture = (...a) => {
              window.__motionProbe.textures++;
              return texture(...a);
            };
            return device;
          };
          return adapter;
        };
      });
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Performance.enable');
      const read = async () => ({
        probe: await page.evaluate(() => ({ ...window.__motionProbe })),
        metrics: Object.fromEntries(
          (await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]),
        ),
      });
      await page.goto(process.env.MEASURE_URL || 'http://127.0.0.1:4176/');
      await page.waitForFunction(
        () => document.querySelector('.quartz-journey').dataset.renderer === 'ready',
      );
      const entryStart = await read();
      await page.waitForTimeout(700);
      const entryEnd = await read();
      function record(scene, a, b) {
        samples.push({
          sample,
          scene,
          draws: b.probe.draws - a.probe.draws,
          callbacks: b.probe.callbacks - a.probe.callbacks,
          textures: b.probe.textures - a.probe.textures,
          taskMs: +((b.metrics.TaskDuration - a.metrics.TaskDuration) * 1000).toFixed(2),
          scriptMs: +((b.metrics.ScriptDuration - a.metrics.ScriptDuration) * 1000).toFixed(2),
          elapsedMs: +((b.metrics.Timestamp - a.metrics.Timestamp) * 1000).toFixed(2),
        });
      }
      record('opening-idle', entryStart, entryEnd);
      assert.equal(entryEnd.probe.draws, entryStart.probe.draws, 'No entrance animation');
      for (const scene of ['idle', 'scroll-handoff', 'story-scroll', 'background', 'offscreen']) {
        if (scene === 'background')
          await page.evaluate(() => {
            window.__motionProbe.hidden = true;
            document.dispatchEvent(new Event('visibilitychange'));
          });
        if (scene === 'offscreen') await page.locator('#featured').scrollIntoViewIfNeeded();
        await page.waitForTimeout(120);
        const a = await read();
        if (scene.includes('scroll'))
          for (let i = 0; i < 24; i++) {
            await page.evaluate(
              ({ i, scene }) =>
                scrollTo({
                  top:
                    scene === 'scroll-handoff'
                      ? (innerHeight * i) / 24
                      : innerHeight * (1.5 + i / 24),
                  behavior: 'instant',
                }),
              { i, scene },
            );
            await page.waitForTimeout(35);
          }
        else await page.waitForTimeout(700);
        const b = await read();
        record(scene, a, b);
        if (['idle', 'background', 'offscreen'].includes(scene))
          assert.equal(b.probe.draws, a.probe.draws, `${scene} must not draw`);
        if (scene === 'background')
          await page.evaluate(() => {
            window.__motionProbe.hidden = false;
            document.dispatchEvent(new Event('visibilitychange'));
          });
      }
      await page.close();
    }
    const output = path.resolve(process.env.SITE_EVIDENCE_DIR || 'test-results/motion');
    fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(
      path.join(output, 'motion-performance.json'),
      JSON.stringify(
        {
          capturedAt: new Date().toISOString(),
          scope:
            'Native WebGPU queue submissions and Chromium task metrics; three local samples, not GPU execution time or release performance',
          samples,
        },
        null,
        2,
      ) + '\n',
    );
    console.log(JSON.stringify(samples));
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
