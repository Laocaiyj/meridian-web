const { test, expect } = require('@playwright/test');
const { selectLanguage } = require('./language.cjs');

// Existing presentation regressions start with an explicit Chinese preference.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('meridian-language', 'zh'));
});
const { createHash } = require('node:crypto');

test('published entry defaults to the current concept demonstration and omits the removed company description', async ({
  page,
}) => {
  await page.goto('./');
  await expect(page.locator('.story-stage')).toHaveAttribute('data-demo', 'storyboard');
  await expect(page.locator('.workspace-demo')).toHaveClass(/storyboard-prototype/);
  await expect(page.getByRole('contentinfo')).not.toContainText('专注于 AI 开发工具');
  await selectLanguage(page, 'en');
  await expect(page.getByRole('contentinfo')).not.toContainText('Building AI development tools');
});

test('company footer follows the technology section with bilingual information and inert placeholders', async ({
  page,
}) => {
  await page.goto('./');
  const footer = page.getByRole('contentinfo');
  for (const language of ['zh', 'en']) {
    if (language === 'en') await selectLanguage(page, 'en');
    await footer.scrollIntoViewIfNeeded();
    await expect(footer).toContainText('無厚理則科技有限公司');
    await expect(footer).toContainText('Mou-Hau Logic');
    await expect(footer).toContainText(language === 'zh' ? '商务联系' : 'Business inquiries');
    await expect(footer.locator('dd')).toHaveText(
      language === 'zh' ? ['待公布', '待公布'] : ['To be announced', 'To be announced'],
    );
    await expect(footer.locator('a')).toHaveCount(0);
    await expect(
      footer.getByText(language === 'zh' ? '核心产品' : 'Product', { exact: true }),
    ).toHaveCount(0);
    await expect(footer).toHaveCSS('background-color', 'rgb(29, 29, 31)');
    expect(await footer.evaluate((element) => element.previousElementSibling.tagName)).toBe('MAIN');
    expect(
      await footer.evaluate(
        (element) =>
          element.getBoundingClientRect().top >=
          document.querySelector('#featured').getBoundingClientRect().bottom,
      ),
    ).toBe(true);
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  }
});

async function settle(page) {
  await page.waitForTimeout(160);
}
async function installProbe(page) {
  await page.addInitScript(() => {
    window.__probe = { callbacks: 0, hidden: false };
    const raf = window.requestAnimationFrame;
    window.requestAnimationFrame = (callback) =>
      raf.call(window, (time) => {
        window.__probe.callbacks++;
        callback(time);
      });
    Object.defineProperty(document, 'hidden', { get: () => window.__probe.hidden });
    Object.defineProperty(document, 'visibilityState', {
      get: () => (window.__probe.hidden ? 'hidden' : 'visible'),
    });
  });
}

async function holdWordmark(page) {
  await page.addInitScript(() => {
    window.__wordmarkAnimations = [];
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (...args) {
      const animation = animate.apply(this, args);
      if (this.classList.contains('hero-wordmark-band')) {
        animation.pause();
        window.__wordmarkAnimations.push(animation);
      }
      return animation;
    };
  });
}

test('wordmark bands reveal without layout shift, settle once and do not replay', async ({
  page,
}) => {
  await holdWordmark(page);
  await page.goto('./');
  const mark = page.locator('.hero-wordmark');
  await expect(mark).toHaveAttribute('data-motion', 'running');
  expect(await page.evaluate(() => window.__wordmarkAnimations.length)).toBe(6);
  const before = await mark.boundingBox();
  const initial = await page
    .locator('.hero-wordmark-band')
    .first()
    .evaluate((band) => getComputedStyle(band).clipPath);
  await page.evaluate(() =>
    window.__wordmarkAnimations.forEach((animation) => {
      animation.currentTime = 360;
    }),
  );
  await page.waitForTimeout(60);
  expect(
    await page
      .locator('.hero-wordmark-band')
      .first()
      .evaluate((band) => getComputedStyle(band).clipPath),
  ).not.toBe(initial);
  expect(await mark.boundingBox()).toEqual(before);
  await selectLanguage(page, 'en');
  expect(await page.evaluate(() => window.__wordmarkAnimations.length)).toBe(6);
  const translated = await mark.boundingBox();
  await page.evaluate(() => window.__wordmarkAnimations.forEach((animation) => animation.finish()));
  await expect(mark).toHaveAttribute('data-motion', 'complete');
  await expect(page.getByRole('img', { name: 'Meridian' })).toHaveCSS('opacity', '1');
  expect(await mark.boundingBox()).toEqual(translated);
  await page.evaluate(() => {
    scrollTo(0, 900);
    scrollTo(0, 0);
  });
  await page.setViewportSize({ width: 1024, height: 720 });
  await page.waitForTimeout(160);
  expect(await page.evaluate(() => window.__wordmarkAnimations.length)).toBe(6);
  expect(await mark.evaluate((element) => element.getAnimations({ subtree: true }).length)).toBe(0);
});

