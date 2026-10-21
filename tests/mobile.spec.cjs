const { test, expect } = require('@playwright/test');
test.use({ isMobile: true, hasTouch: true });
async function phase(page, chapter, amount) {
  const value = (chapter + amount) / 3;
  await page.locator('.story-track').evaluate((el, progress) => {
    const rect = el.getBoundingClientRect();
    const height = document.querySelector('.story-stage').getBoundingClientRect().height;
    scrollTo({
      top:
        scrollY +
        rect.top -
        parseFloat(getComputedStyle(document.querySelector('.story-stage')).top) +
        (rect.height - height) * progress,
      behavior: 'instant',
    });
  }, value);
  await expect
    .poll(async () => Number(await page.locator('.workspace-demo').getAttribute('data-progress')))
    .toBeCloseTo(value, 2);
}
for (const viewport of [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 844, height: 390 },
]) {
  test(`phone preserves the presentation stage and readable content at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('./');
    for (const language of ['zh', 'en']) {
      if (language === 'en') await page.getByRole('button', { name: '切换为英文' }).click();
      const mark = await page.locator('.hero-wordmark').boundingBox();
      expect(mark.x).toBeGreaterThanOrEqual(16);
      expect(mark.x + mark.width).toBeLessThanOrEqual(viewport.width - 16);
      await page.locator('.hero-workflow').tap();
      await expect(page.locator('.sb-spread')).toHaveCount(1);
      const navPositions = [];
      for (let i = 0; i < 3; i++) {
        await page.locator('.story-chapters a').nth(i).tap();
        await expect(page.locator('.workspace-demo')).toHaveAttribute('data-chapter', String(i));
        {
          // Wait for the user-facing smooth jump to settle before an exact test scroll.
          await page.evaluate(
            (target) =>
              new Promise((resolve) => {
                let previous = null,
                  stable = 0;
                const settle = () => {
                  const near =
                    Math.abs(
                      Number(document.querySelector('.workspace-demo').dataset.progress) - target,
                    ) < 0.001;
                  stable = near && scrollY === previous ? stable + 1 : 0;
                  previous = scrollY;
                  if (stable >= 3) resolve();
                  else requestAnimationFrame(settle);
                };
                settle();
              }),
            (i + 0.08) / 3,
          );
          await phase(page, i, 0.001);
          await expect(page.locator('.story-stage')).toHaveCSS('position', 'sticky');
          const stage = await page.locator('.story-stage').boundingBox();
          expect(Math.abs(stage.y - (viewport.height <= 540 ? 16 : 32))).toBeLessThan(1);
          navPositions.push((await page.locator('.story-chapters').boundingBox()).y);
          await phase(page, i, 0.999);
          const documentEnd = await page.locator('.sb-artifact').boundingBox();
          const window = await page.locator('.workspace-demo').boundingBox();
          expect(documentEnd.y + documentEnd.height).toBeLessThanOrEqual(
            window.y + window.height + 2,
          );
        }
        expect(
          await page.locator('.sb-artifact').evaluate((el) => el.scrollWidth <= el.clientWidth),
        ).toBe(true);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
      }
      if (navPositions.length)
        expect(Math.max(...navPositions) - Math.min(...navPositions)).toBeLessThan(1);
      const footer = page.getByRole('contentinfo');
      await footer.scrollIntoViewIfNeeded();
      if (viewport.width < 768) {
        const a = await footer.locator('h2').boundingBox(),
          b = await footer.locator('h3').boundingBox();
        expect(b.y).toBeGreaterThan(a.y + a.height);
      }
      await page
        .getByRole('button', { name: language === 'zh' ? '下载' : 'Download', exact: true })
        .click();
      const dialog = page.getByRole('dialog'),
        r = await dialog.boundingBox();
      expect(r.x).toBeGreaterThanOrEqual(12);
      expect(r.x + r.width).toBeLessThanOrEqual(viewport.width - 12);
      expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      await dialog
        .getByRole('button', { name: language === 'zh' ? '关闭下载窗口' : 'Close download window' })
        .click();
    }
  });
}
test('phone retains creation, handoff, correction, verification and reversible document reveal', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  for (const language of ['zh', 'en']) {
    if (language === 'en') await page.getByRole('button', { name: '切换为英文' }).click();
    await phase(page, 0, 0.1);
    expect(await page.locator('.sb-repository').evaluate((el) => el.hidden)).toBe(true);
    await phase(page, 0, 0.4);
    expect(await page.locator('.sb-repository').evaluate((el) => el.hidden)).toBe(false);
    await phase(page, 1, 0.7);
    expect(
      await page.locator('.sb-transfer [data-when="handedOff"]').evaluate((el) => el.hidden),
    ).toBe(true);
    const offset = await page.locator('.sb-spread').evaluate((el) => el.style.transform);
    await phase(page, 1, 0.9);
    expect(
      await page.locator('.sb-transfer [data-when="handedOff"]').evaluate((el) => el.hidden),
    ).toBe(false);
    await phase(page, 1, 0.7);
    expect(await page.locator('.sb-spread').evaluate((el) => el.style.transform)).toBe(offset);
    await phase(page, 2, 0.3);
    expect(await page.locator('.sb-new-condition').evaluate((el) => el.hidden)).toBe(true);
    await phase(page, 2, 0.6);
    expect(await page.locator('.sb-new-condition').evaluate((el) => el.hidden)).toBe(false);
    await phase(page, 2, 0.9);
    expect(
      await page
        .locator('.sb-passed')
        .first()
        .evaluate((el) => el.hidden),
    ).toBe(false);
    await phase(page, 2, 0.3);
    expect(await page.locator('.sb-new-condition').evaluate((el) => el.hidden)).toBe(true);
    for (const [source, copy] of [
      ['.story-caption', '.story-ink-caption'],
      ['.story-chapters', '.story-ink-chapters'],
    ])
      expect(await page.locator(copy).boundingBox()).toEqual(
        await page.locator(source).boundingBox(),
      );
  }
});
test('phone reduced motion keeps complete selectable documents without clipping', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  await page.locator('.hero-workflow').tap();
  for (let i = 0; i < 3; i++) {
    await page.locator('.story-chapters a').nth(i).tap();
    await expect(page.locator('.workspace-demo')).toHaveAttribute('data-chapter', String(i));
    expect(
      await page
        .locator('.workspace-demo')
        .evaluate((el) => el.scrollHeight <= el.clientHeight + 1),
    ).toBe(true);
  }
  await expect(page.locator('.quartz-journey')).toHaveAttribute('data-renderer', 'static');
  await expect(page.locator('.technology-track')).toHaveCSS('animation-name', 'none');
});
test('phone legacy narrative and inverse projection remain aligned', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./?demo=legacy');
  await phase(page, 1, 0.5);
  await expect(page.locator('.story-ink')).toBeVisible();
  for (const [source, copy] of [
    ['.story-caption', '.story-ink-caption'],
    ['.story-chapters', '.story-ink-chapters'],
  ])
    expect(await page.locator(copy).boundingBox()).toEqual(
      await page.locator(source).boundingBox(),
    );
});

test('short dynamic phone keeps the newly delivered handoff state readable before revealing the result', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 680 });
  await page.goto('./');
  await page.getByRole('button', { name: '切换为英文' }).click();
  for (const amount of [0.801, 0.9]) {
    await phase(page, 1, amount);
    const box = await page
      .locator('.sb-handoff > div:last-child > [data-when="handedOff"]')
      .boundingBox();
    const window = await page.locator('.workspace-demo').boundingBox();
    expect(box.y).toBeGreaterThanOrEqual(window.y);
    expect(box.y + box.height).toBeLessThanOrEqual(window.y + window.height);
  }
  await phase(page, 1, 0.999);
  const result = await page.locator('.sb-artifact').boundingBox(),
    window = await page.locator('.workspace-demo').boundingBox();
  expect(result.y + result.height).toBeLessThanOrEqual(window.y + window.height + 2);
});
