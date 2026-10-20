import { quartzShader, quartzEdgeShader } from './quartzShader';

function createSurfaceMesh() {
  const columns = 96,
    rows = 40;
  const vertices = [],
    indices = [];
  function quad(corners, center, reverse = false) {
    const start = vertices.length / 4;
    for (const [u, v, layer] of corners) vertices.push(u, v, layer, center);
    const order = reverse ? [0, 1, 2, 1, 3, 2] : [0, 2, 1, 1, 2, 3];
    for (const offset of order) indices.push(start + offset);
  }
  // Keep both sides and the perimeter closed while hinge parameters change.
  function shell(left, right, subdivisions, radialSteps) {
    for (let row = 0; row < radialSteps; row++) {
      const v = row / radialSteps,
        nextV = (row + 1) / radialSteps;
      for (let column = 0; column < subdivisions; column++) {
        const u = left + ((right - left) * column) / subdivisions;
        const nextU = left + ((right - left) * (column + 1)) / subdivisions;
        for (const layer of [1, -1])
          quad(
            [
              [u, v, layer],
              [nextU, v, layer],
              [u, nextV, layer],
              [nextU, nextV, layer],
            ],
            (u + nextU) / 2,
            layer < 0,
          );
      }
    }
    function edge(a, b) {
      quad(
        [
          [a[0], a[1], 1],
          [b[0], b[1], 1],
          [a[0], a[1], -1],
          [b[0], b[1], -1],
        ],
        -1,
      );
    }
    for (let column = 0; column < subdivisions; column++) {
      const u = left + ((right - left) * column) / subdivisions,
        nextU = left + ((right - left) * (column + 1)) / subdivisions;
      edge([nextU, 0], [u, 0]);
      edge([u, 1], [nextU, 1]);
    }
    for (let row = 0; row < radialSteps; row++) {
      edge([left, row / radialSteps], [left, (row + 1) / radialSteps]);
      edge([right, (row + 1) / radialSteps], [right, row / radialSteps]);
    }
  }
  shell(0, 1, columns, rows);

  return { vertices: new Float32Array(vertices), indices: new Uint16Array(indices) };
}