test('wordmark respects reduced motion and completes immediately when hidden', async ({ page }) => {
  await holdWordmark(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  const mark = page.locator('.hero-wordmark');
  await expect(mark).toHaveAttribute('data-motion', 'complete');
  expect(await page.evaluate(() => window.__wordmarkAnimations.length)).toBe(0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.waitForTimeout(60);
  expect(await page.evaluate(() => window.__wordmarkAnimations.length)).toBe(0);
  await page.reload();
  await expect(mark).toHaveAttribute('data-motion', 'running');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(mark).toHaveAttribute('data-motion', 'complete');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.reload();
  await expect(mark).toHaveAttribute('data-motion', 'running');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(mark).toHaveAttribute('data-motion', 'complete');
  expect(await mark.evaluate((element) => element.getAnimations({ subtree: true }).length)).toBe(0);
});

test('late wordmark assets show the final mark without a delayed entrance', async ({ page }) => {
  await holdWordmark(page);
  await page.route('**/meridian-wordmark-positive.svg', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await route.continue();
  });
  await page.goto('./');
  await expect(page.locator('.hero-wordmark')).toHaveAttribute('data-motion', 'complete');
  expect(await page.evaluate(() => window.__wordmarkAnimations.length)).toBe(0);
});

test('hero primary entry opens the workflow by keyboard and keeps downloads secondary', async ({
  page,
}) => {
  await page.goto('./?demo=storyboard');
  for (const language of ['zh', 'en']) {
    if (language === 'en') await selectLanguage(page, 'en');
    const entry = page.getByRole('link', {
      name: language === 'zh' ? '看看如何工作' : 'See how it works',
    });
    const download = page.getByRole('button', {
      name: language === 'zh' ? '下载' : 'Download',
      exact: true,
    });
    await expect(entry).toHaveAttribute('href', '#showcase');
    await expect(entry).toHaveCSS('background-color', 'rgb(29, 29, 31)');
    await page.mouse.move(0, 0);
    await expect(download).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await entry.focus();
    await expect(entry).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\?demo=storyboard#showcase$/);
    await expect
      .poll(() =>
        page
          .locator('#showcase')
          .evaluate((element) => Math.abs(element.getBoundingClientRect().top)),
      )
      .toBeLessThan(2);
    await expect(page.locator('.story-stage')).toHaveAttribute('data-demo', 'storyboard');
    await expect(page.locator('.hero-wordmark')).toHaveAttribute('data-motion', 'complete');
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    await download.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(download).toBeFocused();
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('link', { name: 'See how it works' }).click();
  await expect
    .poll(() =>
      page
        .locator('#showcase')
        .evaluate((element) => Math.abs(element.getBoundingClientRect().top)),
    )
    .toBeLessThan(2);
});

test('current-language labels, metadata and the original local wordmark work without a toolbar', async ({
  page,
}) => {
  const content = require('../src/content/site.json');
  const errors = [],
    failures = [],
    external = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400) failures.push(response.url());
  });
  page.on('request', (request) => {
    if (!new URL(request.url()).hostname.match(/^(127\.0\.0\.1|localhost)$/))
      external.push(request.url());
  });
  await page.goto('./');
  await expect(page).toHaveTitle('Meridian — AI 开发工作空间');
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await expect(page.getByRole('navigation')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /暂停|继续|播放|动态效果/ })).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1, name: 'Meridian' })).toBeVisible();
  const wordmark = page.getByRole('img', { name: 'Meridian' });
  await expect(wordmark).toBeVisible();
  const svg = await page.request.get(await wordmark.getAttribute('src'));
  expect(
    createHash('sha256')
      .update(await svg.body())
      .digest('hex'),
  ).toBe('2d03dfa6037654d76b67f52a6fe2d5882a26abd615d91518522f571fbdb1cead');
  for (const file of ['meridian-wordmark-NOTICE.txt', 'roboto-slab-LICENSE.txt']) {
    expect((await page.request.get(`licenses/${file}`)).status()).toBe(200);
  }
  await expect(page.getByRole('combobox')).toHaveAttribute('value', 'zh');
  await selectLanguage(page, 'en');
  await expect(page.getByRole('combobox')).toHaveAttribute('value', 'en');
  await expect(page).toHaveTitle('Meridian — AI Development Workspace');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    'content',
    content.en.meta.description,
  );
  await selectLanguage(page, 'zh');
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    'content',
    content.zh.meta.description,
  );
  expect(errors).toEqual([]);
  expect(failures).toEqual([]);
  expect(external).toEqual([]);
});

