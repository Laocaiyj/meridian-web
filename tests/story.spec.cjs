const { test, expect } = require('@playwright/test');

async function progress(page, value) {
  await page.evaluate((p) => {
    const track = document.querySelector('.story-track');
    const stage = document.querySelector('.story-stage');
    const rect = track.getBoundingClientRect();
    const height = stage.getBoundingClientRect().height;
    window.scrollTo({
      top:
        scrollY + rect.top - Math.max(32, (innerHeight - height) / 2) + (rect.height - height) * p,
      behavior: 'instant',
    });
  }, value);
  await expect
    .poll(async () => {
      const actual = Number(await page.locator('.workspace-demo').getAttribute('data-progress'));
      const travel = await page
        .locator('.story-track')
        .evaluate(
          (track) =>
            track.getBoundingClientRect().height -
            document.querySelector('.story-stage').getBoundingClientRect().height,
        );
      return Math.abs(actual - value) * travel;
    })
    .toBeLessThanOrEqual(1);
}

test('one project proceeds through code, handoff, correction and delivery, and reverses', async ({
  page,
}) => {
  await page.goto('./?demo=legacy');
  await progress(page, 0.3);
  await expect(page.locator('.repository-files')).toBeVisible();
  await expect(page.getByText('项目已建立 · 本地示例').first()).toBeVisible();
  await progress(page, 0.62);
  await expect(page.getByText('已交接 · 变更与检查要求')).toBeVisible();
  await expect(page.locator('.code-snapshot:visible')).not.toContainText("tag === 'all'");
  await progress(page, 0.7);
  await expect(page.getByText('发现遗漏：选择 all 应显示全部笔记。')).toBeVisible();
  await expect(page.getByText('3 项示例检查通过')).not.toBeVisible();
  await progress(page, 1);
  await expect(page.locator('.code-snapshot:visible')).toContainText("tag === 'all'");
  await expect(page.getByText('3 项示例检查通过')).toBeVisible();
  await expect(page.getByText(/版本记录 · 标签筛选已交付/)).toBeVisible();
  await progress(page, 0.7);
  await expect(page.locator('.code-snapshot:visible')).not.toContainText("tag === 'all'");
  await expect(page.getByText('3 项示例检查通过')).not.toBeVisible();
  const snapshot = await page.locator('.workspace-demo').innerText();
  await page.waitForTimeout(350);
  expect(await page.locator('.workspace-demo').innerText()).toBe(snapshot);
  await page.locator('#header').scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: '切换为英文' }).click();
  await progress(page, 0.7);
  await expect(page.locator('.workspace-demo')).toHaveAttribute('data-chapter', '2');
  await expect(page.getByText('Missing case: selecting all should show every note.')).toBeVisible();
});

test('chapter links support keyboard jumps and reduced motion has complete snapshots', async ({
  page,
}) => {
  await page.goto('./?demo=legacy');
  await progress(page, 0.05);
  const code = page.getByRole('link', { name: /代码与协作/ });
  await code.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.workspace-demo')).toHaveAttribute('data-chapter', '1');
  await expect(code).toHaveAttribute('aria-current', 'step');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('link', { name: /检查与交付/ }).click();
  await expect(page.getByText('3 项示例检查通过')).toBeVisible();
  await page.getByRole('link', { name: /项目与代码库/ }).click();
  await expect(page.locator('.repository-files')).toBeVisible();
  await expect(page.locator('.quartz-journey canvas')).toBeHidden();
  await expect(page.getByRole('button', { name: /上一步|下一步|暂停|继续|播放/ })).toHaveCount(0);
  await expect(page.locator('#featured .technology-strip').getByRole('listitem')).toHaveCount(4);
  await expect(page.locator('#featured')).not.toContainText('WebGPU');
});

test('missing GPU keeps the local fallback and demonstration independent', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'gpu', { value: undefined }));
  const failures = [];
  page.on('requestfailed', (request) => failures.push(request.url()));
  await page.goto('./?demo=legacy');
  await progress(page, 0.2);
  await expect(page.locator('.interference-art')).toHaveAttribute('data-renderer', 'fallback');
  await expect(page.locator('.quartz-poster-main')).toBeVisible();
  await progress(page, 1);
  await expect(page.getByText('3 项示例检查通过')).toBeVisible();
  expect(failures).toEqual([]);
});

