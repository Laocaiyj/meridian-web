const { chromium } = require('@playwright/test');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

async function main() {
  const baseline = process.argv[2];
  if (!baseline || !fs.existsSync(path.join(baseline, 'index.html')))
    throw new Error('Pass the preserved baseline build directory');
  const server = spawn(process.execPath, ['scripts/serve.cjs'], {
    env: { ...process.env, PORT: '4177', SITE_BUILD_DIR: path.resolve(baseline) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let browser;
  const results = [];
  try {
    await new Promise((resolve, reject) => {
      server.stdout.once('data', resolve);
      server.once('error', reject);
      server.once('exit', (code) => reject(new Error(`Baseline server exited ${code}`)));
    });
    browser = await chromium.launch({ headless: false });
    for (let sample = 0; sample < 3; sample++)
      for (const [version, url] of [
        ['before', 'http://127.0.0.1:4177/'],
        ['after', 'http://127.0.0.1:4176/'],
      ]) {
        const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
        await page.addInitScript(() => {
          window.__sample = { raf: 0, hidden: false, draws: 0, completions: [], allocations: 0 };
          const gpu = navigator.gpu;
          if (gpu) {
            const request = gpu.requestAdapter.bind(gpu);
            gpu.requestAdapter = async (...args) => {
              const adapter = await request(...args);
              if (!adapter) return adapter;
              const getDevice = adapter.requestDevice.bind(adapter);
              adapter.requestDevice = async (...options) => {
                const device = await getDevice(...options);
                const createBuffer = device.createBuffer.bind(device);
                device.createBuffer = (...descriptor) => {
                  window.__sample.allocations++;
                  return createBuffer(...descriptor);
                };
                const submit = device.queue.submit.bind(device.queue);
                device.queue.submit = (...commands) => {
                  const start = performance.now();
                  submit(...commands);
                  window.__sample.draws++;
                  device.queue
                    .onSubmittedWorkDone()
                    .then(() => window.__sample.completions.push(performance.now() - start));
                };
                return device;
              };
              return adapter;
            };
          }
          const raf = window.requestAnimationFrame;
          window.requestAnimationFrame = (callback) =>
            raf.call(window, (time) => {
              window.__sample.raf++;
              callback(time);
            });
          Object.defineProperty(document, 'hidden', { get: () => window.__sample.hidden });
        });
        await page.goto(url);
        await page.waitForTimeout(300);
        await page.evaluate(() => {
          const tail = document.createElement('div');
          tail.style.height = '1500px';
          tail.setAttribute('aria-hidden', 'true');
          document.body.append(tail);
        });
        const cdp = await page.context().newCDPSession(page);
        await cdp.send('Performance.enable');
        async function snapshot() {
          const values = await cdp.send('Performance.getMetrics');
          return {
            ...(await page.evaluate(() => ({
              raf: window.__sample.raf,
              draws: window.__sample.draws,
              completions: [...window.__sample.completions],
              allocations: window.__sample.allocations,
            }))),
            ...Object.fromEntries(
              values.metrics
                .filter((v) => ['ScriptDuration', 'TaskDuration'].includes(v.name))
                .map((v) => [v.name, v.value]),
            ),
          };
        }
        async function measure(scene, action) {
          const start = await snapshot();
          if (action) await action();
          else await page.waitForTimeout(400);
          const end = await snapshot();
          results.push({
            sample,
            version,
            scene,
            raf: end.raf - start.raf,
            draws: end.draws - start.draws,
            newBuffers: end.allocations - start.allocations,
            submissionCompletionMs: end.completions.slice(start.completions.length),
            scriptMs: (end.ScriptDuration - start.ScriptDuration) * 1000,
            taskMs: (end.TaskDuration - start.TaskDuration) * 1000,
          });
        }
        await measure('hero-idle');
        await measure('hero-pointer', async () => {
          for (let i = 0; i < 16; i++) {
            await page.mouse.move(350 + i * 28, 350 + Math.sin(i) * 70);
            await page.waitForTimeout(25);
          }
        });
        await page.locator('#showcase').scrollIntoViewIfNeeded();
        await page.evaluate(() => {
          const t = document.querySelector('.story-track');
          scrollTo({ top: scrollY + t.getBoundingClientRect().top + 500, behavior: 'instant' });
        });
        await page.waitForTimeout(250);
        await measure('product-idle');
        await measure('product-scroll', async () => {
          for (let i = 0; i < 16; i++) {
            await page.evaluate(() => scrollBy({ top: 10, behavior: 'instant' }));
            await page.waitForTimeout(25);
          }
        });
        await page.evaluate(() =>
          scrollTo({ top: document.body.scrollHeight, behavior: 'instant' }),
        );
        await page.waitForTimeout(250);
        await measure('offscreen');
        await page.evaluate(() => {
          scrollTo({ top: 0, behavior: 'instant' });
          window.__sample.hidden = true;
          document.dispatchEvent(new Event('visibilitychange'));
        });
        await page.waitForTimeout(150);
        await measure('background-event');
        await page.evaluate(() => {
          window.__sample.hidden = false;
          document.dispatchEvent(new Event('visibilitychange'));
        });
        await page.waitForTimeout(100);
        await measure('resume');
        await page.close();
      }
    const output = path.resolve(process.env.SITE_EVIDENCE_DIR || 'test-results/performance');
    fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(
      `${output}/performance.json`,
      JSON.stringify(
        {
          capturedAt: new Date().toISOString(),
          browser: browser.version(),
          headed: true,
          viewport: [1280, 800],
          duration: '400ms idle; 16 pointer/scroll events at 25ms intervals',
          visibility: 'controlled document.hidden events, not OS power measurements',
          timing:
            'Submission-to-completion includes driver and scheduling time; not a hardware GPU timestamp. Both builds use the same product scroll position.',
          results,
        },
        null,
        2,
      ) + '\n',
    );
    console.log(
      `Recorded ${results.length} fresh samples. No CPU or GPU speedup claim is inferred.`,
    );
  } finally {
    await browser?.close();
    server.kill();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
