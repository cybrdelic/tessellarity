// gpu-debug.ts — plug'n'play WebGPU debugger for pipelines/passes/bindgroups.
// MIT — adapted from user-provided snippet.

export function enableWebGPUDebug(device: GPUDevice) {
  type AnyPass = GPURenderPassEncoder | GPUComputePassEncoder;
  const pipelines = new WeakMap<GPURenderPipeline, any>();
  const bindGroups = new WeakMap<GPUBindGroup, any>();
  const passMeta = new WeakMap<AnyPass, any>();
  const encMeta = new WeakMap<GPUCommandEncoder, { createdAt: string }>();

  function _stack(skip = 2) {
    const s = new Error().stack || "";
    return s.split("\n").slice(skip).join("\n");
  }

  device.onuncapturederror = (ev) => {
    console.group("%c[WebGPU uncaptured error]", "color:#f55;font-weight:bold");
    console.error(ev.error);
    console.groupEnd();
  };

  const _createBindGroup = device.createBindGroup.bind(device);
  device.createBindGroup = (desc: GPUBindGroupDescriptor) => {
    const bg = _createBindGroup(desc);
    bindGroups.set(bg, { label: desc.label, layout: desc.layout, createdAt: _stack(2) });
    return bg;
  };

  async function createRenderPipelineChecked(desc: GPURenderPipelineDescriptor) {
    const vertexModule = desc.vertex.module;
    const fragModule = desc.fragment?.module;
    const [vInfo, fInfo] = await Promise.all([
      vertexModule.getCompilationInfo(),
      fragModule?.getCompilationInfo?.() ?? Promise.resolve(undefined),
    ]);

    function dump(kind: string, info?: GPUCompilationInfo) {
      if (!info) return;
      const errs = info.messages.filter(m => m.type === 'error');
      if (errs.length) {
        console.groupCollapsed(`%c[WGSL ${kind} diagnostics: ${errs.length} error(s)]`, 'color:#e33');
        for (const m of info.messages) {
          const loc = m.lineNum != null ? `:${m.lineNum}:${m.linePos}` : '';
            (console as any)[m.type === 'error' ? 'error' : 'warn'](`${m.type} ${loc} — ${m.message}`);
        }
        console.groupEnd();
      }
    }
    dump('vertex', vInfo);
    dump('fragment', fInfo);

    device.pushErrorScope('validation');
    device.pushErrorScope('internal');
    let pipeline!: GPURenderPipeline;
    try {
      pipeline = await device.createRenderPipelineAsync(desc);
    } catch (e) {
      console.group('%c[createRenderPipelineAsync threw]', 'color:#f33;font-weight:bold');
      console.error(e);
      console.log('Descriptor:', structuredClone(desc));
      console.log('Created at:', _stack(2));
      console.groupEnd();
      throw e;
    } finally {
      const internal = await device.popErrorScope();
      const validation = await device.popErrorScope();
      if (internal || validation) {
        console.group('%c[Pipeline creation error scopes]', 'color:#f33');
        if (validation) console.error('validation:', validation.message);
        if (internal) console.error('internal:', internal.message);
        console.groupEnd();
      }
    }

    pipelines.set(pipeline, { label: desc.label, desc, createdAt: _stack(2), vertexDiag: vInfo, fragDiag: fInfo });
    return pipeline;
  }

  (device as any).__dbgCreateRenderPipeline = createRenderPipelineChecked;

  // Also intercept synchronous createRenderPipeline so pipelines created via the normal path
  // are registered with metadata. This prevents repeated "missing pipeline metadata" warnings
  // when setPipeline is called on those objects.
  if (!(device as any)._dbgPatchedCreateRenderPipeline) {
    (device as any)._dbgPatchedCreateRenderPipeline = true;
    const _origSyncCreate = device.createRenderPipeline.bind(device);
    device.createRenderPipeline = (desc: GPURenderPipelineDescriptor) => {
      const p = _origSyncCreate(desc);
      // Store minimal metadata (no async diagnostics here, but enough for identification)
      pipelines.set(p as GPURenderPipeline, { label: desc.label, desc, createdAt: _stack(2) });
      return p;
    };
  }

  const _createCommandEncoder = device.createCommandEncoder.bind(device);
  device.createCommandEncoder = (desc?: GPUCommandEncoderDescriptor) => {
    const enc = _createCommandEncoder(desc);
    encMeta.set(enc, { createdAt: _stack(2) });

    const _beginRenderPass = enc.beginRenderPass.bind(enc);
    (enc as any).beginRenderPass = (rpDesc: GPURenderPassDescriptor) => {
      const pass = _beginRenderPass(rpDesc);
      passMeta.set(pass, { label: rpDesc.label, type: 'render', desc: rpDesc, begunAt: _stack(2) });
      wrapRenderPass(pass as GPURenderPassEncoder);
      return pass;
    };

    const _beginComputePass = enc.beginComputePass.bind(enc);
    (enc as any).beginComputePass = (cpDesc?: GPUComputePassDescriptor) => {
      const pass = _beginComputePass(cpDesc);
      passMeta.set(pass, { label: cpDesc?.label, type: 'compute', desc: cpDesc, begunAt: _stack(2) });
      wrapComputePass(pass as GPUComputePassEncoder);
      return pass;
    };

    return enc;
  };

  function wrapRenderPass(pass: GPURenderPassEncoder) {
    const _setPipeline = pass.setPipeline.bind(pass);
    const seenPipelines = new WeakSet<GPURenderPipeline>();
  let loggedMissingMeta = false;
    pass.setPipeline = (p: GPURenderPipeline) => {
      const meta = pipelines.get(p);
      const pm = passMeta.get(pass as AnyPass);
      const rp = pm?.desc as GPURenderPassDescriptor | undefined;
      const colTargets = meta?.desc.fragment?.targets?.map((t: GPUColorTargetState) => t.format) ?? [];
      let passFormats: (GPUTextureFormat | undefined)[] = [];
      if (rp?.colorAttachments) {
        const arr: (GPURenderPassColorAttachment | null)[] = Array.isArray(rp.colorAttachments)
          ? rp.colorAttachments as (GPURenderPassColorAttachment | null)[]
          : Array.from(rp.colorAttachments as Iterable<GPURenderPassColorAttachment | null>);
        passFormats = arr.map((att) => {
          if (!att) return undefined;
          const view: any = (att as any).view;
          return view?.format;
        });
      }
      const firstTime = !seenPipelines.has(p);
      const metaMissing = !meta;
      // Only log:
      //  - first time we see this pipeline
      //  - first time we encounter a missing meta (likely invalid pipeline)
      if (firstTime || (metaMissing && !loggedMissingMeta)) {
        if (firstTime) seenPipelines.add(p); else loggedMissingMeta = true;
        const label = meta?.label ?? '(unlabeled)';
        if (metaMissing) {
          console.warn(`[setPipeline] missing pipeline metadata for ${label} (targets=${colTargets.length})`);
        } else {
          console.groupCollapsed(`%c[setPipeline • ${label}]`, 'color:#09f');
          console.log('Created at:', meta.createdAt);
          console.log('Pass stack:', pm?.begunAt);
          console.log('Pipeline target formats:', colTargets);
          console.log('Pass attachment formats:', passFormats);
          console.groupEnd();
        }
      }
      try { return _setPipeline(p); } catch (e) {
        console.group('%c[setPipeline threw — INVALID PIPELINE?]','color:#f33;font-weight:bold');
        console.error(e); console.log('Pipeline desc:', meta?.desc); console.log('Pass meta:', pm); console.groupEnd();
        throw e;
      }
    };

    const _setBindGroup = pass.setBindGroup.bind(pass);
    pass.setBindGroup = (index: number, bg: GPUBindGroup, dyn?: Iterable<number>) => {
      return _setBindGroup(index, bg, dyn as any);
    };
  }

  function wrapComputePass(pass: GPUComputePassEncoder) {
    const _setPipeline = pass.setPipeline.bind(pass);
    pass.setPipeline = (p: GPUComputePipeline) => {
      try { return _setPipeline(p); } catch (e) {
        console.group('%c[compute setPipeline threw]','color:#f33;font-weight:bold');
        console.error(e); console.groupEnd(); throw e; }
    };
  }

  (device as any).dbg = { createRenderPipeline: createRenderPipelineChecked, _pipelines: pipelines, _bindGroups: bindGroups };

  // Patch createShaderModule (once) for contextual diagnostics
  if (!(device as any)._dbgShaderPatched) {
    (device as any)._dbgShaderPatched = true;
  const origCreate = GPUDevice.prototype.createShaderModule;
  GPUDevice.prototype.createShaderModule = function(this: GPUDevice, desc: GPUShaderModuleDescriptor) {
      const code: any = (desc as any).code;
      const stack = new Error().stack?.split('\n').slice(2).join('\n');
      const label = desc.label || 'unlabeled-wgsl';
      const mod = origCreate.call(this, { ...desc, label });
      if (typeof code === 'string') {
        const lines = code.split('\n');
        const ctx = (ln: number) => {
          const s = Math.max(0, ln - 3), e = Math.min(lines.length, ln + 2);
          return lines.slice(s, e).map((L,i)=>`${String(s+i+1).padStart(5)} | ${L}`).join('\n');
        };
        mod.getCompilationInfo().then(info => {
          const errs = info.messages.filter(m=>m.type==='error');
            if (!errs.length) return;
            console.group(`%c[WGSL compile error] ${label}`, 'color:#f55;font-weight:bold');
            console.log('createShaderModule stack:\n'+stack);
            for (const m of errs) {
              const ln = m.lineNum ?? -1; const col = m.linePos ?? -1;
              console.error(`error ${ln}:${col} ${m.message}`);
              if (ln>0) console.log(ctx(ln));
            }
            console.groupEnd();
        });
      }
      return mod;
    } as any;
  }
}