test('story scheduling stops at rest, while hidden, and offscreen without stacking after recovery', async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.__storyProbe = { requests: 0, hidden: false };
    const request = window.requestAnimationFrame;
    window.requestAnimationFrame = (fn) =>
      request.call(window, (time) => {
        window.__storyProbe.requests++;
        fn(time);
      });
    Object.defineProperty(document, 'hidden', { get: () => window.__storyProbe.hidden });
  });
  await page.goto('./?demo=legacy');
  await progress(page, 0.65);
  await page.waitForTimeout(150);
  const read = () => page.evaluate(() => window.__storyProbe.requests);
  const idle = await read();
  await page.waitForTimeout(250);
  expect(await read()).toBe(idle);
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => {
      window.__storyProbe.hidden = true;
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(100);
    const before = await read();
    await page.evaluate(() => {
      window.dispatchEvent(new Event('scroll'));
      window.dispatchEvent(new Event('resize'));
    });
    await page.waitForTimeout(100);
    expect(await read()).toBe(before);
    await page.evaluate(() => {
      window.__storyProbe.hidden = false;
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(100);
  }
  const recovered = await read();
  await page.evaluate(() => {
    for (let i = 0; i < 20; i++) window.dispatchEvent(new Event('scroll'));
  });
  await page.waitForTimeout(100);
  expect((await read()) - recovered).toBe(1);
  await page.locator('#featured').scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  const end = await read();
  await page.waitForTimeout(200);
  expect(await read()).toBe(end);
});

for (const viewport of [
  { width: 1024, height: 720 },
  { width: 1280, height: 800 },
  { width: 1920, height: 1080 },
]) {
  test(`brand colors and left demonstration / right artwork at ${viewport.width}x${viewport.height}`, async ({
    page,
  }, info) => {
    await page.setViewportSize(viewport);
    await page.goto('./?demo=legacy');
    for (const language of ['zh', 'en']) {
      if (language === 'en') await page.getByRole('button', { name: '切换为英文' }).click();
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      const trigger = page.getByRole('button', {
        name: language === 'zh' ? '下载' : 'Download',
        exact: true,
      });
      const box = await trigger.boundingBox();
      expect(box.height).toBe(44);
      expect(box.y + box.height).toBeLessThan(viewport.height);
      const languageBox = await page.locator('.language-button').boundingBox();
      expect(languageBox.y).toBe(24);
      expect(languageBox.x + languageBox.width).toBe(viewport.width - 32);
      await expect(page.locator('#showcase')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
      await expect(page.locator('#featured')).toHaveCSS('background-color', 'rgb(29, 29, 31)');
      for (const value of [0.3, 0.62, 1]) {
        await progress(page, value);
        const demo = await page.locator('.workspace-demo').boundingBox();
        const art = await page.locator('.interference-art').boundingBox();
        expect(demo.x + demo.width).toBeLessThan(viewport.width * 0.74);
        // The enlarged forms intentionally overlap behind the unchanged left demo.
        expect(art.width).toBeGreaterThan(viewport.width * 0.8);
        expect(art.x + art.width).toBeCloseTo(viewport.width, 0);
        expect(demo.y).toBeGreaterThanOrEqual(0);
        expect(demo.y + demo.height).toBeLessThanOrEqual(viewport.height);
        const overflows = await page.locator('.workspace-demo').evaluate((root) =>
          [...root.querySelectorAll('p,pre,code,.demo-activity,.check-record')]
            .filter((n) => !n.closest('[hidden]'))
            .filter((n) => n.scrollWidth > n.clientWidth + 2)
            .map((n) => n.textContent),
        );
        expect(overflows).toEqual([]);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      if (info.project.name === 'root')
        await page.screenshot({
          path: `${process.env.SITE_EVIDENCE_DIR || 'test-results/screenshots'}/${language}-demo-${viewport.width}x${viewport.height}.png`,
        });
      await page.locator('#featured').scrollIntoViewIfNeeded();
      await expect(page.locator('#featured .technology-strip').getByRole('listitem')).toHaveCount(
        4,
      );
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await trigger.click();
      const dialog = await page.getByRole('dialog').boundingBox();
      expect(dialog.y).toBeGreaterThanOrEqual(0);
      expect(dialog.y + dialog.height).toBeLessThanOrEqual(viewport.height);
      await page.keyboard.press('Escape');
    }
  });
}

test('selected complete chapter survives reduced-motion and short-window recovery', async ({
  page,
}) => {
  await page.goto('./?demo=legacy');
  await progress(page, 0.35);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const review = page.getByRole('link', { name: /检查与交付/ });
  await review.click();
  await expect(page.getByText('3 项示例检查通过')).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(page.locator('.workspace-demo')).toHaveAttribute('data-chapter', '2');
  await expect(page.getByText('3 项示例检查通过')).toBeVisible();
  await expect(review).toBeFocused();
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.getByRole('link', { name: /代码与协作/ }).click();
  await expect(page.locator('.workspace-demo')).toHaveAttribute('data-chapter', '1');
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.locator('.workspace-demo')).toHaveAttribute('data-chapter', '1');
  await expect(page.getByText('已交接 · 变更与检查要求')).toBeVisible();
});

test('restoring motion offscreen does not jump past the introduction on later entry', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./?demo=legacy');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => scrollTo({ top: 450, behavior: 'instant' }));
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => scrollY)).toBe(450);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('link', { name: /检查与交付/ }).click();
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => scrollTo({ top: 450, behavior: 'instant' }));
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => scrollY)).toBe(450);
});

