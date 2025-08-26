import depthFilter from './bilateral.wgsl'
import depthMap from './depthMap.wgsl'
import fluid from './fluid_decoupled.wgsl'
import fluidSurface from './fluid_surface.wgsl'
import fullScreen from './fullScreen.wgsl'
import gaussian from './gaussian.wgsl'
import heightBlur from './heightBlur.wgsl'
import heightDiffuse from './heightDiffuse.wgsl'
import heightFromDepth from './heightFromDepth.wgsl'
import heightPhysical from './heightPhysical.wgsl'
import { makeShaderModule } from './makeShaderModule'
import normalizeThickness from './normalizeThickness.wgsl'
import normalsFromThickness from './normalsFromThickness.wgsl'
import temporalSurface from './temporalSurface.wgsl'
import velocityFromHeight from './velocityFromHeight.wgsl'
// velocity currently stubbed (returns zeros)
// import velocityMap from './velocityMap.wgsl'
import sphere from './sphere.wgsl'
import thicknessMap from './thicknessMap.wgsl'


export class FluidRenderer {
    depthMapPipeline: GPURenderPipeline
    depthFilterPipeline: GPURenderPipeline
    thicknessMapPipeline: GPURenderPipeline
    thicknessFilterPipeline: GPURenderPipeline
    fluidPipeline: GPURenderPipeline
    fluidSurfacePipeline!: GPURenderPipeline
    normalsPipeline: GPURenderPipeline
    temporalPipeline: GPUComputePipeline
    heightPipeline: GPUComputePipeline
    heightDiffusePipeline: GPUComputePipeline
    heightPhysicalPipeline: GPUComputePipeline
    heightBlur2Pipeline?: GPUComputePipeline
    heightBlur4Pipeline?: GPUComputePipeline
    velocityPipeline?: GPUComputePipeline
    spherePipeline: GPURenderPipeline
    normalizePipeline: GPUComputePipeline

    depthMapTextureView: GPUTextureView
    tmpDepthMapTextureView: GPUTextureView
    thicknessTextureView: GPUTextureView
    tmpThicknessTextureView: GPUTextureView
    weightedThicknessTextureView: GPUTextureView
    // Keep a handle to the underlying weighted thickness accumulation texture for debug copy
    weightedThicknessTexture: GPUTexture
    thicknessTexture?: GPUTexture
    weightTextureView: GPUTextureView
    weightTexture?: GPUTexture
    weightBlurTextureView: GPUTextureView
    tmpWeightBlurTextureView: GPUTextureView
    surfaceTextureView: GPUTextureView
    temporalSurfaceTextureView: GPUTextureView
    prevSurfaceTextureView: GPUTextureView
    velocityTextureView: GPUTextureView
    temporalSurfaceTexture: GPUTexture
    surfaceTexture: GPUTexture // raw current-frame surface (pre-temporal history)
    prevSurfaceTexture: GPUTexture
    depthTestTextureView: GPUTextureView
    heightTextureView: GPUTextureView
    heightTexture: GPUTexture
    heightTextureDiffuseView?: GPUTextureView
    heightTextureDiffuse?: GPUTexture
    heightBlur2Texture?: GPUTexture
    heightBlur4Texture?: GPUTexture
    heightBlur2View?: GPUTextureView
    heightBlur4View?: GPUTextureView
    physicalTextureView?: GPUTextureView
    physicalTexture?: GPUTexture
    foamAccumTexture?: GPUTexture
    foamAccumTextureView?: GPUTextureView
    foamPrevTexture?: GPUTexture
    foamPrevTextureView?: GPUTextureView
    foamTemporalPipeline?: GPUComputePipeline
    foamParamsBuffer?: GPUBuffer
    _backgroundTexture?: GPUTexture
    _backgroundTextureView?: GPUTextureView

    depthMapBindGroup: GPUBindGroup
    depthFilterBindGroups: GPUBindGroup[]
    thicknessMapBindGroup: GPUBindGroup
    thicknessFilterBindGroups: GPUBindGroup[]
    fluidBindGroup: GPUBindGroup // legacy/unused fluid pipeline
    fluidSurfaceBindGroup!: GPUBindGroup
    normalsBindGroup: GPUBindGroup
    temporalBindGroup: GPUBindGroup
    heightBindGroup: GPUBindGroup
    heightDiffuseBindGroup: GPUBindGroup
    physicalBindGroup: GPUBindGroup
    heightBlur2BindGroup?: GPUBindGroup
    heightBlur4BindGroup?: GPUBindGroup
    sphereBindGroup: GPUBindGroup
    normalizeBindGroup: GPUBindGroup
    device: GPUDevice
    renderUniformBuffer: GPUBuffer
    waterAppearanceBuffer: GPUBuffer
    debugModeBuffer: GPUBuffer
    effectsToggleBuffer: GPUBuffer
    lightingControlsBuffer: GPUBuffer
    effectParametersBuffer: GPUBuffer
    compositionParamsBuffer: GPUBuffer
    sampler: GPUSampler
    width: number
    height: number
    _filterXUniformBuffer: GPUBuffer
    _filterYUniformBuffer: GPUBuffer
    _firstFrame: boolean = true
    _envView: GPUTextureView
    _frame: number = 0 // diagnostic frame counter
    _readbackBuffer?: GPUBuffer
    _topReadbackBuffer?: GPUBuffer
    _bottomReadbackBuffer?: GPUBuffer
    _debugReadTexture?: GPUTexture
    _accumReadBuffer?: GPUBuffer
    _surfaceMapPending: boolean = false
    _topMapPending: boolean = false
    _bottomMapPending: boolean = false
    _accumMapPending: boolean = false
    _normReadBuffer?: GPUBuffer
    _normReadBuffer2?: GPUBuffer
    _weightReadBuffer?: GPUBuffer
    _weightMapPending: boolean = false
    _normMapPending: boolean = false
    _normMapPending2: boolean = false
    _lastNormWriteToggle: boolean = false // false -> first buffer, true -> second buffer last written
    _surfaceCopyScheduled: boolean = false
    _topCopyScheduled: boolean = false
    _bottomCopyScheduled: boolean = false
    _accumCopyScheduled: boolean = false
    _normCopyScheduled: boolean = false
    _weightCopyScheduled: boolean = false
    _blurIterations: number = 4
    _heightDiffuseIterations: number = 3 // multi-pass diffusion to further suppress particle residuals
    _enablePhysicalMetrics: boolean = true
    _transmissionParamsBuffer?: GPUBuffer
    _sphereContainBuffer?: GPUBuffer
    // Internal version to force pipeline rebuild when shader binding schema changes at runtime (e.g. HMR)
    private _fluidSurfacePipelineVersion: number = 0;
    // If the debug pipeline creation is async, stash initial bind group params until pipeline arrives
    private _pendingSurfaceBindGroupOpts?: { heightTexView: GPUTextureView, surfaceTexView: GPUTextureView, envView?: GPUTextureView } | undefined;

