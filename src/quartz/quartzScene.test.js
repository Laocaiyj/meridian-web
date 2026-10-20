import { createQuartzScene } from './quartzScene';

const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
let canvas, context, devices, onState, gpu;
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
};
function device() {
  const lost = deferred();
  const value = {
    lost: lost.promise,
    lose: lost.resolve,
    destroy: jest.fn(),
    buffers: [],
    textures: [],
    listeners: new Map(),
    addEventListener: jest.fn((type, fn) => value.listeners.set(type, fn)),
    removeEventListener: jest.fn((type) => value.listeners.delete(type)),
    createBuffer: jest.fn((descriptor) => {
      const resource = { descriptor, destroy: jest.fn() };
      value.buffers.push(resource);
      return resource;
    }),
    createTexture: jest.fn((descriptor) => {
      const resource = { descriptor, destroy: jest.fn(), createView: () => ({}) };
      value.textures.push(resource);
      return resource;
    }),
    createShaderModule: jest.fn(() => ({})),
    createSampler: jest.fn(() => ({})),
    draw: jest.fn(),
    createRenderPipelineAsync: jest.fn(async () => ({ getBindGroupLayout: () => ({}) })),
    createBindGroup: jest.fn(() => ({})),
    drawIndexed: jest.fn(),
    createCommandEncoder: jest.fn(() => ({
      beginRenderPass: jest.fn(() => ({
        setPipeline() {},
        setBindGroup() {},
        setVertexBuffer() {},
        setIndexBuffer() {},
        draw: value.draw,
        drawIndexed: value.drawIndexed,
        end() {},
      })),
      finish: () => ({}),
    })),
    queue: { writeBuffer: jest.fn(), submit: jest.fn() },
  };
  devices.push(value);
  return value;
}
beforeEach(() => {
  devices = [];
  onState = jest.fn();
  context = {
    configure: jest.fn(),
    unconfigure: jest.fn(),
    getCurrentTexture: () => ({ createView: () => ({}) }),
  };
  canvas = { width: 1, height: 1, getContext: () => context };
  gpu = {
    getPreferredCanvasFormat: () => 'bgra8unorm',
    requestAdapter: jest.fn(async () => ({ requestDevice: async () => device() })),
  };
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
  Object.defineProperty(navigator, 'gpu', { configurable: true, value: gpu });
  global.GPUBufferUsage = { UNIFORM: 64, COPY_DST: 8, VERTEX: 32, INDEX: 16 };
  global.GPUTextureUsage = { RENDER_ATTACHMENT: 16, TEXTURE_BINDING: 4 };
});

test.each(['missing', 'adapter', 'initialization'])(
  '%s keeps a usable static fallback',
  async (reason) => {
    if (reason === 'missing') Object.defineProperty(navigator, 'gpu', { value: undefined });
    if (reason === 'adapter') gpu.requestAdapter.mockResolvedValue(null);
    if (reason === 'initialization') gpu.requestAdapter.mockRejectedValue(new Error('Unavailable'));
    const scene = createQuartzScene(canvas, onState);
    scene.render({ progress: 0.4 });
    await flush();
    expect(onState).toHaveBeenLastCalledWith('fallback');
    scene.dispose();
  },
);

test('drawing is demand-driven and resize respects the pixel budget', async () => {
  const scene = createQuartzScene(canvas, onState);
  scene.resize(3840, 2160, 3);
  scene.render({ progress: 0.2 });
  await flush();
  expect(canvas.width * canvas.height).toBeLessThanOrEqual(1600000);
  expect(onState).toHaveBeenLastCalledWith('ready');
  const draws = devices[0].queue.submit.mock.calls.length;
  await flush();
  expect(devices[0].queue.submit).toHaveBeenCalledTimes(draws);
  scene.render({ progress: 0.8 });
  expect(devices[0].queue.submit).toHaveBeenCalledTimes(draws + 1);
  scene.dispose();
  expect(devices[0].destroy).toHaveBeenCalledTimes(1);
  expect(context.unconfigure).toHaveBeenCalled();
});