/** Owns mesh, attachments and late async results. Callers own scheduling and must dispose. */
export function createQuartzScene(canvas, onState) {
  let disposed = false,
    initializing = false,
    failed = false,
    generation = 0,
    rebuilds = 0,
    announcedReady = false;
  let resource = null,
    latest = { progress: 0 },
    width = 1,
    height = 1;
  let cssWidth = 1,
    cssHeight = 1,
    pixelRatio = 1,
    lastBudget = 1600000;
  const values = new Float32Array(12);
  function applySize() {
    const budget = latest.detail > 0 ? 800000 : 1600000;
    const ratio = Math.min(
      1.5,
      Math.max(1, pixelRatio),
      Math.sqrt(budget / Math.max(1, cssWidth * cssHeight)),
    );
    width = Math.max(1, Math.floor(cssWidth * ratio));
    height = Math.max(1, Math.floor(cssHeight * ratio));
    lastBudget = budget;
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
  }
  function releaseTargets(owner) {
    for (const texture of Object.values(owner.targets)) texture.destroy();
    owner.targets = {};
  }
  function release() {
    if (!resource) return;
    const current = resource;
    resource = null;
    releaseTargets(current);
    for (const buffer of current.buffers) buffer.destroy();
    current.device.removeEventListener('uncapturederror', current.onError);
    current.device.destroy();
    current.context.unconfigure();
  }
  function fallback() {
    release();
    failed = true;
    if (!disposed) onState('fallback');
  }
  function resizeTargets(owner) {
    const exitAspect = latest.viewportAspect || cssWidth / cssHeight;
    const exitHeight = Math.max(1, Math.floor(Math.sqrt(lastBudget / exitAspect)));
    const exitWidth = Math.max(1, Math.floor(exitHeight * exitAspect));
    if (
      owner.width === width &&
      owner.height === height &&
      owner.exitWidth === exitWidth &&
      owner.exitHeight === exitHeight &&
      owner.targets.exitDepth
    )
      return;
    releaseTargets(owner);
    const attachments = [
      { name: 'multisampleColor', format: owner.format, sampleCount: 4 },
      { name: 'multisampleDepth', format: 'depth24plus', sampleCount: 4 },
      { name: 'resolvedColor', format: owner.format, sampleCount: 1, sampled: true },
      { name: 'exitSurface', format: 'rgba16float', sampleCount: 1, sampled: true },
      { name: 'exitDepth', format: 'depth24plus', sampleCount: 1 },
    ];
    for (const { name, format, sampleCount, sampled } of attachments)
      owner.targets[name] = owner.device.createTexture({
        // Refraction needs the full back surface even when the visible color is cropped.
        size: name.startsWith('exit') ? [exitWidth, exitHeight] : [width, height],
        format,
        sampleCount,
        usage:
          window.GPUTextureUsage.RENDER_ATTACHMENT |
          (sampled ? window.GPUTextureUsage.TEXTURE_BINDING : 0),
      });
    owner.group = owner.device.createBindGroup({
      layout: owner.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: owner.uniform } },
        { binding: 1, resource: owner.targets.exitSurface.createView() },
      ],
    });
    owner.edgeGroup = owner.device.createBindGroup({
      layout: owner.edgePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: owner.targets.resolvedColor.createView() },
        { binding: 1, resource: owner.edgeSampler },
      ],
    });
    owner.width = width;
    owner.height = height;
    owner.exitWidth = exitWidth;
    owner.exitHeight = exitHeight;
  }
  function draw() {
    if (disposed || !resource || latest.active === false) return;
    const {
      device,
      context,
      pipeline,
      exitPipeline,
      exitGroup,
      uniform,
      vertices,
      indices,
      indexCount,
    } = resource;
    try {
      resizeTargets(resource);
      values.set([
        width,
        height,
        latest.progress || 0,
        latest.aspect || cssWidth / cssHeight,
        latest.viewportAspect || cssWidth / cssHeight,
        latest.accentY ?? 2,
        latest.accentProgress || 0,
        0,
        latest.cropY || 0,
        latest.cropHeight ?? 1,
        resource.exitWidth,
        resource.exitHeight,
      ]);
      device.queue.writeBuffer(uniform, 0, values);
      const encoder = device.createCommandEncoder();
      const exitPass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: resource.targets.exitSurface.createView(),
            clearValue: [0, 0, 0, 0],
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
        depthStencilAttachment: {
          view: resource.targets.exitDepth.createView(),
          depthClearValue: 1,
          depthLoadOp: 'clear',
          depthStoreOp: 'discard',
        },
      });
      exitPass.setPipeline(exitPipeline);
      exitPass.setBindGroup(0, exitGroup);
      exitPass.setVertexBuffer(0, vertices);
      exitPass.setIndexBuffer(indices, 'uint16');
      exitPass.drawIndexed(indexCount, 2);
      exitPass.end();
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: resource.targets.multisampleColor.createView(),
            resolveTarget: resource.targets.resolvedColor.createView(),
            clearValue: [0, 0, 0, 0],
            loadOp: 'clear',
            storeOp: 'discard',
          },
        ],
        depthStencilAttachment: {
          view: resource.targets.multisampleDepth.createView(),
          depthClearValue: 1,
          depthLoadOp: 'clear',
          depthStoreOp: 'discard',
        },
      });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, resource.group);
      pass.setVertexBuffer(0, vertices);
      pass.setIndexBuffer(indices, 'uint16');
      pass.drawIndexed(indexCount, 2);
      pass.end();
      const edgePass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: context.getCurrentTexture().createView(),
            clearValue: [0, 0, 0, 0],
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
      });
      edgePass.setPipeline(resource.edgePipeline);
      edgePass.setBindGroup(0, resource.edgeGroup);
      edgePass.draw(3);
      edgePass.end();
      device.queue.submit([encoder.finish()]);
      if (!announcedReady) {
        announcedReady = true;
        onState('ready');
      }
    } catch {
      fallback();
    }
  }
  async function initialize() {
    initializing = true;
    const attempt = ++generation;
    let device, context;
    const stale = () => disposed || attempt !== generation;
    try {
      if (!window.isSecureContext || !navigator.gpu) throw new Error('WebGPU unavailable');
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'low-power' });
      if (stale()) return;
      if (!adapter) throw new Error('No adapter');
      device = await adapter.requestDevice();
      if (stale()) {
        device.destroy();
        return;
      }
      context = canvas.getContext('webgpu');
      if (!context) throw new Error('No WebGPU context');
      const format = navigator.gpu.getPreferredCanvasFormat();
      const module = device.createShaderModule({ code: quartzShader });
      const edgeModule = device.createShaderModule({ code: quartzEdgeShader });
      const vertex = {
        module,
        entryPoint: 'vertex',
        buffers: [
          {
            arrayStride: 16,
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x2' },
              { shaderLocation: 1, offset: 8, format: 'float32' },
              { shaderLocation: 2, offset: 12, format: 'float32' },
            ],
          },
        ],
      };
      const depthStencil = { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' };
      const [pipeline, exitPipeline, edgePipeline] = await Promise.all([
        device.createRenderPipelineAsync({
          layout: 'auto',
          vertex,
          fragment: { module, entryPoint: 'fragment', targets: [{ format }] },
          // Fan UVs run clockwise around the pivot.
          primitive: { topology: 'triangle-list', frontFace: 'cw', cullMode: 'none' },
          depthStencil,
          multisample: { count: 4 },
        }),
        device.createRenderPipelineAsync({
          layout: 'auto',
          vertex: { ...vertex, entryPoint: 'exitVertex' },
          fragment: { module, entryPoint: 'exitFragment', targets: [{ format: 'rgba16float' }] },
          primitive: { topology: 'triangle-list', frontFace: 'cw', cullMode: 'front' },
          depthStencil,
        }),
        device.createRenderPipelineAsync({
          layout: 'auto',
          vertex: { module: edgeModule, entryPoint: 'edgeVertex' },
          fragment: { module: edgeModule, entryPoint: 'edgeFragment', targets: [{ format }] },
          primitive: { topology: 'triangle-list' },
        }),
      ]);
      if (stale()) {
        device.destroy();
        return;
      }
      resource = {
        device,
        context,
        pipeline,
        exitPipeline,
        edgePipeline,
        format,
        buffers: [],
        targets: {},
      };
      resource.onError = () => {
        if (!stale() && resource?.device === device) fallback();
      };
      device.addEventListener('uncapturederror', resource.onError);
      function allocate(data, usage) {
        const buffer = device.createBuffer({
          size: data.byteLength,
          usage: usage | window.GPUBufferUsage.COPY_DST,
        });
        resource.buffers.push(buffer);
        device.queue.writeBuffer(buffer, 0, data);
        return buffer;
      }
      const mesh = createSurfaceMesh();
      resource.vertices = allocate(mesh.vertices, window.GPUBufferUsage.VERTEX);
      resource.indices = allocate(mesh.indices, window.GPUBufferUsage.INDEX);
      resource.indexCount = mesh.indices.length;
      resource.uniform = allocate(values, window.GPUBufferUsage.UNIFORM);
      resource.exitGroup = device.createBindGroup({
        layout: exitPipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: resource.uniform } }],
      });
      resource.edgeSampler = device.createSampler({
        minFilter: 'linear',
        magFilter: 'linear',
        addressModeU: 'clamp-to-edge',
        addressModeV: 'clamp-to-edge',
      });
      context.configure({ device, format, alphaMode: 'premultiplied' });
      device.lost.then(() => {
        if (stale() || resource?.device !== device) return;
        release();
        announcedReady = false;
        onState('static');
        if (rebuilds++ === 0) {
          if (latest.active !== false) initialize();
        } else fallback();
      });
      draw();
    } catch {
      if (resource?.device === device) release();
      else {
        device?.destroy();
      }
      if (!stale()) fallback();
    } finally {
      if (attempt === generation) initializing = false;
    }
  }
  return {
    render(frame) {
      if (disposed) return;
      latest = frame;
      if (lastBudget !== (frame.detail > 0 ? 800000 : 1600000)) applySize();
      if (disposed || failed || frame.active === false) return;
      if (resource) draw();
      else if (!initializing) initialize();
    },
    resize(nextWidth, nextHeight, ratio = 1) {
      if (cssWidth === nextWidth && cssHeight === nextHeight && pixelRatio === ratio) return;
      cssWidth = Math.max(1, nextWidth);
      cssHeight = Math.max(1, nextHeight);
      pixelRatio = ratio;
      applySize();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      generation++;
      release();
    },
  };
}