    constructor(
        device: GPUDevice,
        canvas: HTMLCanvasElement, presentationFormat: GPUTextureFormat,
        radius: number,
        fov: number,
        posvelBuffer: GPUBuffer,
        renderUniformBuffer: GPUBuffer,
        cubemapTextureView: GPUTextureView | null,
        waterAppearanceBuffer: GPUBuffer,
        debugModeBuffer: GPUBuffer,
        effectsToggleBuffer: GPUBuffer,
        lightingControlsBuffer: GPUBuffer,
        effectParametersBuffer: GPUBuffer,
    compositionParamsBuffer: GPUBuffer,
    ) {
        this.device = device
    this.width = canvas.width
    this.height = canvas.height
        this.renderUniformBuffer = renderUniformBuffer
        this.waterAppearanceBuffer = waterAppearanceBuffer
        this.debugModeBuffer = debugModeBuffer
        this.effectsToggleBuffer = effectsToggleBuffer
        this.lightingControlsBuffer = lightingControlsBuffer
        this.effectParametersBuffer = effectParametersBuffer
        this.compositionParamsBuffer = compositionParamsBuffer

        const maxFilterSize = 100
        const blurdDepthScale = 10
        const diameter = 2 * radius
        const blurFilterSize = 12

    // Removed legacy overridable screen dimension constants.
    // Shaders now derive pixel coords from @builtin(position) and textureDimensions.
        // TODO : filter size を設定できるようにする
        const filterConstants = {
            'depth_threshold': radius * blurdDepthScale,
            'max_filter_size': maxFilterSize,
            'projected_particle_constant': (blurFilterSize * diameter * 0.05 * (canvas.height / 2)) / Math.tan(fov / 2),
        }
        this.sampler = device.createSampler({
            magFilter: 'linear',
            minFilter: 'linear'
        });

    const vertexModule = makeShaderModule(device, fullScreen); // vertex - helpers harmless
    const depthMapModule = makeShaderModule(device, depthMap)
    const depthFilterModule = makeShaderModule(device, depthFilter)
    const fluidModule = makeShaderModule(device, fluid)
    const fluidSurfaceModule = makeShaderModule(device, fluidSurface)
    const sphereModule = makeShaderModule(device, sphere) // particle billboards: helpers unused
    const thicknessMapModule = makeShaderModule(device, thicknessMap)
    const thicknessFilterModule = makeShaderModule(device, gaussian)
    const normalsModule = makeShaderModule(device, normalsFromThickness)
    const normalizeModule = makeShaderModule(device, normalizeThickness)
    const temporalModule = makeShaderModule(device, temporalSurface)
    const heightModule = makeShaderModule(device, heightFromDepth)
    const heightDiffuseModule = makeShaderModule(device, heightDiffuse)
    const heightPhysicalModule = makeShaderModule(device, heightPhysical)
    const heightBlurModule = makeShaderModule(device, heightBlur)
    const velocityModule = makeShaderModule(device, velocityFromHeight)

        // pipelines
        this.spherePipeline = device.createRenderPipeline({
            label: 'ball pipeline',
            layout: 'auto',
            vertex: { module: sphereModule },
            fragment: {
                module: sphereModule,
                targets: [
                    {
                        format: presentationFormat,
                    }
                ]
            },
            primitive: {
                topology: 'triangle-list',
            },
            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: 'less',
                format: 'depth32float'
            }
        })
        this.depthMapPipeline = device.createRenderPipeline({
            label: 'depth map pipeline',
            layout: 'auto',
            vertex: { module: depthMapModule },
            fragment: {
                module: depthMapModule,
                targets: [
                    {
                        format: 'r32float',
                    },
                ],
            },
            primitive: {
                topology: 'triangle-list',
            },
            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: 'less',
                format: 'depth32float'
            }
        })
        this.depthFilterPipeline = device.createRenderPipeline({
            label: 'filter pipeline',
            layout: 'auto',
            vertex: { module: vertexModule },
            fragment: {
                module: depthFilterModule,
                constants: filterConstants,
                targets: [
                    {
                        format: 'r32float',
                    },
                ],
            },
            primitive: {
                topology: 'triangle-list',
            },
        });
        this.thicknessMapPipeline = device.createRenderPipeline({
            label: 'thickness map pipeline',
            layout: 'auto',
            vertex: { module: thicknessMapModule },
            fragment: {
                module: thicknessMapModule,
                targets: [
                    { // weighted thickness accumulation
                        format: 'r16float',
                        writeMask: GPUColorWrite.RED,
                        blend: { color: { operation: 'add', srcFactor: 'one', dstFactor: 'one' }, alpha: { operation: 'add', srcFactor: 'one', dstFactor: 'one' } }
                    },
                    { // weight accumulation
                        format: 'r16float',
                        writeMask: GPUColorWrite.RED,
                        blend: { color: { operation: 'add', srcFactor: 'one', dstFactor: 'one' }, alpha: { operation: 'add', srcFactor: 'one', dstFactor: 'one' } }
                    }
                ]
            },
            primitive: { topology: 'triangle-list' }
        });
    this.thicknessFilterPipeline = device.createRenderPipeline({
            label: 'thickness filter pipeline',
            layout: 'auto',
            vertex: { module: vertexModule },
            fragment: {
                module: thicknessFilterModule,
                targets: [
            { format: 'rgba16float' },
                ],
            },
            primitive: {
                topology: 'triangle-list',
            },
        });
        this.normalsPipeline = device.createRenderPipeline({
            label: 'surface normals pipeline',
            layout: 'auto',
            vertex: { module: vertexModule },
            fragment: { module: normalsModule, targets: [ { format: 'rgba16float' } ] },
            primitive: { topology: 'triangle-list' },
        });
        this.temporalPipeline = device.createComputePipeline({
            label: 'temporal surface compute',
            layout: 'auto',
            compute: { module: temporalModule }
        });
        this.normalizePipeline = device.createComputePipeline({
            label: 'normalize thickness compute',
            layout: 'auto',
            compute: { module: normalizeModule }
        })
        this.heightPipeline = device.createComputePipeline({
            label: 'height reconstruction compute',
            layout: 'auto',
            compute: { module: heightModule }
        });
        this.heightDiffusePipeline = device.createComputePipeline({
            label: 'height diffusion compute',
            layout: 'auto',
            compute: { module: heightDiffuseModule }
        });
        this.heightPhysicalPipeline = device.createComputePipeline({
            label: 'height physical metrics compute',
            layout: 'auto',
            compute: { module: heightPhysicalModule }
        });
        this.heightBlur2Pipeline = device.createComputePipeline({
            label: 'height blur radius2 compute',
            layout: 'auto',
            compute: { module: heightBlurModule, entryPoint: 'blur2' }
        });
        this.heightBlur4Pipeline = device.createComputePipeline({
            label: 'height blur radius4 compute',
            layout: 'auto',
            compute: { module: heightBlurModule, entryPoint: 'blur4' }
        });
        this.velocityPipeline = device.createComputePipeline({
            label: 'velocity from height compute',
            layout: 'auto',
            compute: { module: velocityModule }
        });
        this.fluidPipeline = device.createRenderPipeline({
            label: 'fluid rendering pipeline',
            layout: 'auto',
            vertex: { module: vertexModule }, fragment: {
                module: fluidModule,
                targets: [
                    {
                        format: presentationFormat,
                        blend: {
                            color: {
                                srcFactor: 'src-alpha',
                                dstFactor: 'one-minus-src-alpha',
                                operation: 'add'
                            },
                            alpha: {
                                srcFactor: 'one',
                                dstFactor: 'one-minus-src-alpha',
                                operation: 'add'
                            }
                        }
                    }
                ],
            },
            primitive: {
                topology: 'triangle-list',
            },
        });
        const surfaceDesc: GPURenderPipelineDescriptor = {
            label: 'fluid surface pipeline',
            layout: 'auto',
            vertex: { module: vertexModule },
            fragment: { module: fluidSurfaceModule, entryPoint: 'fs', targets: [ { format: presentationFormat, blend: {
                color: { srcFactor:'one', dstFactor:'one-minus-src-alpha', operation:'add' },
                alpha: { srcFactor:'one', dstFactor:'one-minus-src-alpha', operation:'add' } } } ] },
            primitive: { topology: 'triangle-list' },
        };
        const dbgCreator = (device as any).__dbgCreateRenderPipeline as ((d: GPURenderPipelineDescriptor)=>Promise<GPURenderPipeline>)|undefined;
        if (dbgCreator) {
            // Defer pipeline-dependent work until promise resolves
            dbgCreator(surfaceDesc).then(p => {
                this.fluidSurfacePipeline = p;
                this._fluidSurfacePipelineVersion++;
                if (this._pendingSurfaceBindGroupOpts) {
                    // Now safe to create the initially requested bind group
                    this.fluidSurfaceBindGroup = this._createFluidSurfaceBindGroup(this._pendingSurfaceBindGroupOpts);
                    this._pendingSurfaceBindGroupOpts = undefined;
                }
            }).catch(e => { console.error('[FluidRenderer] Debug pipeline creation failed', e); });
        } else {
            this.fluidSurfacePipeline = device.createRenderPipeline(surfaceDesc);
            this._fluidSurfacePipelineVersion++;
        }

        // textures
        const depthMapTexture = device.createTexture({
            label: 'depth map texture',
            size: [canvas.width, canvas.height, 1],
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
            format: 'r32float',
        });
        const tmpDepthMapTexture = device.createTexture({
            label: 'temporary depth map texture',
            size: [canvas.width, canvas.height, 1],
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
            format: 'r32float',
        });
        // MRT accumulation outputs (weighted thickness + weight)
        const weightedThicknessTexture = device.createTexture({
            label: 'weighted thickness accumulation',
            size: [canvas.width, canvas.height, 1],
            // Add COPY_SRC so we can read back a pixel for diagnostics
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC,
            format: 'r16float',
        });
        const weightTexture = device.createTexture({
            label: 'weight accumulation',
            size: [canvas.width, canvas.height, 1],
            // Add COPY_SRC for debug readback
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC,
            format: 'r16float',
        });
        // Blurred weight ping-pong (RGBA16F to reuse gaussian pipeline)
        const weightBlurTexture = device.createTexture({
            label: 'blurred weight texture',
            size: [canvas.width, canvas.height, 1],
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
            format: 'rgba16float'
        });
        const tmpWeightBlurTexture = device.createTexture({
            label: 'tmp blurred weight texture',
            size: [canvas.width, canvas.height, 1],
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
            format: 'rgba16float'
        });
        // Normalized + blurred thickness ping-pong textures (destination of compute normalization then blur)
        const thicknessTexture = device.createTexture({
            label: 'normalized thickness texture',
            size: [canvas.width, canvas.height, 1],
            // Add COPY_SRC to permit debug readback of normalized thickness
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_SRC,
            format: 'rgba16float',
        });
        const tmpThicknessTexture = device.createTexture({
            label: 'tmp normalized thickness texture',
            size: [canvas.width, canvas.height, 1],
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
            format: 'rgba16float',
        });
        const surfaceTexture = device.createTexture({
            label: 'surface normal/coverage texture',
            size: [canvas.width, canvas.height, 1],
            // Need COPY_SRC for first-frame history copy -> prevSurfaceTexture
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC,
            format: 'rgba16float',
        });
    // Removed intermediate debug texture (we'll copy directly from surfaceTexture)
        this._readbackBuffer = device.createBuffer({
            label: 'debug readback buffer',
            size: 256, // bytesPerRow alignment requirement; we only read first 16 bytes
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
        });
        this._topReadbackBuffer = device.createBuffer({
            label: 'debug top row readback buffer',
            size: 256,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
        });
        this._bottomReadbackBuffer = device.createBuffer({
            label: 'debug bottom row readback buffer',
            size: 256,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
        });
        this._accumReadBuffer = device.createBuffer({
            label: 'accum readback buffer',
            size: 256,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
        });
        this._normReadBuffer = device.createBuffer({
            label: 'norm readback buffer',
            size: 256,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
        });
        this._normReadBuffer2 = device.createBuffer({
            label: 'norm readback buffer (B)',
            size: 256,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
        });
        this._weightReadBuffer = device.createBuffer({
            label: 'weight readback buffer',
            size: 256,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
        });
    const temporalSurfaceTexture = device.createTexture({
            label: 'temporal stabilized surface texture',
            size: [canvas.width, canvas.height, 1],
            usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC,
            format: 'rgba16float',
        });
    const prevSurfaceTexture = device.createTexture({
            label: 'previous surface texture',
            size: [canvas.width, canvas.height, 1],
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
            format: 'rgba16float',
        });
        const velocityTexture = device.createTexture({
            label: 'velocity texture (generated from height)',
            size: [canvas.width, canvas.height, 1],
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING,
            format: 'rgba16float',
        });
        const heightTexture = device.createTexture({
            label: 'height field texture',
            size: [canvas.width, canvas.height, 1],
            usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
            format: 'rgba16float'
        });
        const heightTextureDiffuse = device.createTexture({
            label: 'height field diffused texture',
            size: [canvas.width, canvas.height, 1],
            usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
            format: 'rgba16float'
        });
        const heightBlur2Texture = device.createTexture({
            label: 'height blur radius2',
            size: [canvas.width, canvas.height, 1],
            usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
            format: 'rgba16float'
        });
        const heightBlur4Texture = device.createTexture({
            label: 'height blur radius4',
            size: [canvas.width, canvas.height, 1],
            usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
            format: 'rgba16float'
        });
        const physicalTexture = device.createTexture({
            label: 'physical metrics texture',
            size: [canvas.width, canvas.height, 1],
            usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
            format: 'rgba16float'
        });
        const foamAccumTexture = device.createTexture({
            label: 'foam accumulation texture',
            size: [canvas.width, canvas.height, 1],
            usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC,
            format: 'rgba16float'
        });
        const foamPrevTexture = device.createTexture({
            label: 'foam accumulation previous texture',
            size: [canvas.width, canvas.height, 1],
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC,
            format: 'rgba16float'
        });
        // Temporary solid background (will later be replaced by a real pre-water scene render)
        this._backgroundTexture = device.createTexture({
            label: 'background solid texture',
            size: [1,1,1],
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
            format: 'rgba16float'
        });
        const black = new Uint16Array([0,0,0,0]);
        device.queue.writeTexture({ texture: this._backgroundTexture }, black, { bytesPerRow: 8 }, [1,1,1]);
        this._backgroundTextureView = this._backgroundTexture.createView();
        const depthTestTexture = device.createTexture({
            size: [canvas.width, canvas.height, 1],
            format: 'depth32float',
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        })
        this.depthMapTextureView = depthMapTexture.createView()
        this.tmpDepthMapTextureView = tmpDepthMapTexture.createView()
    this.weightedThicknessTextureView = weightedThicknessTexture.createView()
    this.weightedThicknessTexture = weightedThicknessTexture
    this.weightTextureView = weightTexture.createView()
    this.weightTexture = weightTexture
    this.weightBlurTextureView = weightBlurTexture.createView()
    this.tmpWeightBlurTextureView = tmpWeightBlurTexture.createView()
    this.thicknessTextureView = thicknessTexture.createView()
    this.thicknessTexture = thicknessTexture
    this.tmpThicknessTextureView = tmpThicknessTexture.createView()
    this.surfaceTextureView = surfaceTexture.createView();
    this.surfaceTexture = surfaceTexture; // store raw GPUTexture for first-frame history copy
    this.temporalSurfaceTexture = temporalSurfaceTexture
    this.prevSurfaceTexture = prevSurfaceTexture
    this.temporalSurfaceTextureView = temporalSurfaceTexture.createView()
    this.prevSurfaceTextureView = prevSurfaceTexture.createView()
    this.velocityTextureView = velocityTexture.createView()
    this.heightTextureView = heightTexture.createView()
    this.heightTexture = heightTexture
    this.heightTextureDiffuseView = heightTextureDiffuse.createView()
    this.heightTextureDiffuse = heightTextureDiffuse
    this.heightBlur2View = heightBlur2Texture.createView()
    this.heightBlur4View = heightBlur4Texture.createView()
    this.heightBlur2Texture = heightBlur2Texture
    this.heightBlur4Texture = heightBlur4Texture
    this.physicalTextureView = physicalTexture.createView()
    this.physicalTexture = physicalTexture
    this.foamAccumTextureView = foamAccumTexture.createView()
    this.foamAccumTexture = foamAccumTexture
    this.foamPrevTextureView = foamPrevTexture.createView()
    this.foamPrevTexture = foamPrevTexture
        this.depthTestTextureView = depthTestTexture.createView()

        // buffer
        const filterXUniformsValues = new ArrayBuffer(8);
        const filterYUniformsValues = new ArrayBuffer(8);
        const filterXUniformsViews = { blur_dir: new Float32Array(filterXUniformsValues) };
        const filterYUniformsViews = { blur_dir: new Float32Array(filterYUniformsValues) };
        filterXUniformsViews.blur_dir.set([1.0, 0.0]);
        filterYUniformsViews.blur_dir.set([0.0, 1.0]);
    const filterXUniformBuffer = device.createBuffer({
            label: 'filter uniform buffer',
            size: filterXUniformsValues.byteLength,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        })
        const filterYUniformBuffer = device.createBuffer({
            label: 'filter uniform buffer',
            size: filterYUniformsValues.byteLength,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        })
        device.queue.writeBuffer(filterXUniformBuffer, 0, filterXUniformsValues);
        device.queue.writeBuffer(filterYUniformBuffer, 0, filterYUniformsValues);
    this._filterXUniformBuffer = filterXUniformBuffer;
    this._filterYUniformBuffer = filterYUniformBuffer;

        // bindGroup
        this.depthMapBindGroup = device.createBindGroup({
            label: 'depth map bind group',
            layout: this.depthMapPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: posvelBuffer } },
                { binding: 1, resource: { buffer: renderUniformBuffer } },
            ]
        })
        this.depthFilterBindGroups = []
        this.depthFilterBindGroups = [
            device.createBindGroup({
                label: 'filterX bind group',
                layout: this.depthFilterPipeline.getBindGroupLayout(0),
                entries: [
                    // { binding: 0, resource: sampler },
                    { binding: 1, resource: this.depthMapTextureView }, // 元の領域から読み込む
                    { binding: 2, resource: { buffer: filterXUniformBuffer } },
                ],
            }),
            device.createBindGroup({
                label: 'filterY bind group',
                layout: this.depthFilterPipeline.getBindGroupLayout(0),
                entries: [
                    // { binding: 0, resource: sampler },
                    { binding: 1, resource: this.tmpDepthMapTextureView }, // 一時領域から読み込む
                    { binding: 2, resource: { buffer: filterYUniformBuffer } }
                ],
            })
        ];
        this.thicknessMapBindGroup = device.createBindGroup({
            label: 'thickness map bind group',
            layout: this.thicknessMapPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: posvelBuffer } },
                { binding: 1, resource: { buffer: renderUniformBuffer } },
            ],
        })
        this.thicknessFilterBindGroups = []
        this.thicknessFilterBindGroups = [
            device.createBindGroup({
                label: 'thickness filterX bind group',
                layout: this.thicknessFilterPipeline.getBindGroupLayout(0),
                entries: [
                    // { binding: 0, resource: sampler },
                    { binding: 1, resource: this.thicknessTextureView },
                    { binding: 2, resource: { buffer: filterXUniformBuffer } },
                ],
            }),
            device.createBindGroup({
                label: 'thickness filterY bind group',
                layout: this.thicknessFilterPipeline.getBindGroupLayout(0),
                entries: [
                    // { binding: 0, resource: sampler },
                    { binding: 1, resource: this.tmpThicknessTextureView },
                    { binding: 2, resource: { buffer: filterYUniformBuffer } },
                ],
            }),
        ]; this.fluidBindGroup = device.createBindGroup({
            label: 'fluid bind group',
            layout: this.fluidPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: this.sampler },
                { binding: 1, resource: this.depthMapTextureView },
                { binding: 2, resource: { buffer: renderUniformBuffer } },
                { binding: 3, resource: this.thicknessTextureView },
                { binding: 4, resource: cubemapTextureView as GPUTextureView }, // cast; fallback ensured below
                { binding: 5, resource: { buffer: waterAppearanceBuffer } },
                { binding: 6, resource: { buffer: debugModeBuffer } },
                { binding: 7, resource: { buffer: effectsToggleBuffer } },
                { binding: 8, resource: { buffer: lightingControlsBuffer } },
                { binding: 9, resource: { buffer: effectParametersBuffer } },
                { binding: 10, resource: { buffer: compositionParamsBuffer } },
            ]
        })
    this.normalsBindGroup = device.createBindGroup({
            label: 'normals bind group',
            layout: this.normalsPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: this.thicknessTextureView },
                { binding: 1, resource: this.weightBlurTextureView },
            ]
        });
    // Temporal parameters uniform buffer
    const temporalParamsSize = 4 * 4; // vec2 + 3 floats (we only use subset) padded
    const temporalParamsBuffer = device.createBuffer({
        label: 'temporal params',
        size: temporalParamsSize,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    const invRes = new Float32Array([1/this.width, 1/this.height, 0.12, 0.001]);
    device.queue.writeBuffer(temporalParamsBuffer, 0, invRes.buffer);
    this.temporalBindGroup = device.createBindGroup({
        label: 'temporal surface bind group',
        layout: this.temporalPipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: this.surfaceTextureView },          // currentSurface
            { binding: 1, resource: this.prevSurfaceTextureView },      // prevSurface
            { binding: 2, resource: this.velocityTextureView },         // velocityTex
            { binding: 3, resource: { buffer: temporalParamsBuffer } }, // params uniform
            { binding: 4, resource: this.temporalSurfaceTextureView },  // outSurface (storage)
        ]
    });
    // Normalization compute bind group (no params needed)
    this.normalizeBindGroup = device.createBindGroup({
            label: 'normalize thickness bind group',
            layout: this.normalizePipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: this.weightedThicknessTextureView },
                { binding: 1, resource: this.weightTextureView },
        { binding: 2, resource: this.thicknessTextureView },
            ]
        });

        // Height reconstruction compute bind group
        this.heightBindGroup = device.createBindGroup({
            label: 'height reconstruction bind group',
            layout: this.heightPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: this.depthMapTextureView },
                { binding: 1, resource: this.surfaceTextureView }, // for coverage (A)
                { binding: 2, resource: this.heightTextureView },
            ]
        });
        this.heightDiffuseBindGroup = device.createBindGroup({
            label: 'height diffusion bind group',
            layout: this.heightDiffusePipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: this.heightTextureView },
                { binding: 1, resource: this.heightTextureDiffuseView! },
            ]
        });
        this.heightBlur2BindGroup = device.createBindGroup({
            label: 'height blur2 bind group',
            layout: this.heightBlur2Pipeline!.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: this.heightTextureDiffuseView! },
                { binding: 1, resource: this.heightBlur2View! },
            ]
        });
        this.heightBlur4BindGroup = device.createBindGroup({
            label: 'height blur4 bind group',
            layout: this.heightBlur4Pipeline!.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: this.heightBlur2View! },
                { binding: 1, resource: this.heightBlur4View! },
            ]
        });
        this.physicalBindGroup = device.createBindGroup({
            label: 'height physical metrics bind group',
            layout: this.heightPhysicalPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: this.heightTextureDiffuseView ?? this.heightTextureView },
                { binding: 1, resource: this.heightBlur2View! },
                { binding: 2, resource: this.heightBlur4View! },
                { binding: 3, resource: { buffer: this.renderUniformBuffer } },
                { binding: 4, resource: this.physicalTextureView! },
            ]
        });

        // Foam temporal pipeline
        // Inline shader source (could be replaced by build-time import)
        const foamTemporalSource = `// inline copy of foamTemporal.wgsl\n` +
            `struct FoamParams { growRate: f32, decayRate: f32, appearThreshold: f32, disappearThreshold: f32, slopeScale: f32, curvatureScale: f32, smoothing: f32, padding: f32, };\n` +
            `@group(0) @binding(0) var physicalTex: texture_2d<f32>;\n` +
            `@group(0) @binding(1) var prevFoam: texture_2d<f32>;\n` +
            `@group(0) @binding(2) var outFoam: texture_storage_2d<rgba16float, write>;\n` +
            `@group(0) @binding(3) var<uniform> foamParams: FoamParams;\n` +
            `@compute @workgroup_size(8,8,1)\n` +
            `fn main(@builtin(global_invocation_id) gid: vec3u) {\n` +
            ` let dims = textureDimensions(physicalTex);\n` +
            ` if (gid.x >= dims.x || gid.y >= dims.y) { return; }\n` +
            ` let coord = vec2u(gid.xy);\n` +
            ` let phys = textureLoad(physicalTex, coord, 0);\n` +
            ` let slope = phys.r; let dirCurv = phys.g; let crestRaw = clamp(phys.b,0.0,1.0);\n` +
            ` let coverage = clamp(phys.a, 0.0, 1.0);\n` +
            ` let prev = textureLoad(prevFoam, coord, 0).r;\n` +
            ` let slopeN = saturate(slope / (1.0 + slope)); let negCurv = max(0.0, -dirCurv); let curvN = negCurv / (1.0 + negCurv);\n` +
            ` let foamCand = mix(crestRaw, (crestRaw + prev) * 0.5, foamParams.smoothing);\n` +
            ` let adapt = foamParams.slopeScale * slopeN + foamParams.curvatureScale * curvN;\n` +
            ` let appearT = clamp(foamParams.appearThreshold - adapt, 0.02, 0.95);\n` +
            ` let disappearT = clamp(foamParams.disappearThreshold - adapt * 0.5, 0.01, appearT - 0.01);\n` +
            ` let growMask = select(0.0, 1.0, foamCand > appearT);\n` +
            ` let keepMask = select(0.0, 1.0, foamCand > disappearT);\n` +
            ` let excess = max(0.0, foamCand - appearT) / max(1e-4, 1.0 - appearT);\n` +
            ` let growth = excess * foamParams.growRate * growMask;\n` +
            ` let decay = foamParams.decayRate * (1.0 - keepMask);\n` +
            ` var accum = prev; accum = accum + growth - decay * accum;\n` +
            ` accum *= smoothstep(0.15, 0.6, coverage);\n` +
            ` accum = clamp(accum, 0.0, 1.0);\n` +
            ` textureStore(outFoam, vec2i(coord), vec4f(accum,0.0,0.0,1.0));\n` +
            `}`;
        this.foamTemporalPipeline = device.createComputePipeline({
            label: 'foam temporal pipeline',
            layout: 'auto',
            compute: { module: makeShaderModule(device, foamTemporalSource), entryPoint: 'main' }
        });
        // Foam params uniform
    const foamParamsArr = new Float32Array([0.9, 0.12, 0.28, 0.18, 0.55, 0.45, 0.4, 0.0]); // extended params
        this.foamParamsBuffer = device.createBuffer({
            label: 'foam params',
            size: foamParamsArr.byteLength,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        device.queue.writeBuffer(this.foamParamsBuffer, 0, foamParamsArr);

        // Transmission params uniform (currently only transmissionWeight used)
        this._transmissionParamsBuffer = device.createBuffer({
            label: 'transmission params',
            size: 16,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        device.queue.writeBuffer(this._transmissionParamsBuffer, 0, new Float32Array([1.0, 0, 0, 0]));

        // Sphere containment params buffer: center.xyz, radius, enabled flag, padding
        this._sphereContainBuffer = device.createBuffer({
            label: 'sphere contain params',
            size: 32,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        // default disabled
        device.queue.writeBuffer(this._sphereContainBuffer, 0, new Float32Array([0,0,0, 5.0, 0,0,0,0]));

        // Ensure we have a cube environment texture (fallback to 1x1 white cube)
    if (!cubemapTextureView) {
            const dummyCube = device.createTexture({
                dimension: '2d', // create 6-layer 2D array with cube view
                size: [1, 1, 6],
                format: 'rgba8unorm',
                usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
            });
            const white = new Uint8Array([255,255,255,255]);
            for (let face = 0; face < 6; face++) {
                device.queue.writeTexture({ texture: dummyCube, origin: [0,0,face] }, white, { bytesPerRow: 4 }, [1,1]);
            }
            cubemapTextureView = dummyCube.createView({ dimension: 'cube' });
        }
    const envView = cubemapTextureView!; // fallback created if null
    this._envView = envView;
        // Create initial surface bind group with helper (guards against layout mismatch on live shader edits)
        if (this.fluidSurfacePipeline) {
            this.fluidSurfaceBindGroup = this._createFluidSurfaceBindGroup({
                heightTexView: this.heightTextureDiffuseView ?? this.heightTextureView,
                surfaceTexView: this.surfaceTextureView,
                envView,
            });
        } else {
            // Pipeline not ready yet (async debug creator). Defer creation.
            this._pendingSurfaceBindGroupOpts = {
                heightTexView: this.heightTextureDiffuseView ?? this.heightTextureView,
                surfaceTexView: this.surfaceTextureView,
                envView,
            };
        }

        this.sphereBindGroup = device.createBindGroup({
            label: 'ball bind group',
            layout: this.spherePipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: posvelBuffer } },
                { binding: 1, resource: { buffer: renderUniformBuffer } },
            ]
        })
    }

    /**
     * Internal helper: (re)create the fluid surface bind group robustly.
     * If creation fails due to an Invalid BindGroupLayout (common after hot-reloading WGSL
     * where auto layout changed), we rebuild the pipeline and retry once with the updated shader.
     */
    private _createFluidSurfaceBindGroup(opts: { heightTexView: GPUTextureView, surfaceTexView: GPUTextureView, envView?: GPUTextureView }): GPUBindGroup {
        const device = this.device;
        const attempt = (tag: string): GPUBindGroup => device.createBindGroup({
            label: `fluid surface bind group${tag}`,
            layout: this.fluidSurfacePipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: this.sampler },
                { binding: 1, resource: { buffer: this.renderUniformBuffer } },
                { binding: 2, resource: opts.heightTexView },
                { binding: 3, resource: opts.surfaceTexView },
                { binding: 4, resource: opts.envView ?? this._envView },
                { binding: 5, resource: { buffer: this.waterAppearanceBuffer } },
                { binding: 6, resource: { buffer: this.debugModeBuffer } },
                { binding: 7, resource: { buffer: this.effectsToggleBuffer } },
                { binding: 8, resource: { buffer: this.lightingControlsBuffer } },
                { binding: 9, resource: { buffer: this.effectParametersBuffer } },
                { binding: 10, resource: { buffer: this.compositionParamsBuffer } },
                { binding: 11, resource: this.physicalTextureView! },
                { binding: 12, resource: this.foamAccumTextureView! },
                { binding: 13, resource: this.velocityTextureView },
                { binding: 14, resource: this._backgroundTextureView! },
                { binding: 15, resource: { buffer: this._transmissionParamsBuffer! } },
                { binding: 16, resource: { buffer: this._sphereContainBuffer! } },
            ],
        });
        try {
            const bg = attempt('');
            (bg as any)._pipelineVersion = this._fluidSurfacePipelineVersion;
            return bg;
        } catch (e) {
            console.warn('[FluidRenderer] Initial bind group creation failed, attempting pipeline rebuild...', e);
            try {
                // Rebuild pipeline with latest WGSL (imported module string stays current via bundler HMR)
                // NOTE: we cannot re-import easily here; reuse original source via dynamic import fallback if needed.
                // For now, recreate pipeline from cached shader module (makeShaderModule on fluidSurface again).
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                const fluidSurfaceSource = (fluidSurface as unknown as string);
                const newModule = makeShaderModule(this.device, fluidSurfaceSource);
                const rebuildFormat: GPUTextureFormat = (typeof navigator !== 'undefined' && (navigator as any).gpu && (navigator as any).gpu.getPreferredCanvasFormat)
                    ? (navigator as any).gpu.getPreferredCanvasFormat()
                    : 'bgra8unorm';
                this.fluidSurfacePipeline = this.device.createRenderPipeline({
                    label: 'fluid surface pipeline (rebuild)',
                    layout: 'auto',
                    vertex: { module: makeShaderModule(this.device, fullScreen) }, // fullscreen vertex
                    fragment: { module: newModule, entryPoint: 'fs', targets: [ { format: rebuildFormat, blend: { color: { srcFactor:'one', dstFactor:'one-minus-src-alpha', operation:'add' }, alpha: { srcFactor:'one', dstFactor:'one-minus-src-alpha', operation:'add' } } } ] },
                    primitive: { topology: 'triangle-list' },
                });
                this._fluidSurfacePipelineVersion++;
                const bg2 = attempt(' (rebuild)');
                (bg2 as any)._pipelineVersion = this._fluidSurfacePipelineVersion;
                return bg2;
            } catch (e2) {
                console.error('[FluidRenderer] Failed to rebuild fluid surface pipeline; surface rendering disabled this frame.', e2);
                // Fallback: create minimal dummy bind group with only mandatory first entries (avoids crash downstream)
                const dummy = this.device.createBindGroup({
                    label: 'fluid surface bind group (dummy)',
                    layout: this.fluidSurfacePipeline.getBindGroupLayout(0),
                    entries: [
                        { binding: 0, resource: this.sampler },
                        { binding: 1, resource: { buffer: this.renderUniformBuffer } },
                        { binding: 2, resource: opts.heightTexView },
                        { binding: 3, resource: opts.surfaceTexView },
                        { binding: 4, resource: opts.envView ?? this._envView },
                    ],
                });
                (dummy as any)._pipelineVersion = this._fluidSurfacePipelineVersion;
                return dummy;
            }
        }
    }

    setSphereContain(enabled: boolean, center: [number,number,number], radius: number) {
        if (!this._sphereContainBuffer) return;
        const flag = enabled ? 1 : 0;
        const arr = new Float32Array([center[0], center[1], center[2], radius, flag, 0, 0, 0]);
        this.device.queue.writeBuffer(this._sphereContainBuffer, 0, arr);
    }


    execute(context: GPUCanvasContext, commandEncoder: GPUCommandEncoder, numParticles: number, sphereRenderFl: boolean) {
        // これらも前もって作っておけるんじゃないか？
        const depthMapPassDescriptor: GPURenderPassDescriptor = {
            colorAttachments: [
                {
                    view: this.depthMapTextureView,
                    clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
                    loadOp: 'clear',
                    storeOp: 'store',
                },
            ],
            depthStencilAttachment: {
                view: this.depthTestTextureView,
                depthClearValue: 1.0,
                depthLoadOp: 'clear',
                depthStoreOp: 'store',
            },
        }

        const depthFilterPassDescriptors: GPURenderPassDescriptor[] = [
            {
                colorAttachments: [
                    {
                        view: this.tmpDepthMapTextureView,
                        clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
                        loadOp: 'clear',
                        storeOp: 'store',
                    },
                ],
            },
            {
                colorAttachments: [
                    {
                        view: this.depthMapTextureView,
                        clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
                        loadOp: 'clear',
                        storeOp: 'store',
                    },
                ],
            }
        ]

        const thicknessMapPassDescriptor: GPURenderPassDescriptor = {
            colorAttachments: [
                { // weighted thickness
                    view: this.weightedThicknessTextureView,
                    clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
                    loadOp: 'clear', storeOp: 'store'
                },
                { // weight sum
                    view: this.weightTextureView,
                    clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
                    loadOp: 'clear', storeOp: 'store'
                }
            ]
        }

    const thicknessFilterPassDescriptors: GPURenderPassDescriptor[] = [
            {
                colorAttachments: [
                    {
                        view: this.tmpThicknessTextureView, // 一時領域へ書き込み
                        clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
                        loadOp: 'clear',
                        storeOp: 'store',
                    },
                ],
            },
            {
                colorAttachments: [
                    { view: this.thicknessTextureView, clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 }, loadOp: 'clear', storeOp: 'store' },
                ],
            }
        ];
        const normalsPassDescriptor: GPURenderPassDescriptor = {
            colorAttachments: [
                {
                    view: this.surfaceTextureView,
                    clearValue: { r: 0, g: 0, b: 0, a: 0 },
                    loadOp: 'clear',
                    storeOp: 'store'
                }
            ]
        };
        // Weight blur pass descriptors (reuse gaussian shader) single iteration X/Y
        const weightBlurPassDescriptors: GPURenderPassDescriptor[] = [
            { colorAttachments: [ { view: this.tmpWeightBlurTextureView, clearValue: { r:0,g:0,b:0,a:1}, loadOp:'clear', storeOp:'store' } ] },
            { colorAttachments: [ { view: this.weightBlurTextureView,    clearValue: { r:0,g:0,b:0,a:1}, loadOp:'clear', storeOp:'store' } ] }
        ];
        const fluidPassDescriptor: GPURenderPassDescriptor = {
            colorAttachments: [
                {
                    view: context.getCurrentTexture().createView(),
                    loadOp: 'load', // Changed from 'clear' to 'load' to preserve skybox
                    storeOp: 'store',
                },
            ],
        }; const spherePassDescriptor: GPURenderPassDescriptor = {
            colorAttachments: [
                {
                    view: context.getCurrentTexture().createView(),
                    loadOp: 'load', // Changed from 'clear' to 'load' to preserve skybox
                    storeOp: 'store',
                },
            ],
            depthStencilAttachment: {
                view: this.depthTestTextureView,
                depthClearValue: 1.0,
                depthLoadOp: 'clear',
                depthStoreOp: 'store',
            },
        }

        if (!sphereRenderFl) {
            this._frame++;
            if (this._firstFrame && this._frame === 1) {
                console.log('[FluidRenderer] Frame 1: building surface (temporal OFF).');
            }
            const depthMapPassEncoder = commandEncoder.beginRenderPass(depthMapPassDescriptor);
            depthMapPassEncoder.setBindGroup(0, this.depthMapBindGroup);
            depthMapPassEncoder.setPipeline(this.depthMapPipeline);
            depthMapPassEncoder.draw(6, numParticles);
            depthMapPassEncoder.end();
            for (var iter = 0; iter < 4; iter++) {
                const depthFilterPassEncoderX = commandEncoder.beginRenderPass(depthFilterPassDescriptors[0]!);
                depthFilterPassEncoderX.setBindGroup(0, this.depthFilterBindGroups[0]!);
                depthFilterPassEncoderX.setPipeline(this.depthFilterPipeline);
                depthFilterPassEncoderX.draw(3);
                depthFilterPassEncoderX.end();
                const filterPassEncoderY = commandEncoder.beginRenderPass(depthFilterPassDescriptors[1]!);
                filterPassEncoderY.setBindGroup(0, this.depthFilterBindGroups[1]!);
                filterPassEncoderY.setPipeline(this.depthFilterPipeline);
                filterPassEncoderY.draw(3);
                filterPassEncoderY.end();
            }

            const thicknessMapPassEncoder = commandEncoder.beginRenderPass(thicknessMapPassDescriptor);
            thicknessMapPassEncoder.setBindGroup(0, this.thicknessMapBindGroup);
            thicknessMapPassEncoder.setPipeline(this.thicknessMapPipeline);
            thicknessMapPassEncoder.draw(6, numParticles);
            thicknessMapPassEncoder.end();

            // Instrument accumulation before normalization (center pixel) (two-phase: copy on phase 0)
            const acx = Math.min(this.width-1, Math.floor(this.width/2));
            const acy = Math.min(this.height-1, Math.floor(this.height/2));
            const phase = this._frame % 60;
            if (phase === 0) {
                if (this._accumReadBuffer && !this._accumCopyScheduled) {
                    commandEncoder.copyTextureToBuffer(
                        { texture: this.weightedThicknessTexture, origin: [acx, acy, 0] },
                        { buffer: this._accumReadBuffer, bytesPerRow: 256 },
                        { width:1, height:1, depthOrArrayLayers:1 }
                    );
                    this._accumCopyScheduled = true;
                }
                if (this._weightReadBuffer && !this._weightCopyScheduled) {
                    commandEncoder.copyTextureToBuffer(
                        { texture: this.weightTexture!, origin: [acx, acy, 0] },
                        { buffer: this._weightReadBuffer, bytesPerRow: 256 },
                        { width:1, height:1, depthOrArrayLayers:1 }
                    );
                    this._weightCopyScheduled = true;
                }
            }

            // Normalize weighted thickness into thicknessTexture (will be blurred)
            const computePass = commandEncoder.beginComputePass();
            computePass.setPipeline(this.normalizePipeline);
            computePass.setBindGroup(0, this.normalizeBindGroup);
            const wgX = Math.ceil(this.width / 8);
            const wgY = Math.ceil(this.height / 8);
            if (this._frame % 240 === 0) {
                console.log(`[FluidRenderer] normalizeThickness dispatch wg=(${wgX},${wgY}) for (${this.width}x${this.height})`);
            }
            computePass.dispatchWorkgroups(wgX, wgY, 1);
            computePass.end();

            // Read back normalized (pre-blur) thickness center (copy only on phase 0)
            if (phase === 0 && this.thicknessTexture && !this._normCopyScheduled) {
                const targetBuf = (!this._lastNormWriteToggle ? this._normReadBuffer : this._normReadBuffer2);
                const pending = (!this._lastNormWriteToggle ? this._normMapPending : this._normMapPending2);
                if (targetBuf && !pending) {
                    commandEncoder.copyTextureToBuffer(
                        { texture: this.thicknessTexture, origin: [acx, acy, 0] },
                        { buffer: targetBuf, bytesPerRow: 256 },
                        { width:1, height:1, depthOrArrayLayers:1 }
                    );
                    this._lastNormWriteToggle = !this._lastNormWriteToggle;
                    this._normCopyScheduled = true;
                }
            }
            for (var iter = 0; iter < this._blurIterations; iter++) {
                const thicknessFilterPassEncoderX = commandEncoder.beginRenderPass(thicknessFilterPassDescriptors[0]!);
                thicknessFilterPassEncoderX.setBindGroup(0, this.thicknessFilterBindGroups[0]!);
                thicknessFilterPassEncoderX.setPipeline(this.thicknessFilterPipeline);
                thicknessFilterPassEncoderX.draw(3);
                thicknessFilterPassEncoderX.end();
                const thicknessFilterPassEncoderY = commandEncoder.beginRenderPass(thicknessFilterPassDescriptors[1]!);
                thicknessFilterPassEncoderY.setBindGroup(0, this.thicknessFilterBindGroups[1]!);
                thicknessFilterPassEncoderY.setPipeline(this.thicknessFilterPipeline);
                thicknessFilterPassEncoderY.draw(3);
                thicknessFilterPassEncoderY.end();
            }

            // Blur weight similarly (reuse bind groups but need ones pointing at weight textures) – quick inline variant
            // Recreate lightweight bind groups each frame (could cache) for simplicity
            const weightFilterX = this.device.createBindGroup({
                layout: this.thicknessFilterPipeline.getBindGroupLayout(0),
                entries: [ { binding:1, resource: this.weightTextureView }, { binding:2, resource: { buffer: this._filterXUniformBuffer } } ]
            });
            const weightFilterY = this.device.createBindGroup({
                layout: this.thicknessFilterPipeline.getBindGroupLayout(0),
                entries: [ { binding:1, resource: this.tmpWeightBlurTextureView }, { binding:2, resource: { buffer: this._filterYUniformBuffer } } ]
            });
            // Pass X
            for (var witer = 0; witer < this._blurIterations; witer++) {
                const weightBlurPassX = commandEncoder.beginRenderPass(weightBlurPassDescriptors[0]!);
                weightBlurPassX.setBindGroup(0, weightFilterX);
                weightBlurPassX.setPipeline(this.thicknessFilterPipeline);
                weightBlurPassX.draw(3);
                weightBlurPassX.end();
                const weightBlurPassY = commandEncoder.beginRenderPass(weightBlurPassDescriptors[1]!);
                weightBlurPassY.setBindGroup(0, weightFilterY);
                weightBlurPassY.setPipeline(this.thicknessFilterPipeline);
                weightBlurPassY.draw(3);
                weightBlurPassY.end();
            }

            // Surface normals / coverage pass
            const normalsPass = commandEncoder.beginRenderPass(normalsPassDescriptor);
            normalsPass.setBindGroup(0, this.normalsBindGroup);
            normalsPass.setPipeline(this.normalsPipeline);
            normalsPass.draw(3);
            normalsPass.end();

            // After normals/coverage written, copy center pixel only on phase 0
            const cx = Math.min(this.width-1, Math.floor(this.width/2));
            const cy = Math.min(this.height-1, Math.floor(this.height/2));
            const topY = 0;
            const botY = this.height - 1;
            if (phase === 0 && this._readbackBuffer && !this._surfaceCopyScheduled) {
                commandEncoder.copyTextureToBuffer(
                    { texture: this.surfaceTexture, origin: [cx, cy, 0] },
                    { buffer: this._readbackBuffer!, bytesPerRow: 256 },
                    { width:1, height:1, depthOrArrayLayers:1 }
                );
                this._surfaceCopyScheduled = true;
            }
            if (phase === 0 && this._topReadbackBuffer && !this._topCopyScheduled) {
                commandEncoder.copyTextureToBuffer(
                    { texture: this.surfaceTexture, origin: [cx, topY, 0] },
                    { buffer: this._topReadbackBuffer!, bytesPerRow: 256 },
                    { width:1, height:1, depthOrArrayLayers:1 }
                );
                this._topCopyScheduled = true;
            }
            if (phase === 0 && this._bottomReadbackBuffer && !this._bottomCopyScheduled) {
                commandEncoder.copyTextureToBuffer(
                    { texture: this.surfaceTexture, origin: [cx, botY, 0] },
                    { buffer: this._bottomReadbackBuffer!, bytesPerRow: 256 },
                    { width:1, height:1, depthOrArrayLayers:1 }
                );
                this._bottomCopyScheduled = true;
            }

            // Schedule weighted thickness / weight debug copies if values look stuck at zero for several frames
            if (this._frame % 120 === 0) {
                if (this.weightedThicknessTexture && this._accumReadBuffer && !this._accumCopyScheduled) {
                    commandEncoder.copyTextureToBuffer(
                        { texture: this.weightedThicknessTexture, origin: [cx, cy, 0] },
                        { buffer: this._accumReadBuffer!, bytesPerRow: 256 },
                        { width:1, height:1, depthOrArrayLayers:1 }
                    );
                    this._accumCopyScheduled = true;
                }
                if (this.weightTexture && this._weightReadBuffer && !this._weightCopyScheduled) {
                    commandEncoder.copyTextureToBuffer(
                        { texture: this.weightTexture, origin: [cx, cy, 0] },
                        { buffer: this._weightReadBuffer!, bytesPerRow: 256 },
                        { width:1, height:1, depthOrArrayLayers:1 }
                    );
                    this._weightCopyScheduled = true;
                }
            }

            if (!this._firstFrame) {
                const temporalPass = commandEncoder.beginComputePass();
                temporalPass.setPipeline(this.temporalPipeline);
                temporalPass.setBindGroup(0, this.temporalBindGroup);
                const wgTX = Math.ceil(this.width / 8);
                const wgTY = Math.ceil(this.height / 8);
                if (this._frame % 240 === 0) {
                    console.log(`[FluidRenderer] temporal pass dispatch wg=(${wgTX},${wgTY})`);
                }
                temporalPass.dispatchWorkgroups(wgTX, wgTY, 1);
                temporalPass.end();
                if (this._frame % 60 === 0) {
                    console.log(`[FluidRenderer] Temporal stabilization executed (frame ${this._frame}).`);
                }
            }

            // Height reconstruction (after normals so coverage is available)
            // Recreate height bind group each frame to ensure we read current-frame coverage (pre-temporal)
            this.heightBindGroup = this.device.createBindGroup({
                label: 'height reconstruction bind group',
                layout: this.heightPipeline.getBindGroupLayout(0),
                entries: [
                    { binding: 0, resource: this.depthMapTextureView },
                    { binding: 1, resource: this.surfaceTextureView }, // current-frame surface (pre-temporal) for coverage A
                    { binding: 2, resource: this.heightTextureView },
                ]
            });
            const heightPass = commandEncoder.beginComputePass();
            heightPass.setPipeline(this.heightPipeline);
            heightPass.setBindGroup(0, this.heightBindGroup);
            const hwgX = Math.ceil(this.width / 8);
            const hwgY = Math.ceil(this.height / 8);
            if (this._frame % 240 === 0) {
                console.log(`[FluidRenderer] heightFromDepth dispatch wg=(${hwgX},${hwgY})`);
            }
            heightPass.dispatchWorkgroups(hwgX, hwgY, 1);
            heightPass.end();

            // Diffuse height once per frame (could iterate if needed)
            // Multi-iteration diffusion with ping-pong between heightTexture and heightTextureDiffuse
            let inTexView: GPUTextureView = this.heightTextureView;
            let outTexView: GPUTextureView = this.heightTextureDiffuseView!;
            for (let diter = 0; diter < this._heightDiffuseIterations; diter++) {
                // Recreate bind group each iteration swapping in/out
                const diffBindGroup = this.device.createBindGroup({
                    label: `height diffusion bind group iter ${diter}`,
                    layout: this.heightDiffusePipeline.getBindGroupLayout(0),
                    entries: [
                        { binding: 0, resource: inTexView },
                        { binding: 1, resource: outTexView },
                    ]
                });
                const heightDiffPass = commandEncoder.beginComputePass();
                heightDiffPass.setPipeline(this.heightDiffusePipeline);
                heightDiffPass.setBindGroup(0, diffBindGroup);
                heightDiffPass.dispatchWorkgroups(hwgX, hwgY, 1);
                heightDiffPass.end();
                // Swap for next pass
                const tmp = inTexView; inTexView = outTexView; outTexView = tmp;
            }
            // Always ensure surface bind group samples the final diffused height result.
            // Previous logic only rebuilt when inTexView was NOT the diffused texture, leaving the
            // bind group pointing at the original (pre-diffused) height on odd iteration counts.
            this.fluidSurfaceBindGroup = this._createFluidSurfaceBindGroup({
                heightTexView: inTexView,
                surfaceTexView: this._firstFrame ? this.surfaceTextureView : this.temporalSurfaceTextureView,
            });
            // Generate velocity field from (possibly diffused) height before physical metrics so debug velocity has variation
            if (this.velocityPipeline) {
                const velBG = this.device.createBindGroup({
                    label: 'velocity from height bind group (frame)',
                    layout: this.velocityPipeline.getBindGroupLayout(0),
                    entries: [
                        { binding: 0, resource: inTexView },
                        { binding: 1, resource: this.velocityTextureView },
                    ]
                });
                const velPass = commandEncoder.beginComputePass();
                velPass.setPipeline(this.velocityPipeline);
                velPass.setBindGroup(0, velBG);
                const vgx = Math.ceil(this.width/8), vgy = Math.ceil(this.height/8);
                if (this._frame % 240 === 0) {
                    console.log(`[FluidRenderer] velocityFromHeight dispatch wg=(${vgx},${vgy})`);
                }
                velPass.dispatchWorkgroups(vgx, vgy, 1);
                velPass.end();
            }
            // Physical metrics compute (after diffusion)
            if (this._enablePhysicalMetrics) {
                const physPass = commandEncoder.beginComputePass();
                // Recreate blur bind groups if height ping-pong logic changes (currently heightTextureDiffuseView is final)
                this.heightBlur2BindGroup = this.device.createBindGroup({
                    label: 'height blur2 bind group (frame)',
                    layout: this.heightBlur2Pipeline!.getBindGroupLayout(0),
                    entries: [
                        { binding: 0, resource: inTexView },
                        { binding: 1, resource: this.heightBlur2View! },
                    ]
                });
                this.heightBlur4BindGroup = this.device.createBindGroup({
                    label: 'height blur4 bind group (frame)',
                    layout: this.heightBlur4Pipeline!.getBindGroupLayout(0),
                    entries: [
                        { binding: 0, resource: this.heightBlur2View! },
                        { binding: 1, resource: this.heightBlur4View! },
                    ]
                });
                physPass.setPipeline(this.heightBlur2Pipeline!);
                physPass.setBindGroup(0, this.heightBlur2BindGroup!);
                const pgx = Math.ceil(this.width/8), pgy = Math.ceil(this.height/8);
                if (this._frame % 240 === 0) {
                    console.log(`[FluidRenderer] heightBlur2 dispatch wg=(${pgx},${pgy})`);
                }
                physPass.dispatchWorkgroups(pgx, pgy, 1);
                physPass.setPipeline(this.heightBlur4Pipeline!);
                physPass.setBindGroup(0, this.heightBlur4BindGroup!);
                if (this._frame % 240 === 0) {
                    console.log(`[FluidRenderer] heightBlur4 dispatch wg=(${pgx},${pgy})`);
                }
                physPass.dispatchWorkgroups(pgx, pgy, 1);
                this.physicalBindGroup = this.device.createBindGroup({
                    label: 'height physical metrics bind group (frame)',
                    layout: this.heightPhysicalPipeline.getBindGroupLayout(0),
                    entries: [
                        { binding: 0, resource: inTexView },
                        { binding: 1, resource: this.heightBlur2View! },
                        { binding: 2, resource: this.heightBlur4View! },
                        { binding: 3, resource: { buffer: this.renderUniformBuffer } },
                        { binding: 4, resource: this.physicalTextureView! },
                    ]
                });
                physPass.setPipeline(this.heightPhysicalPipeline);
                physPass.setBindGroup(0, this.physicalBindGroup);
                if (this._frame % 240 === 0) {
                    console.log(`[FluidRenderer] heightPhysical dispatch wg=(${pgx},${pgy})`);
                }
                physPass.dispatchWorkgroups(pgx, pgy, 1);
                physPass.end();
            }

            // Foam temporal accumulation (uses physicalTexture foam candidate + previous accumulation)
            if (this.foamTemporalPipeline) {
                // Build bind group on the fly (previous foam is foamPrevTextureView, output is foamAccumTextureView)
                const foamBindGroup = this.device.createBindGroup({
                    label: 'foam temporal bind group',
                    layout: this.foamTemporalPipeline.getBindGroupLayout(0),
                    entries: [
                        { binding: 0, resource: this.physicalTextureView! },
                        { binding: 1, resource: this.foamPrevTextureView! },
                        { binding: 2, resource: this.foamAccumTextureView! },
                        { binding: 3, resource: { buffer: this.foamParamsBuffer! } },
                    ]
                });
                const foamPass = commandEncoder.beginComputePass();
                foamPass.setPipeline(this.foamTemporalPipeline);
                foamPass.setBindGroup(0, foamBindGroup);
                const fgx = Math.ceil(this.width/8), fgy = Math.ceil(this.height/8);
                if (this._frame % 240 === 0) {
                    console.log(`[FluidRenderer] foamTemporal dispatch wg=(${fgx},${fgy})`);
                }
                foamPass.dispatchWorkgroups(fgx, fgy, 1);
                foamPass.end();
                // Copy new accumulation into prev for next frame (blit via copyTextureToTexture)
                commandEncoder.copyTextureToTexture({ texture: this.foamAccumTexture! }, { texture: this.foamPrevTexture! }, [this.width, this.height, 1]);
            }

            if (this.fluidSurfacePipeline && this.fluidSurfaceBindGroup) {
                const fluidPassEncoder = commandEncoder.beginRenderPass(fluidPassDescriptor);
                // Ensure bind group matches current pipeline version; rebuild if stale
                if ((this.fluidSurfaceBindGroup as any)?._pipelineVersion !== this._fluidSurfacePipelineVersion) {
                    this.fluidSurfaceBindGroup = this._createFluidSurfaceBindGroup({
                        heightTexView: this.heightTextureDiffuseView ?? this.heightTextureView,
                        surfaceTexView: this._firstFrame ? this.surfaceTextureView : this.temporalSurfaceTextureView,
                    });
                }
                fluidPassEncoder.setPipeline(this.fluidSurfacePipeline);
                fluidPassEncoder.setBindGroup(0, this.fluidSurfaceBindGroup);
                fluidPassEncoder.draw(3);
                fluidPassEncoder.end();
            } else {
                // Skip surface draw this frame; will resume once pipeline async creation completes
                if (this._frame < 120 && (this._frame % 30 === 0)) {
                    console.warn('[FluidRenderer] fluidSurfacePipeline not ready; skipping surface render frame', this._frame);
                }
            }

            // Deferred map phase (phase 1) reads buffers copied in phase 0
            if (phase === 1) {
                // Surface
                // Surface readback logs removed for brevity; reinstate if detailed per-frame sampling is needed.
                this._surfaceCopyScheduled = false; this._topCopyScheduled = false; this._bottomCopyScheduled = false;
                // Accum
                if (this._accumCopyScheduled && this._accumReadBuffer && !this._accumMapPending) {
                    this._accumMapPending = true;
                    this._accumReadBuffer.mapAsync(GPUMapMode.READ).then(()=>{
                        const u16 = new Uint16Array(this._accumReadBuffer!.getMappedRange());
                        if (u16.length>0) {
                            const half: number = u16[0] as number;
                            const sign = (half & 0x8000) ? -1 : 1;
                            let exp = (half & 0x7C00) >> 10;
                            let mant = half & 0x03FF;
                            let val: number;
                            if (exp === 0) { val = sign * (mant * (1 / (1 << 24))); }
                            else if (exp === 0x1F) { val = mant ? NaN : sign * Infinity; }
                            else { val = sign * (1 + mant / 1024) * Math.pow(2, exp - 15); }
                            console.log(`[FluidRenderer] Accum center (weightedThickness=${isNaN(val) ? 'NaN' : val.toExponential(3)})`);
                        }
                        this._accumReadBuffer!.unmap();
                        this._accumMapPending = false;
                        this._accumCopyScheduled = false;
                    }).catch(()=>{ this._accumMapPending = false; });
                }
                // Normalized thickness
                const readBufAReady = this._normCopyScheduled && this._normReadBuffer && !this._normMapPending && this._lastNormWriteToggle; // last write to B
                const readBufBReady = this._normCopyScheduled && this._normReadBuffer2 && !this._normMapPending2 && !this._lastNormWriteToggle; // last write to A
                if (readBufAReady) {
                    this._normMapPending = true;
                    this._normReadBuffer!.mapAsync(GPUMapMode.READ).then(()=>{
                        const u16 = new Uint16Array(this._normReadBuffer!.getMappedRange());
                        if (u16.length>0) {
                            const half: number = u16[0] as number;
                            const sign = (half & 0x8000) ? -1 : 1;
                            let exp = (half & 0x7C00) >> 10;
                            let mant = half & 0x03FF;
                            let val: number;
                            if (exp == 0) { val = sign * (mant * (1 / (1 << 24))); }
                            else if (exp == 0x1F) { val = mant ? NaN : sign * Infinity; }
                            else { val = sign * (1 + mant / 1024) * Math.pow(2, exp - 15); }
                            console.log(`[FluidRenderer] Normalized center thickness=${isNaN(val)?'NaN':val.toExponential(3)}`);
                        }
                        this._normReadBuffer!.unmap();
                        this._normMapPending = false;
                        this._normCopyScheduled = false;
                    }).catch(()=>{ this._normMapPending = false; });
                } else if (readBufBReady) {
                    this._normMapPending2 = true;
                    this._normReadBuffer2!.mapAsync(GPUMapMode.READ).then(()=>{
                        const u16 = new Uint16Array(this._normReadBuffer2!.getMappedRange());
                        if (u16.length>0) {
                            const half: number = u16[0] as number;
                            const sign = (half & 0x8000) ? -1 : 1;
                            let exp = (half & 0x7C00) >> 10;
                            let mant = half & 0x03FF;
                            let val: number;
                            if (exp == 0) { val = sign * (mant * (1 / (1 << 24))); }
                            else if (exp == 0x1F) { val = mant ? NaN : sign * Infinity; }
                            else { val = sign * (1 + mant / 1024) * Math.pow(2, exp - 15); }
                            console.log(`[FluidRenderer] Normalized center thickness=${isNaN(val)?'NaN':val.toExponential(3)}`);
                        }
                        this._normReadBuffer2!.unmap();
                        this._normMapPending2 = false;
                        this._normCopyScheduled = false;
                    }).catch(()=>{ this._normMapPending2 = false; });
                }
                // Weight
                if (this._weightCopyScheduled && this._weightReadBuffer && !this._weightMapPending) {
                    this._weightMapPending = true;
                    this._weightReadBuffer.mapAsync(GPUMapMode.READ).then(()=>{
                        const u16w = new Uint16Array(this._weightReadBuffer!.getMappedRange());
                        if (u16w.length>0) {
                            const halfw: number = u16w[0] as number;
                            const signw = (halfw & 0x8000) ? -1 : 1;
                            let expw = (halfw & 0x7C00) >> 10;
                            let mantw = halfw & 0x03FF;
                            let valw: number;
                            if (expw == 0) { valw = signw * (mantw * (1 / (1 << 24))); }
                            else if (expw == 0x1F) { valw = mantw ? NaN : signw * Infinity; }
                            else { valw = signw * (1 + mantw / 1024) * Math.pow(2, expw - 15); }
                            console.log(`[FluidRenderer] Weight center=${isNaN(valw)?'NaN':valw.toExponential(3)}`);
                        }
                        this._weightReadBuffer!.unmap();
                        this._weightMapPending = false;
                        this._weightCopyScheduled = false;
                    }).catch(()=>{ this._weightMapPending = false; });
                }
            }

            // Copy current surface (first frame) or temporal result (subsequent) to prevSurface
            commandEncoder.copyTextureToTexture(
                { texture: this._firstFrame ? this.surfaceTexture : this.temporalSurfaceTexture },
                { texture: this.prevSurfaceTexture },
                { width: this.width, height: this.height, depthOrArrayLayers: 1 }
            );
            if (this._firstFrame) {
                console.log('[FluidRenderer] History initialized from raw surface. Enabling temporal next frame.');
                this._firstFrame = false;
                this.fluidSurfaceBindGroup = this._createFluidSurfaceBindGroup({
                    heightTexView: this.heightTextureDiffuseView ?? this.heightTextureView,
                    surfaceTexView: this.temporalSurfaceTextureView,
                });
                console.log('[FluidRenderer] Switched surface sampling to temporal texture.');
            }
        } else {
            const spherePassEncoder = commandEncoder.beginRenderPass(spherePassDescriptor);
            spherePassEncoder.setBindGroup(0, this.sphereBindGroup);
            spherePassEncoder.setPipeline(this.spherePipeline);
            spherePassEncoder.draw(6, numParticles);
            spherePassEncoder.end();
        }
    }

    updateEnvironment(newCubemapTextureView: GPUTextureView | null) {
        // Create a dummy 1x1 white texture for when no environment is selected
        if (!newCubemapTextureView) {
            const dummyTexture = this.device.createTexture({
                dimension: '2d',
                size: [1, 1, 6],
                format: 'rgba8unorm',
                usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
            });

            // Fill with white
            const whitePixel = new Uint8Array([255, 255, 255, 255]);
            for (let i = 0; i < 6; i++) {
                this.device.queue.writeTexture(
                    { texture: dummyTexture, origin: [0, 0, i] },
                    whitePixel,
                    { bytesPerRow: 4 },
                    [1, 1]
                );
            }

            newCubemapTextureView = dummyTexture.createView({ dimension: 'cube' });
        }        // Recreate fluid bind group with new environment texture
        this.fluidSurfaceBindGroup = this._createFluidSurfaceBindGroup({
            heightTexView: this.heightTextureDiffuseView ?? this.heightTextureView,
            surfaceTexView: this._firstFrame ? this.surfaceTextureView : this.temporalSurfaceTextureView,
            envView: newCubemapTextureView as GPUTextureView,
        });
        console.log('[FluidRenderer] Environment updated; fluid surface bind group rebound.');
    }    /**
     * Set debug visualization mode
     * @param mode - The debug visualization mode
     * @param layer - The debug layer (raw, filtered, differential)
     * @param intensity - The visualization intensity (0.0 - 3.0)
     */
    setDebugMode(mode: number, layer: number = 0, intensity: number = 1.0): void {
        const debugModeValues = new ArrayBuffer(16);
        const modeView = new Uint32Array(debugModeValues, 0, 1);
        const layerView = new Uint32Array(debugModeValues, 4, 1);
        const intensityView = new Float32Array(debugModeValues, 8, 1);

        modeView[0] = mode;
        layerView[0] = layer;
        intensityView[0] = intensity;

        this.device.queue.writeBuffer(this.debugModeBuffer, 0, debugModeValues);
    }

    /**
     * Update individual effect toggles
     * @param effectsToggleBuffer - The ArrayBuffer containing the effect toggle data
     */
    updateEffectsToggles(effectsToggleBuffer: ArrayBuffer): void {
        this.device.queue.writeBuffer(this.effectsToggleBuffer, 0, effectsToggleBuffer);
    }

    /**
     * Get available debug modes
     * @returns Array of debug mode names
     */
    getAvailableDebugModes(): string[] {
        return [
            'Normal Rendering',
            'Depth Map',
            'Thickness Map',
            'Surface Normals',
            'Light Absorption',
            'Flow Velocity',
            'Pressure Field',
            'Surface Curvature',
            'Fresnel Effect',
            'Caustics Pattern',
            'Refraction Vectors',
            'View Angle (N·V)',
            'Layered Fresnel Scalar',
            'Foam Probability',
            'Height Field',
            'Slope Magnitude',
            'Raw Height',
            'Fresnel Hotspots',
            'Curvature Magnitude',
            'Slope/Capillary/Foam',
            'Height Variance',
            'Mirror Difference',
            'Mid Split Mask',
            'Foam Base Seed',    // 26
            'Foam Final Mask',   // 27
            'Spray Emission',    // 28
            'Bubble Mask',       // 29
            'Bubble Components', // 30
            'Crest Raw',         // 31
            'Crest Gradient',    // 32
            'Source Composite',  // 33
            'Phys Slope',        // 34
            'Phys Curvature',    // 35
            'Phys Crest',        // 36
            'Phys Coverage',     // 37
            'Workgroup Grid',    // 38
            'World Normal Y',    // 39
            'View Slope',        // 40
            'Slope Difference'   // 41
        ];
    }

    /**
     * Clear temporal buffers to eliminate ghost artifacts when effects are toggled or resolution changes
     */
    clearTemporalBuffers() {
        this._firstFrame = true;
        console.log('[FluidRenderer] Temporal buffers cleared - ghost artifacts should be eliminated');
    }
}