test('unavailable downloads preserve native modal focus, background isolation and scrolling', async ({
  page,
}) => {
  await page.goto('./');
  const trigger = page.getByRole('button', { name: '下载', exact: true });
  for (const closeWith of ['escape', 'button', 'backdrop']) {
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: '下载 Meridian' });
    const close = dialog.getByRole('button', { name: '关闭下载窗口' });
    await expect(close).toBeFocused();
    await expect(dialog).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await expect(dialog.getByRole('button', { name: /Windows/ })).toBeDisabled();
    await expect(dialog.getByRole('button', { name: /macOS/ })).toBeDisabled();
    expect(await dialog.locator('a').count()).toBe(0);
    await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    expect(
      await dialog.evaluate(
        (element) =>
          element.contains(document.activeElement) || document.activeElement === document.body,
      ),
    ).toBe(true);
    if (closeWith === 'escape') await page.keyboard.press('Escape');
    if (closeWith === 'button') await close.click();
    if (closeWith === 'backdrop') await page.mouse.click(8, 120);
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
    expect(await page.locator('body').evaluate((element) => element.style.overflow)).toBe('');
  }
});

test('one quartz actor preserves identity, reverses, and stops background work', async ({
  page,
}) => {
  await installProbe(page);
  await page.goto('./');
  await settle(page);
  await expect(page.locator('.quartz-journey')).toHaveAttribute('data-progress', '0.0000');
  const fixedBox = await page.locator('.quartz-journey').evaluate((n) => n.style.cssText);
  const idle = await page.evaluate(() => window.__probe.callbacks);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__probe.callbacks)).toBe(idle);
  const actor = await page.locator('.quartz-journey canvas').elementHandle();
  const root = await page.locator('.quartz-journey').elementHandle();
  const snapshot = () =>
    page.locator('.quartz-journey').evaluate((n) => ({
      pose: n.dataset.progress,
      detail: n.dataset.detail,
      box: n.style.cssText,
    }));
  await page.evaluate(() => scrollTo({ top: 400, behavior: 'instant' }));
  await settle(page);
  const midway = await snapshot();
  expect(midway.box).toBe(fixedBox);
  await page.evaluate(() => scrollTo({ top: 800, behavior: 'instant' }));
  await settle(page);
  expect(Number((await snapshot()).pose)).toBeGreaterThan(Number(midway.pose));
  await page.evaluate(() => scrollTo({ top: 400, behavior: 'instant' }));
  await settle(page);
  expect(await snapshot()).toEqual(midway);
  expect(await actor.evaluate((n) => n === document.querySelector('.quartz-journey canvas'))).toBe(
    true,
  );
  expect(await root.evaluate((n) => n === document.querySelector('.quartz-journey'))).toBe(true);
  await expect(page.locator('canvas')).toHaveCount(1);
  await page.evaluate(() => {
    window.__probe.hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await settle(page);
  const callbacks = await page.evaluate(() => window.__probe.callbacks);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__probe.callbacks)).toBe(callbacks);
});

test('light controls keep distinct hover, keyboard-focus and unavailable states', async ({
  page,
}) => {
  await page.goto('./');
  const trigger = page.getByRole('button', { name: '下载', exact: true });
  await trigger.focus();
  await expect(trigger).toHaveCSS('outline-style', 'solid');
  const idle = await trigger.evaluate((element) => getComputedStyle(element).backgroundColor);
  await trigger.hover();
  await expect(trigger).not.toHaveCSS('background-color', idle);
  await trigger.click();
  const close = page.getByRole('button', { name: '关闭下载窗口' });
  await close.hover();
  await expect(close).toHaveCSS('background-color', 'rgb(245, 245, 247)');
  const disabled = page.getByRole('button', { name: /Windows/ });
  await expect(disabled).toBeDisabled();
  await expect(disabled).toHaveCSS('opacity', '1');
  await expect(disabled).toHaveCSS('background-color', 'rgb(245, 245, 247)');
});

function contrastRatio(first, second) {
  const luminance = (color) =>
    color
      .match(/[\d.]+/g)
      .slice(0, 3)
      .map(Number)
      .map((value) => {
        const channel = value / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      })
      .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
  const a = luminance(first),
    b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

test('download hover text contrast remains at least 4.5 to 1', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  const trigger = page.getByRole('button', { name: '下载', exact: true });
  await trigger.hover();
  const colors = await trigger.evaluate((element) => {
    const style = getComputedStyle(element);
    return [style.color, style.backgroundColor];
  });
  expect(contrastRatio(...colors)).toBeGreaterThanOrEqual(4.5);
});

test('language control stays in the opening page area instead of following scroll', async ({
  page,
}) => {
  await page.goto('./');
  const language = page.getByRole('combobox');
  await expect(language).toBeInViewport();
  const start = await language.boundingBox();
  await page.evaluate(() => scrollTo({ top: innerHeight, behavior: 'instant' }));
  await expect(language).not.toBeInViewport();
  const scrolled = await language.boundingBox();
  expect(scrolled.y).toBeCloseTo(start.y - (await page.evaluate(() => scrollY)), 0);
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await expect(language).toBeInViewport();
  await selectLanguage(page, 'en');
  await expect(page.getByRole('combobox')).toHaveAttribute('value', 'en');
});
