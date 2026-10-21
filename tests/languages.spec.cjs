const { test, expect } = require('@playwright/test');
const { selectLanguage } = require('./language.cjs');

const locales = [
  {
    code: 'en',
    label: 'Language',
    title: 'Meridian — AI Development Workspace',
    action: 'See how it works',
    trigger: 'Download',
    dialog: 'Download Meridian',
    contact: 'Business inquiries',
  },
  {
    code: 'zh',
    label: '语言',
    title: 'Meridian — AI 开发工作空间',
    action: '看看如何工作',
    trigger: '下载',
    dialog: '下载 Meridian',
    contact: '商务联系',
  },
  {
    code: 'ja',
    label: '言語',
    title: 'Meridian — AI 開発ワークスペース',
    action: '使い方を見る',
    trigger: 'ダウンロード',
    dialog: 'Meridian をダウンロード',
    contact: 'ビジネスのお問い合わせ',
  },
  {
    code: 'ko',
    label: '언어',
    title: 'Meridian — AI 개발 워크스페이스',
    action: '작동 방식 보기',
    trigger: '다운로드',
    dialog: 'Meridian 다운로드',
    contact: '비즈니스 문의',
  },
];

test('fresh visits use English even with a Chinese browser locale and English HTML metadata', async ({
  page,
}) => {
  const response = await page.request.get('./');
  const html = await response.text();
  expect(html).toContain('<html lang="en">');
  expect(html).toContain('<title>Meridian — AI Development Workspace</title>');
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'language', { get: () => 'zh-CN' }),
  );
  await page.goto('./');
  await expect(page.getByRole('combobox', { name: 'Language' })).toHaveAttribute('value', 'en');
  await expect(page.getByRole('link', { name: 'See how it works' })).toBeVisible();
});

test('all languages persist through reload without restarting artwork or wordmark on selection', async ({
  page,
}) => {
  await page.goto('./');
  for (const locale of locales) {
    const canvas = await page.locator('.quartz-journey canvas').elementHandle();
    await expect(page.locator('.hero-wordmark')).toHaveAttribute('data-motion', 'complete');
    await selectLanguage(page, locale.code);
    await expect(page.getByRole('combobox', { name: locale.label })).toHaveAttribute(
      'value',
      locale.code,
    );
    await expect(page).toHaveTitle(locale.title);
    await expect(page.locator('.hero-wordmark')).toHaveAttribute('data-motion', 'complete');
    expect(
      await canvas.evaluate(
        (element) => element === document.querySelector('.quartz-journey canvas'),
      ),
    ).toBe(true);
    await page.reload();
    await expect(page.getByRole('combobox')).toHaveAttribute('value', locale.code);
    await expect(page.getByRole('link', { name: locale.action })).toBeVisible();
  }
});

test('language menu supports keyboard cancellation, selection and outside dismissal', async ({
  page,
}) => {
  await page.goto('./');
  const trigger = page.getByRole('combobox');
  await trigger.focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('listbox')).toBeVisible();
  await page.keyboard.press('End');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(trigger).toHaveAttribute('value', 'en');
  await expect(trigger).toBeFocused();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await expect(trigger).toHaveAttribute('value', 'ko');
  await trigger.click();
  await page.mouse.click(20, 100);
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await trigger.click();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(trigger).not.toBeFocused();
});

test('invalid preferences and blocked storage leave the site usable', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('meridian-language', 'toString'));
  await page.goto('./');
  await expect(page.getByRole('combobox')).toHaveAttribute('value', 'en');
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new Error('blocked');
    };
    Storage.prototype.setItem = () => {
      throw new Error('blocked');
    };
  });
  await page.reload();
  await selectLanguage(page, 'ja');
  await expect(page.getByRole('link', { name: '使い方を見る' })).toBeVisible();
});

for (const viewport of [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 1280, height: 800 },
  { width: 1920, height: 1080 },
]) {
  test(`four languages keep readable chapters and downloads at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('./');
    for (const locale of locales) {
      await selectLanguage(page, locale.code);
      await expect(page.locator('html')).toHaveAttribute(
        'lang',
        locale.code === 'zh' ? 'zh-CN' : locale.code,
      );
      await expect(page.getByRole('link', { name: locale.action })).toBeVisible();
      await page.getByRole('button', { name: locale.trigger, exact: true }).click();
      const dialog = page.getByRole('dialog', { name: locale.dialog });
      await expect(dialog).toBeVisible();
      expect(await dialog.getByRole('button', { disabled: true }).count()).toBe(4);
      const box = await dialog.boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
      await page.keyboard.press('Escape');
      for (let chapter = 0; chapter < 3; chapter++) {
        await page.locator('.story-track').evaluate((element, index) => {
          const stage = document.querySelector('.story-stage');
          scrollTo({
            top:
              scrollY +
              element.getBoundingClientRect().top -
              parseFloat(getComputedStyle(stage).top) +
              (element.offsetHeight - stage.offsetHeight) * ((index + 0.8) / 3),
            behavior: 'instant',
          });
        }, chapter);
        await expect(page.locator('.workspace-demo')).toHaveAttribute(
          'data-chapter',
          String(chapter),
        );
        await expect(page.locator('.sb-task h4')).toBeVisible();
        const overflows = await page
          .locator('.sb-task, .sb-artifact, .story-caption, .story-chapters')
          .evaluateAll((elements) =>
            elements.filter((e) => e.scrollWidth > e.clientWidth + 2).map((e) => e.className),
          );
        expect(overflows).toEqual([]);
      }
      await page.getByRole('contentinfo').scrollIntoViewIfNeeded();
      await expect(page.getByRole('contentinfo')).toContainText(locale.contact);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    }
    expect(errors).toEqual([]);
  });
}