test('the static fan is a loaded transparent render and the example survives an image failure', async ({
  page,
}) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'gpu', { value: undefined }));
  await page.goto('./?demo=legacy');
  await progress(page, 0.8);
  expect(
    await page.locator('.story-stage').evaluate((n) => getComputedStyle(n, '::before').content),
  ).toBe('none');
  await expect(page.locator('.story-ink')).toHaveCSS('mix-blend-mode', 'difference');
  const image = page.locator('.quartz-poster-main');
  expect(
    await page.locator('.quartz-journey img').evaluateAll((nodes) => nodes.map((n) => n.className)),
  ).toEqual(['quartz-poster-accent', 'quartz-poster-main']);
  await expect.poll(() => image.evaluate((node) => node.naturalWidth)).toBe(1600);
  const coverage = await image.evaluate((node) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 200;
    const context = canvas.getContext('2d');
    context.drawImage(node, 0, 0, 200, 200);
    const pixels = context.getImageData(0, 0, 200, 200).data;
    let clear = 0,
      solid = 0;
    for (let i = 3; i < pixels.length; i += 4) {
      if (pixels[i] === 0) clear++;
      if (pixels[i] === 255) solid++;
    }
    return { clear, solid };
  });
  expect(coverage.clear).toBeGreaterThan(10000);
  expect(coverage.solid).toBeGreaterThan(1000);
  await page.route('**/quartz-fan-static.png', (route) => route.abort());
  await page.reload();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('link', { name: /检查与交付/ }).click();
  await expect(page.getByText('3 项示例检查通过')).toBeVisible();
  await expect(page.getByRole('link', { name: /代码与协作/ })).toBeVisible();
});