test('device loss rebuilds once, then falls back and releases each device', async () => {
  const scene = createQuartzScene(canvas, onState);
  scene.render({ progress: 0.4 });
  await flush();
  devices[0].lose({ reason: 'unknown' });
  await flush();
  expect(devices).toHaveLength(2);
  devices[1].lose({ reason: 'unknown' });
  await flush();
  expect(onState).toHaveBeenLastCalledWith('fallback');
  expect(gpu.requestAdapter).toHaveBeenCalledTimes(2);
  scene.dispose();
  expect(devices.every((value) => value.destroy.mock.calls.length === 1)).toBe(true);
});

test('a device arriving after unmount is destroyed without callbacks or drawing', async () => {
  const pending = deferred();
  gpu.requestAdapter.mockResolvedValue({ requestDevice: () => pending.promise });
  const scene = createQuartzScene(canvas, onState);
  scene.render({ progress: 0.4 });
  await flush();
  scene.dispose();
  const late = device();
  pending.resolve(late);
  await flush();
  expect(late.destroy).toHaveBeenCalledTimes(1);
  expect(late.queue.submit).not.toHaveBeenCalled();
  expect(onState).not.toHaveBeenCalled();
});

test.each(['insecure', 'device', 'pipeline'])(
  '%s initialization releases resources and falls back',
  async (reason) => {
    if (reason === 'insecure') Object.defineProperty(window, 'isSecureContext', { value: false });
    if (reason === 'device')
      gpu.requestAdapter.mockResolvedValue({
        requestDevice: async () => {
          throw new Error('Denied');
        },
      });
    if (reason === 'pipeline') {
      const value = device();
      value.createRenderPipelineAsync.mockRejectedValue(new Error('Invalid shader'));
      gpu.requestAdapter.mockResolvedValue({ requestDevice: async () => value });
    }
    const scene = createQuartzScene(canvas, onState);
    scene.render({ progress: 0.2 });
    await flush();
    expect(onState).toHaveBeenLastCalledWith('fallback');
    scene.dispose();
    expect(devices.every((value) => value.destroy.mock.calls.length === 1)).toBe(true);
  },
);

test('initialization finishing in the background does not submit, and repeated owners clean up', async () => {
  const pending = deferred();
  const first = device();
  first.createRenderPipelineAsync.mockReturnValue(pending.promise);
  gpu.requestAdapter.mockResolvedValue({ requestDevice: async () => first });
  const scene = createQuartzScene(canvas, onState);
  scene.render({ progress: 0.4 });
  await flush();
  scene.render({ progress: 0.4, active: false });
  pending.resolve({ getBindGroupLayout: () => ({}) });
  await flush();
  expect(first.queue.submit).not.toHaveBeenCalled();
  expect(onState).not.toHaveBeenCalledWith('ready');
  scene.render({ progress: 0.4, active: true });
  expect(onState).toHaveBeenLastCalledWith('ready');
  scene.dispose();
  gpu.requestAdapter.mockResolvedValue({ requestDevice: async () => device() });
  for (let i = 0; i < 3; i++) {
    const next = createQuartzScene(canvas, onState);
    next.render({ progress: 0.5 });
    await flush();
    next.dispose();
  }
  expect(devices.every((value) => value.destroy.mock.calls.length === 1)).toBe(true);
});

