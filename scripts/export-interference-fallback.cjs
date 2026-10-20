const { chromium } = require('@playwright/test');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');

async function main() {
  const server = spawn(process.execPath, ['scripts/serve.cjs'], {
    env: { ...process.env, PORT: '4182' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let browser;
  try {
    await new Promise((resolve, reject) => {
      server.stdout.once('data', resolve);
      server.once('error', reject);
      server.once('exit', (code) => reject(new Error(`Export server exited ${code}`)));
    });
    browser = await chromium.launch({ headless: false });
    const page = await browser.newPage({
      viewport: { width: 1600, height: 900 },
      deviceScaleFactor: 1,
    });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.goto('http://127.0.0.1:4182/');
    const sources = {
      scene: fs.readFileSync('src/quartz/quartzScene.js', 'utf8'),
      shader: fs.readFileSync('src/quartz/quartzShader.js', 'utf8'),
    };
    const result = await page.evaluate(async (sources) => {
      // Render the production module in overlapping viewport tiles, not an upscaled screenshot.
      const shaderURL = URL.createObjectURL(
        new Blob([sources.shader], { type: 'text/javascript' }),
      );
      const source = sources.scene.replace("'./quartzShader'", JSON.stringify(shaderURL));
      const sceneURL = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
      const { createQuartzScene } = await import(sceneURL);
      const tile = document.createElement('canvas');
      document.body.appendChild(tile);
      const gpuContext = tile.getContext('webgpu');
      let exportDevice;
      const getContext = tile.getContext.bind(tile);
      tile.getContext = (kind) =>
        kind === 'webgpu'
          ? {
              configure(options) {
                exportDevice = options.device;
                gpuContext.configure(options);
              },
              getCurrentTexture: () => gpuContext.getCurrentTexture(),
              unconfigure: () => gpuContext.unconfigure(),
            }
          : getContext(kind);
      const output = document.createElement('canvas');
      output.width = 1600;
      output.height = 2200;
      const context = output.getContext('2d');
      let ready,
        rejectReady,
        sceneState = 'static',
        exportFailure = null;
      const initialized = new Promise((resolve, reject) => {
        ready = resolve;
        rejectReady = reject;
      });
      const scene = createQuartzScene(tile, (state) => {
        sceneState = state;
        if (state === 'ready') ready();
        else {
          exportFailure = new Error('Native GPU export interrupted: ' + state);
          rejectReady(exportFailure);
        }
      });
      try {
        for (let y = 0; y < output.height; y += 640) {
          const coreHeight = Math.min(640, output.height - y);
          const top = Math.max(0, y - 96),
            bottom = Math.min(output.height, y + coreHeight + 96);
          scene.resize(1600, bottom - top, 1);
          scene.render({
            progress: 1,
            active: true,
            detail: 0,
            aspect: 1600 / 2200,
            viewportAspect: 1600 / 2200,
            accentY: 10,
            accentProgress: 0,
            cropY: top / 2200,
            cropHeight: (bottom - top) / 2200,
          });
          await initialized;
          await exportDevice.queue.onSubmittedWorkDone();
          await new Promise((resolve) => requestAnimationFrame(resolve));
          if (exportFailure || sceneState !== 'ready')
            throw exportFailure || new Error('No ready export frame');
          context.drawImage(tile, 0, y - top, 1600, coreHeight, 0, y, 1600, coreHeight);
        }
        const pixels = context.getImageData(0, 0, 1600, 2200).data;
        let clear = 0,
          opaque = 0,
          warm = 0;
        for (let i = 3; i < pixels.length; i += 4) {
          if (pixels[i] === 0) clear++;
          if (pixels[i] === 255) opaque++;
          if (pixels[i] > 128 && pixels[i - 3] > pixels[i - 1] + 10) warm++;
        }
        return { data: output.toDataURL('image/png'), clear, opaque, warm };
      } finally {
        scene.dispose();
        tile.remove();
        URL.revokeObjectURL(sceneURL);
        URL.revokeObjectURL(shaderURL);
      }
    }, sources);
    assert(result.clear > 900000, 'Export needs transparent negative space');
    assert(result.opaque > 50000, 'Export must contain the actual rendered fan');
    assert.equal(result.warm, 0, 'Only the purple primary may be baked into the shared poster');
    assert.deepEqual(errors, []);
    const destination = path.resolve('public/brand/quartz-fan-static.png');
    const buffer = Buffer.from(result.data.split(',')[1], 'base64');
    fs.writeFileSync(destination, buffer);
    const evidence = path.resolve(process.env.SITE_EVIDENCE_DIR || 'test-results/export');
    fs.mkdirSync(evidence, { recursive: true });
    fs.writeFileSync(
      path.join(evidence, 'static-export.json'),
      JSON.stringify(
        {
          capturedAt: new Date().toISOString(),
          source:
            'Production native WebGPU scene; primary only; four native-resolution overlapping tiles',
          outputSize: [1600, 2200],
          tileCoreHeight: 640,
          tileOverlap: 96,
          clearPixels: result.clear,
          opaquePixels: result.opaque,
          bytes: buffer.length,
          sha256: createHash('sha256').update(buffer).digest('hex'),
          errors,
        },
        null,
        2,
      ) + '\n',
    );
    console.log(`Exported native tiled WebGPU fan: ${destination} (${buffer.length} bytes)`);
  } finally {
    await browser?.close();
    server.kill();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
