const { test, expect } = require('@playwright/test');

for (const viewport of [
  { width: 1024, height: 720 },
  { width: 1280, height: 800 },
  { width: 1920, height: 1080 },
]) {
  test(`compact four-platform download sheet at ${viewport.width}x${viewport.height}`, async ({
    page,
  }, info) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const downloads = [],
      errors = [];
    page.on('download', (download) => downloads.push(download.suggestedFilename()));
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('./');
    for (const language of ['zh', 'en']) {
      if (language === 'en') await page.getByRole('button', { name: '切换为英文' }).click();
      const trigger = page.getByRole('button', {
        name: language === 'zh' ? '下载' : 'Download',
        exact: true,
      });
      await trigger.click();
      const dialog = page.getByRole('dialog', {
        name: language === 'zh' ? '下载 Meridian' : 'Download Meridian',
      });
      const close = dialog.getByRole('button', {
        name: language === 'zh' ? '关闭下载窗口' : 'Close download window',
      });
      await expect(close).toBeFocused();
      const box = await dialog.boundingBox();
      expect(box.width).toBe(500);
      expect(box.height).toBeLessThanOrEqual(viewport.height - 64);
      expect(box.y).toBeGreaterThanOrEqual(32);
      await expect(dialog).toHaveCSS('padding', '32px');
      await expect(dialog).toHaveCSS('border-radius', '12px');
      const closeBox = await close.boundingBox();
      expect(closeBox.width).toBe(44);
      expect(closeBox.height).toBe(44);
      const list = dialog.getByRole('list', {
        name: language === 'zh' ? '下载平台' : 'Download platforms',
      });
      const rows = list.getByRole('listitem');
      await expect(rows).toHaveCount(4);
      for (const [index, name] of ['Windows', 'macOS', 'Android', 'iOS'].entries()) {
        const row = rows.nth(index);
        await expect(row.getByText(name, { exact: true })).toBeVisible();
        const namePosition = await row.getByText(name, { exact: true }).evaluate((element) => {
          const range = document.createRange();
          range.selectNodeContents(element);
          return {
            text: range.getBoundingClientRect().left,
            cell: element.getBoundingClientRect().left,
          };
        });
        expect(namePosition.text).toBeCloseTo(namePosition.cell, 0);
        await expect
          .poll(() =>
            row.locator('img').evaluate((image) => image.complete && image.naturalWidth > 0),
          )
          .toBe(true);
        const rowBox = await row.boundingBox();
        expect(rowBox.height).toBe(72);
        expect(rowBox.y + rowBox.height).toBeLessThanOrEqual(box.y + box.height - 31);
        const action = row.getByRole('button', {
          name: `${name} · ${language === 'zh' ? '暂未开放下载' : 'Not available yet'}`,
        });
        await expect(action).toBeDisabled();
        await expect(action).toBeVisible();
        expect(await row.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
          true,
        );
      }
      await expect(dialog.getByRole('img')).toHaveCount(0);
      const icon = dialog.locator('.download-heading img');
      await expect.poll(() => icon.evaluate((image) => image.naturalWidth)).toBeGreaterThan(0);
      await expect(dialog.locator('a')).toHaveCount(0);
      await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
      if (info.project.name === 'root')
        await page.screenshot({
          path: `${process.env.SITE_EVIDENCE_DIR || 'test-results/screenshots'}/after-${language}-${viewport.width}x${viewport.height}.png`,
        });
      await page.keyboard.press('Escape');
      await expect(dialog).not.toBeVisible();
      await expect(trigger).toBeFocused();
      expect(await page.locator('body').evaluate((body) => body.style.overflow)).toBe('');
    }
    expect(downloads).toEqual([]);
    expect(errors).toEqual([]);
  });
}