test('surface resources are reused at rest, rebuilt on resize, and all released on disposal', async () => {
  const scene = createQuartzScene(canvas, onState);
  scene.resize(640, 600, 2);
  scene.render({ progress: 0.1 });
  await flush();
  const owner = devices[0];
  expect(owner.buffers.filter((b) => b.descriptor.usage & GPUBufferUsage.VERTEX)).toHaveLength(1);
  expect(owner.buffers.filter((b) => b.descriptor.usage & GPUBufferUsage.INDEX)).toHaveLength(1);
  expect(owner.textures).toHaveLength(5);
  expect(owner.textures.filter((t) => t.descriptor.sampleCount === 4)).toHaveLength(2);
  expect(owner.textures.some((t) => t.descriptor.format === 'rgba16float')).toBe(true);
  expect(owner.textures.some((t) => t.descriptor.format === 'depth24plus')).toBe(true);
  scene.render({ progress: 0.6 });
  scene.resize(640, 600, 2);
  scene.render({ progress: 0.7 });
  expect(owner.buffers).toHaveLength(3);
  expect(owner.textures).toHaveLength(5);
  const first = [...owner.textures];
  scene.resize(900, 700, 1);
  scene.render({ progress: 0.9, active: false });
  expect(owner.textures).toHaveLength(5);
  scene.render({ progress: 0.9 });
  expect(first.every((t) => t.destroy.mock.calls.length === 1)).toBe(true);
  expect(owner.textures).toHaveLength(10);
  scene.dispose();
  scene.dispose();
  expect(owner.buffers.every((b) => b.destroy.mock.calls.length === 1)).toBe(true);
  expect(owner.textures.every((t) => t.destroy.mock.calls.length === 1)).toBe(true);
});

test('a partially allocated multisample target falls back without leaking its first texture', async () => {
  const owner = device();
  const allocate = owner.createTexture.getMockImplementation();
  owner.createTexture.mockImplementationOnce(allocate).mockImplementationOnce(() => {
    throw new Error('Depth allocation failed');
  });
  gpu.requestAdapter.mockResolvedValue({ requestDevice: async () => owner });
  const scene = createQuartzScene(canvas, onState);
  scene.resize(640, 600, 1);
  scene.render({ progress: 0.5 });
  await flush();
  expect(onState).toHaveBeenLastCalledWith('fallback');
  expect(owner.textures).toHaveLength(1);
  expect(owner.textures[0].destroy).toHaveBeenCalledTimes(1);
  expect(owner.buffers.every((b) => b.destroy.mock.calls.length === 1)).toBe(true);
  scene.dispose();
  expect(owner.destroy).toHaveBeenCalledTimes(1);
});

test('asynchronous GPU validation failure releases the scene and leaves its static fallback', async () => {
  const scene = createQuartzScene(canvas, onState);
  scene.resize(600, 600, 1);
  scene.render({ progress: 0.5 });
  await flush();
  const owner = devices[0];
  expect(owner.listeners.has('uncapturederror')).toBe(true);
  owner.listeners.get('uncapturederror')({ error: new Error('GPU validation') });
  expect(onState).toHaveBeenLastCalledWith('fallback');
  const submissions = owner.queue.submit.mock.calls.length;
  scene.render({ progress: 0.7 });
  expect(owner.queue.submit).toHaveBeenCalledTimes(submissions);
  expect(owner.buffers.every((b) => b.destroy.mock.calls.length === 1)).toBe(true);
  expect(owner.textures.every((t) => t.destroy.mock.calls.length === 1)).toBe(true);
  expect(owner.listeners.size).toBe(0);
  scene.dispose();
});

test('a stale pipeline rejection cannot unconfigure the next owner of the same canvas', async () => {
  const pending = deferred();
  const previous = device();
  previous.createRenderPipelineAsync.mockReturnValue(pending.promise);
  gpu.requestAdapter.mockResolvedValueOnce({ requestDevice: async () => previous });
  const old = createQuartzScene(canvas, onState);
  old.render({ progress: 0.3 });
  await flush();
  old.dispose();
  const current = createQuartzScene(canvas, onState);
  current.render({ progress: 0.5 });
  await flush();
  expect(onState).toHaveBeenLastCalledWith('ready');
  pending.reject(new Error('Late pipeline failure'));
  await flush();
  expect(context.unconfigure).not.toHaveBeenCalled();
  current.render({ progress: 0.7 });
  expect(devices[1].queue.submit).toHaveBeenCalledTimes(2);
  current.dispose();
  expect(context.unconfigure).toHaveBeenCalledTimes(1);
});