test('technology foundations show local brand assets and pause while reading or inactive', async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.__foundationHidden = false;
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => window.__foundationHidden,
    });
  });
  await page.goto('./?demo=legacy');
  const section = page.locator('#featured');
  const strip = section.getByRole('region', { name: '技术基础' });
  await section.scrollIntoViewIfNeeded();
  await expect(section).not.toContainText('WebGPU');
  await expect(strip.getByRole('listitem')).toHaveCount(4);
  for (const name of ['Rust', 'React', 'TypeScript', 'Vite']) {
    const item = strip.getByRole('listitem').filter({ hasText: name });
    await expect(item).toBeVisible();
    await expect
      .poll(() => item.locator('img').evaluate((image) => image.complete && image.naturalWidth > 0))
      .toBe(true);
  }
  const references = section.getByRole('list', { name: '开源参考' });
  await expect(references.getByRole('link')).toHaveCount(5);
  expect(
    await references
      .getByRole('link')
      .evaluateAll((links) => links.map((link) => link.querySelector('strong').textContent)),
  ).toEqual(['clap', 'execd', 'libkrun', 'OpenHands', 'smolvm']);
  await expect(section.getByRole('heading', { level: 2 })).not.toContainText(/[。.]/);
  for (const [name, url] of [
    ['clap', 'https://github.com/clap-rs/clap'],
    ['OpenHands', 'https://github.com/OpenHands/software-agent-sdk'],
    ['execd', 'https://github.com/opensandbox-group/OpenSandbox/tree/main/components/execd'],
    ['smolvm', 'https://github.com/smol-machines/smolvm'],
    ['libkrun', 'https://github.com/containers/libkrun'],
  ]) {
    await expect(references.getByRole('link', { name, exact: false })).toHaveAttribute('href', url);
  }
  await expect(references.locator('img')).toHaveCount(3);
  for (const name of ['smolvm', 'OpenHands']) {
    await expect(
      references.getByRole('link', { name: new RegExp(name) }).locator('img'),
    ).toHaveCount(0);
  }
  for (const image of await references.locator('img').all()) {
    await expect
      .poll(() => image.evaluate((node) => node.complete && node.naturalWidth > 0))
      .toBe(true);
  }
  const track = strip.locator('.technology-track');
  await expect(strip).toHaveAttribute('data-motion', 'running');
  const first = await track.evaluate((node) => getComputedStyle(node).transform);
  await page.waitForTimeout(180);
  expect(await track.evaluate((node) => getComputedStyle(node).transform)).not.toBe(first);
  await strip.hover();
  await expect(strip).toHaveAttribute('data-motion', 'paused');
  const paused = await track.evaluate((node) => getComputedStyle(node).transform);
  await page.waitForTimeout(180);
  expect(await track.evaluate((node) => getComputedStyle(node).transform)).toBe(paused);
  await strip.focus();
  await page.mouse.move(0, 0);
  await expect(strip).toHaveAttribute('data-motion', 'paused');
  await strip.evaluate((node) => node.blur());
  await expect(strip).toHaveAttribute('data-motion', 'running');
  await page.evaluate(() => {
    window.__foundationHidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(strip).toHaveAttribute('data-motion', 'paused');
  await page.evaluate(() => {
    window.__foundationHidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(strip).toHaveAttribute('data-motion', 'running');
  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await expect(strip).toHaveAttribute('data-motion', 'paused');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await section.scrollIntoViewIfNeeded();
  await expect(strip).toHaveAttribute('data-motion', 'static');
  await expect(track).toHaveCSS('animation-name', 'none');
  await expect(section.locator('[data-copy]')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('the completed sculpture leaves with the second chapter before the dark chapter', async ({
  page,
}) => {
  await page.goto('./?demo=legacy');
  await progress(page, 1);
  await expect(page.locator('#featured')).toHaveCSS('z-index', 'auto');
  await expect(page.locator('#featured > .principles-heading')).toHaveCSS('z-index', '2');
  await expect(page.locator('#featured > .technology-strip')).toHaveCSS('z-index', '2');
  await page.evaluate(() => {
    const r = document.querySelector('#featured').getBoundingClientRect();
    scrollTo({ top: scrollY + r.top - innerHeight * 0.7, behavior: 'instant' });
  });
  await page.waitForTimeout(100);
  const box = await page.locator('.quartz-journey').boundingBox();
  const edge = await page.locator('#featured').evaluate((n) => n.getBoundingClientRect().top);
  expect(box.y + box.height).toBeLessThanOrEqual(edge + 1);
});

test('inverse narrative stays aligned, reverses weight and preserves the original keyboard links', async ({
  page,
}) => {
  await page.goto('./?demo=legacy');
  await progress(page, 0.1);
  const ink = page.locator('.story-ink');
  await expect(ink).toHaveAttribute('aria-hidden', 'true');
  await expect(ink).toHaveCSS('mix-blend-mode', 'difference');
  await expect(ink).toHaveCSS('pointer-events', 'none');
  const weight = () => ink.evaluate((n) => n.style.getPropertyValue('--ink-weight'));
  const first = await weight();
  const original = await page.locator('.story-caption').boundingBox();
  const copy = await page.locator('.story-ink-caption').boundingBox();
  expect(Math.abs(original.x - copy.x)).toBeLessThan(1);
  expect(Math.abs(original.y - copy.y)).toBeLessThan(1);
  expect(Math.abs(original.width - copy.width)).toBeLessThan(1);
  expect(await ink.locator('[id]').count()).toBe(0);
  expect(await ink.locator('a').evaluateAll((nodes) => nodes.every((n) => n.tabIndex === -1))).toBe(
    true,
  );
  await progress(page, 0.8);
  expect(Number(await weight())).toBeGreaterThan(Number(first));
  await progress(page, 0.1);
  expect(await weight()).toBe(first);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const link = page.getByRole('link', { name: /检查与交付/ });
  await link.focus();
  await expect(link).toHaveCSS('box-shadow', 'rgb(255, 255, 255) 0px 0px 0px 4px');
  await page.keyboard.press('Enter');
  await expect(page.getByText('3 项示例检查通过')).toBeVisible();
  expect(await weight()).toBe('700');
});

test('pinned narrative keeps glyph and chapter positions while emphasis changes', async ({
  page,
}) => {
  await page.goto('./?demo=storyboard');
  await page.locator('.language-button').click();
  await progress(page, 0.68);
  const snapshot = () =>
    page.locator('.story-ink').evaluate((ink) => {
      const heading = ink.querySelector('h3');
      const range = document.createRange();
      range.selectNodeContents(heading);
      return {
        glyphWidth: range.getBoundingClientRect().width,
        paragraphY: ink.querySelector('p').getBoundingClientRect().y,
        links: [...ink.querySelectorAll('a')].map((a) => a.getBoundingClientRect().x),
        position: getComputedStyle(ink).position,
      };
    });
  const first = await snapshot();
  await progress(page, 0.95);
  const last = await snapshot();
  expect(Math.abs(last.glyphWidth - first.glyphWidth)).toBeLessThan(0.1);
  expect(Math.abs(last.paragraphY - first.paragraphY)).toBeLessThan(0.1);
  for (let i = 0; i < first.links.length; i++)
    expect(Math.abs(last.links[i] - first.links[i])).toBeLessThan(0.1);
  expect(last.position).toBe('fixed');
  await expect(page.locator('.story-ink')).toHaveCSS('mix-blend-mode', 'difference');
});
