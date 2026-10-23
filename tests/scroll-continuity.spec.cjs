const { test, expect } = require('@playwright/test');
const { selectLanguage } = require('./language.cjs');

// Existing presentation regressions start with an explicit Chinese preference.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('meridian-language', 'zh'));
});
async function scroll(page, target) {
  await page.evaluate((top) => scrollTo({ top, behavior: 'instant' }), target);
  await page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
  );
}
async function seek(page, progress) {
  const top = await page.locator('.story-track').evaluate((el, p) => {
    const r = el.getBoundingClientRect(),
      stage = document.querySelector('.story-stage');
    return (
      scrollY +
      r.top -
      parseFloat(getComputedStyle(stage).top) +
      (r.height - stage.getBoundingClientRect().height) * p
    );
  }, progress);
  await scroll(page, top);
}
test('both sculptures enter continuously and remain until the section has exited', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  const top = await page
    .locator('#showcase')
    .evaluate((el) => scrollY + el.getBoundingClientRect().top);
  await scroll(page, top - 1);
  const before = Number(await page.locator('.quartz-journey').getAttribute('data-accent-progress'));
  await scroll(page, top + 1);
  const after = Number(await page.locator('.quartz-journey').getAttribute('data-accent-progress'));
  expect(Math.abs(after - before)).toBeLessThan(0.01);
  const end = await page
    .locator('#showcase')
    .evaluate((el) => scrollY + el.getBoundingClientRect().bottom);
  for (const y of [end - 80, end - 1]) {
    await scroll(page, y);
    await expect(page.locator('.quartz-journey')).not.toHaveAttribute('hidden', '');
  }
  await scroll(page, end + 2);
  await expect(page.locator('.quartz-journey')).toHaveAttribute('hidden', '');
  await scroll(page, end - 80);
  await expect(page.locator('.quartz-journey')).not.toHaveAttribute('hidden', '');
});
test('resizing across layout and height boundaries preserves the current scroll chapter', async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 800 });
  await page.goto('./');
  await seek(page, 0.55);
  for (const viewport of [
    { width: 901, height: 800 },
    { width: 900, height: 800 },
    { width: 390, height: 680 },
    { width: 390, height: 679 },
    { width: 390, height: 844 },
    { width: 1280, height: 800 },
  ]) {
    await page.setViewportSize(viewport);
    await page.evaluate(
      () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
    );
    await expect
      .poll(async () => Number(await page.locator('.workspace-demo').getAttribute('data-progress')))
      .toBeCloseTo(0.55, 2);
    await expect(page.locator('.workspace-demo')).toHaveAttribute('data-chapter', '1');
    const box = await page.locator('.story-stage').boundingBox();
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
  }
});
test('inverse text follows native sticky scrolling without waiting for the animation callback', async ({
  page,
}) => {
  await page.goto('./');
  const top = await page
    .locator('.story-track')
    .evaluate((el) => scrollY + el.getBoundingClientRect().top);
  await scroll(page, top - 300);
  await page.evaluate(async () => {
    const native = requestAnimationFrame;
    window.requestAnimationFrame = () => -1;
    scrollBy({ top: 120, behavior: 'instant' });
    await new Promise((done) => native(() => native(done)));
  });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const source = document.querySelector('.story-caption').getBoundingClientRect();
        const copy = document.querySelector('.story-ink-caption').getBoundingClientRect();
        return Math.abs(source.y - copy.y);
      }),
    )
    .toBeLessThan(1);
});

test('short stages reveal every newly introduced task state before moving to the result', async ({
  page,
}) => {
  for (const viewport of [
    { width: 844, height: 390 },
    { width: 390, height: 679 },
    { width: 1280, height: 500 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('./');
    await selectLanguage(page, 'en');
    for (const [progress, selector] of [
      [(1 + 0.81) / 3, '.sb-handoff > div:last-child > [data-when="handedOff"]'],
      [(1 + 0.9) / 3, '.sb-handoff > div:last-child > [data-when="handedOff"]'],
      [(2 + 0.51) / 3, '.sb-review-finding > [data-when="corrected"]'],
      [(2 + 0.83) / 3, '.sb-task-result > [data-when="verified"]'],
    ]) {
      await seek(page, progress);
      await expect(page.locator(selector)).toBeVisible();
      const text = await page.locator(selector).boundingBox(),
        window = await page.locator('.workspace-demo').boundingBox();
      expect(text.y).toBeGreaterThanOrEqual(window.y - 1);
      expect(text.y + text.height).toBeLessThanOrEqual(window.y + window.height + 1);
    }
  }
});
test('reduced motion text stays aligned in landscape after introduction reflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  await page.locator('.hero-workflow').click();
  const expectAligned = () =>
    expect
      .poll(() =>
        page.evaluate(() => {
          const source = document.querySelector('.story-caption').getBoundingClientRect();
          const copy = document.querySelector('.story-ink-caption').getBoundingClientRect();
          return Math.abs(source.y - copy.y);
        }),
      )
      .toBeLessThan(1);
  await expectAligned();
  // A late text reflow moves the track without resizing the stage or its documents.
  await page.locator('.story-intro-copy > p:last-child').evaluate((paragraph) => {
    paragraph.style.lineHeight = `${parseFloat(getComputedStyle(paragraph).lineHeight) + 1.5}px`;
  });
  await expectAligned();
});

for (const [width, height] of [
  [320, 568],
  [360, 640],
  [390, 844],
  [430, 932],
  [568, 320],
  [768, 1024],
  [820, 1180],
  [900, 700],
  [901, 700],
  [1024, 720],
  [1280, 800],
  [1920, 1080],
]) {
  test(`responsive narrative remains readable at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('./');
    for (const language of ['zh', 'en']) {
      if (language === 'en') await selectLanguage(page, 'en');
      for (let chapter = 0; chapter < 3; chapter++) {
        await seek(page, (chapter + 0.001) / 3);
        const paragraph = await page
            .locator('.story-caption .story-caption-current p')
            .boundingBox(),
          nav = await page.locator('.story-chapters').boundingBox();
        expect(paragraph.y + paragraph.height).toBeLessThanOrEqual(nav.y - 8);
        const copy = await page.locator('.story-ink-caption').boundingBox(),
          source = await page.locator('.story-caption').boundingBox();
        expect(Math.abs(copy.y - source.y)).toBeLessThan(1);
        expect(Math.abs(copy.height - source.height)).toBeLessThan(1);
        await seek(page, (chapter + 0.999) / 3);
        const artifact = await page.locator('.sb-artifact').boundingBox(),
          window = await page.locator('.workspace-demo').boundingBox();
        expect(artifact.y + artifact.height).toBeLessThanOrEqual(window.y + window.height + 2);
        expect(
          await page.locator('.sb-artifact').evaluate((el) => el.scrollWidth <= el.clientWidth),
        ).toBe(true);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
      }
    }
  });
}