test('one continuous scene changes quality tier only at the full-view boundary', async () => {
  const scene = createQuartzScene(canvas, onState);
  scene.resize(1800, 1350, 3);
  scene.render({ progress: 0.03, detail: 1, active: true });
  await flush();
  expect(canvas.width * canvas.height).toBeLessThanOrEqual(800000);
  const owner = devices[0];
  const textures = owner.textures.length;
  for (const detail of [0.9, 0.7, 0.4, 0.1]) scene.render({ progress: 0.1, detail, aspect: 1.2 });
  expect(owner.textures).toHaveLength(textures);
  scene.render({ progress: 0.2, detail: 0, active: true });
  expect(canvas.width * canvas.height).toBeGreaterThan(800000);
  expect(canvas.width * canvas.height).toBeLessThanOrEqual(1600000);
  expect(devices).toHaveLength(1);
  expect(owner.buffers).toHaveLength(3);
  scene.dispose();
});

test('both contrasting sculptures share the same mesh, depth attachments and draw instance batch', async () => {
  const scene = createQuartzScene(canvas, onState);
  scene.resize(1280, 1200);
  scene.render({ progress: 0.5, accentProgress: 0.8, accentY: 0.7, viewportAspect: 1280 / 1200 });
  await flush();
  expect(devices).toHaveLength(1);
  expect(devices[0].buffers).toHaveLength(3);
  expect(devices[0].drawIndexed).toHaveBeenCalledWith(expect.any(Number), 2);
  scene.dispose();
});

// Omitting the edge resolve would leave only the two geometry passes.
test('edge resolve runs after multisampling within the same submission and shares its lifetime', async () => {
  const scene = createQuartzScene(canvas, onState);
  scene.resize(1280, 800, 1.5);
  scene.render({ progress: 0.6 });
  await flush();
  const owner = devices[0];
  expect(onState).toHaveBeenLastCalledWith('ready');
  expect(owner.draw).toHaveBeenCalledWith(3);
  expect(owner.queue.submit).toHaveBeenCalledTimes(1);
  const resolve = owner.textures.filter(
    (t) =>
      t.descriptor.format === 'bgra8unorm' &&
      t.descriptor.sampleCount === 1 &&
      t.descriptor.usage & GPUTextureUsage.TEXTURE_BINDING,
  );
  expect(resolve).toHaveLength(1);
  const allocations = owner.textures.length;
  scene.render({ progress: 0.7 });
  expect(owner.textures).toHaveLength(allocations);
  scene.dispose();
  expect(resolve[0].destroy).toHaveBeenCalledTimes(1);
});

test('viewport cropping retains the full back surface and reuses it across crop movement', async () => {
  const scene = createQuartzScene(canvas, onState);
  scene.resize(1280, 800, 1);
  scene.render({ progress: 0.8, viewportAspect: 0.8, cropY: 0.2, cropHeight: 0.5 });
  await flush();
  const owner = devices[0];
  const back = owner.textures.find((t) => t.descriptor.format === 'rgba16float');
  expect(back.descriptor.size[1]).toBeGreaterThan(back.descriptor.size[0]);
  expect(back.descriptor.size[0] / back.descriptor.size[1]).toBeCloseTo(0.8, 2);
  const allocated = owner.textures.length;
  scene.render({ progress: 0.8, viewportAspect: 0.8, cropY: 0.3, cropHeight: 0.5 });
  expect(owner.textures).toHaveLength(allocated);
  expect(back.destroy).not.toHaveBeenCalled();
  scene.dispose();
  expect(back.destroy).toHaveBeenCalledTimes(1);
});
