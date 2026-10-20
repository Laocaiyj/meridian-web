const { chromium } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

async function move(page, progress) {
  await page.evaluate((value) => {
    const track = document.querySelector('.story-track').getBoundingClientRect();
    const height = document.querySelector('.story-stage').getBoundingClientRect().height;
    scrollTo({
      top:
        scrollY +
        track.top -
        Math.max(32, (innerHeight - height) / 2) +
        (track.height - height) * value,
      behavior: 'instant',
    });
  }, progress);
  await page.waitForFunction(
    (value) =>
      Math.abs(Number(document.querySelector('.workspace-demo').dataset.progress) - value) < 0.001,
    progress,
  );
}

async function main() {
  const staticOnly = process.argv.includes('--static');
  const output = path.resolve(process.env.SITE_EVIDENCE_DIR || 'test-results/capture');
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: staticOnly });
  const records = [];
  try {
    for (const [width, height] of [
      [1024, 720],
      [1280, 800],
      [1920, 1080],
    ]) {
      const context = await browser.newContext({
        viewport: { width, height },
        reducedMotion: staticOnly ? 'reduce' : 'no-preference',
        recordVideo:
          !staticOnly && width === 1280 ? { dir: output, size: { width, height } } : undefined,
      });
      try {
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.goto(process.env.SITE_PREVIEW_URL || 'http://127.0.0.1:4176/');
        for (const language of ['zh', 'en']) {
          if (language === 'en') await page.getByRole('button', { name: '切换为英文' }).click();
          if (!staticOnly) {
            await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
            await page.waitForFunction(
              () => document.querySelector('.quartz-journey').dataset.renderer === 'ready',
            );
            for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
              await page.evaluate(
                (f) => scrollTo({ top: innerHeight * f, behavior: 'instant' }),
                fraction,
              );
              await page.waitForTimeout(80);
              await page.screenshot({
                path: `${output}/${language}-handoff-${fraction}-${width}x${height}.png`,
              });
              records.push({
                width,
                height,
                language,
                handoff: fraction,
                canvases: await page.locator('canvas').count(),
              });
            }
            for (const [name, progress] of [
              ['closed', 0.02],
              ['middle', 0.5],
              ['open', 1],
            ]) {
              await move(page, progress);
              await page.waitForFunction(
                () => document.querySelector('.interference-art').dataset.renderer === 'ready',
              );
              const geometry = await page.evaluate(() => {
                const art = document.querySelector('.interference-art').getBoundingClientRect();
                const demo = document.querySelector('.workspace-demo').getBoundingClientRect();
                return {
                  artRight: art.right,
                  viewport: innerWidth,
                  demo: { x: demo.x, y: demo.y, width: demo.width, height: demo.height },
                  overflow: document.documentElement.scrollWidth > innerWidth,
                };
              });
              assert(
                Math.abs(geometry.artRight - width) <= 1,
                'The fan root belongs at the page edge',
              );
              assert.equal(geometry.overflow, false);
              await page.screenshot({
                path: `${output}/${language}-${name}-${width}x${height}.png`,
              });
              records.push({ width, height, language, progress, ...geometry });
            }
            if (width === 1280 && language === 'zh') {
              for (const progress of Array.from({ length: 31 }, (_, i) => i / 30)) {
                await move(page, progress);
                await page.waitForTimeout(60);
              }
              for (const progress of Array.from({ length: 31 }, (_, i) => 1 - i / 30)) {
                await move(page, progress);
                await page.waitForTimeout(60);
              }
            }
          }
          if (!staticOnly) {
            await page.evaluate(() => {
              const r = document.querySelector('#featured').getBoundingClientRect();
              scrollTo({ top: scrollY + r.top - innerHeight * 0.7, behavior: 'instant' });
            });
            await page.waitForTimeout(100);
            await page.screenshot({ path: `${output}/${language}-seam-${width}x${height}.png` });
            records.push({ width, height, language, seam: true });
          }
          await page.emulateMedia({ reducedMotion: 'reduce' });
          const fallback = page.locator('.quartz-poster-main');
          await fallback.evaluate((image) => image.decode());
          const chapters = await page.locator('.story-chapters a').all();
          assert.equal(chapters.length, 3, 'Capture must include all three product chapters');
          for (const [index, link] of chapters.entries()) {
            await link.click();
            await page.locator('.story-stage').screenshot({
              path: `${output}/${language}-chapter-${index + 1}-${width}x${height}.png`,
            });
          }
          await page.locator('#header').scrollIntoViewIfNeeded();
          await page.screenshot({
            path: `${output}/${language}-static-${width}x${height}.png`,
            fullPage: true,
          });
          records.push({ width, height, language, static: true });
          if (!staticOnly) await page.emulateMedia({ reducedMotion: 'no-preference' });
        }
        assert.deepEqual(errors, []);
        const video = page.video();
        await page.close();
        if (video) {
          await video.saveAs(`${output}/scroll-demonstration.webm`);
          await video.delete();
        }
      } finally {
        await context.close();
      }
    }
    fs.writeFileSync(path.join(output, 'layout.json'), JSON.stringify(records, null, 2) + '\n');
    console.log(
      `Captured bilingual desktop ${staticOnly ? 'static' : 'GPU and static'} states: ${output}`,
    );
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
