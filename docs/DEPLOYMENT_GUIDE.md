# WebGPU Ocean Simulation System: Deployment Guide

## Table of Contents

1. [Build Process](#build-process)
2. [Environment Configuration](#environment-configuration)
3. [Hosting Requirements](#hosting-requirements)
4. [Performance Optimization](#performance-optimization)
5. [CDN and Asset Management](#cdn-and-asset-management)
6. [Browser Compatibility](#browser-compatibility)
7. [Monitoring and Analytics](#monitoring-and-analytics)
8. [Troubleshooting](#troubleshooting)

---

## Build Process

### Production Build

```bash
# Install dependencies
npm install

# Build for production
npm run build

# Generated files will be in dist/
ls dist/
# index.html
# assets/index-[hash].js
# assets/index-[hash].css
# shader files...
```

### Build Configuration

The project uses Vite for building. Key configuration in `vite.config.ts`:

```typescript
import { defineConfig } from 'vite';
import glsl from 'vite-plugin-glsl';

export default defineConfig({
  plugins: [glsl()],
  build: {
    target: 'es2022',
    minify: 'terser',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          webgpu: ['wgpu-matrix'],
          simulators: [
            './mls-mpm/mls-mpm.ts',
            './sph/sph.ts',
            './boids/boids.ts',
            './waves/waves.ts'
          ]
        }
      }
    }
  },
  base: './', // For relative paths in deployment
  server: {
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin'
    }
  }
});
```

### Asset Optimization

```bash
# Compress assets for deployment
npx vite build --mode production

# Optional: Further compress with gzip
find dist -type f \( -name "*.js" -o -name "*.css" -o -name "*.html" \) -exec gzip -k {} \;
```

---

## Environment Configuration

### HTTPS Requirement

WebGPU requires a secure context (HTTPS or localhost). For production deployment:

```nginx
# Nginx configuration
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    # Security headers required for WebGPU
    add_header Cross-Origin-Embedder-Policy require-corp;
    add_header Cross-Origin-Opener-Policy same-origin;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains";

    root /var/www/webgpu-ocean/dist;
    index index.html;

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|wasm)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Don't cache HTML files
    location ~* \.html$ {
        expires -1;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }
}
```

### Environment Variables

Create a `.env.production` file:

```env
VITE_APP_TITLE=WebGPU Ocean Simulation
VITE_DEBUG_MODE=false
VITE_ANALYTICS_ID=your-analytics-id
VITE_ERROR_REPORTING=true
VITE_CDN_BASE_URL=https://cdn.your-domain.com
```

---

## Hosting Requirements

### Static Hosting Options

#### Netlify (Recommended)
```toml
# netlify.toml
[build]
  publish = "dist"
  command = "npm run build"

[[headers]]
  for = "/*"
  [headers.values]
    Cross-Origin-Embedder-Policy = "require-corp"
    Cross-Origin-Opener-Policy = "same-origin"
    X-Frame-Options = "DENY"
    X-Content-Type-Options = "nosniff"

[[headers]]
  for = "/assets/*"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"
```

#### Vercel
```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Cross-Origin-Embedder-Policy",
          "value": "require-corp"
        },
        {
          "key": "Cross-Origin-Opener-Policy",
          "value": "same-origin"
        }
      ]
    }
  ],
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

#### GitHub Pages
```yaml
# .github/workflows/deploy.yml
name: Deploy to GitHub Pages

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
    - uses: actions/checkout@v3

    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        cache: 'npm'

    - name: Install dependencies
      run: npm ci

    - name: Build
      run: npm run build

    - name: Deploy to GitHub Pages
      uses: peaceiris/actions-gh-pages@v3
      with:
        github_token: ${{ secrets.GITHUB_TOKEN }}
        publish_dir: ./dist
```

### Server Requirements

- **HTTPS**: Required for WebGPU
- **Security Headers**: COOP and COEP headers mandatory
- **Modern Browser Support**: Chrome 113+, Edge 113+, Firefox with WebGPU enabled
- **Memory**: At least 1GB RAM recommended for optimal performance
- **Bandwidth**: Minimal, mostly static assets

---

## Performance Optimization

### Asset Optimization

```typescript
// Dynamic imports for code splitting
const loadSimulator = async (type: SimulationMode) => {
  switch (type) {
    case SimulationMode.MLSMPM:
      return (await import('./mls-mpm/mls-mpm')).MLSMPMSimulator;
    case SimulationMode.SPH:
      return (await import('./sph/sph')).SPHSimulator;
    case SimulationMode.BOIDS:
      return (await import('./boids/boids')).BoidsSimulator;
    default:
      throw new Error(`Unknown simulator type: ${type}`);
  }
};
```

### Shader Precompilation

```typescript
// Precompile critical shaders during app initialization
class ShaderManager {
  private static precompiledShaders = new Map<string, GPUShaderModule>();

  static async precompileShaders(device: GPUDevice) {
    const criticalShaders = [
      'particle-render',
      'fluid-surface',
      'depth-pass'
    ];

    await Promise.all(criticalShaders.map(async name => {
      const source = await import(`./shaders/${name}.wgsl?raw`);
      const module = device.createShaderModule({
        code: source.default,
        label: name
      });

      this.precompiledShaders.set(name, module);
    }));
  }
}
```

### Memory Management

```typescript
// Implement resource pooling for better performance
class BufferPool {
  private pools = new Map<number, GPUBuffer[]>();

  getBuffer(device: GPUDevice, size: number, usage: GPUBufferUsageFlags): GPUBuffer {
    const pool = this.pools.get(size) || [];

    if (pool.length > 0) {
      return pool.pop()!;
    }

    return device.createBuffer({ size, usage });
  }

  returnBuffer(buffer: GPUBuffer, size: number): void {
    const pool = this.pools.get(size) || [];
    pool.push(buffer);
    this.pools.set(size, pool);
  }
}
```

---

## CDN and Asset Management

### Environment Maps

Environment textures are loaded from external CDNs:

```typescript
const ENVIRONMENT_CONFIGS = [
  {
    name: "Industrial Sunset",
    baseUrl: "https://cdn.jsdelivr.net/gh/mrdoob/three.js@r155/examples/textures/cube/Park3Med/",
    files: ["px.jpg", "nx.jpg", "py.jpg", "ny.jpg", "pz.jpg", "nz.jpg"]
  },
  {
    name: "Venice Sunset",
    baseUrl: "https://threejs.org/examples/textures/cube/SwedishRoyalCastle/",
    files: ["px.jpg", "nx.jpg", "py.jpg", "ny.jpg", "pz.jpg", "nz.jpg"]
  }
];

// Implement fallback loading
async function loadEnvironmentWithFallback(config: EnvironmentConfig): Promise<ImageBitmap[]> {
  try {
    return await Promise.all(
      config.files.map(file =>
        fetch(`${config.baseUrl}${file}`)
          .then(response => response.blob())
          .then(createImageBitmap)
      )
    );
  } catch (error) {
    console.warn(`Failed to load environment ${config.name}, using fallback`);
    return await loadDefaultEnvironment();
  }
}
```

### Asset Caching Strategy

```typescript
// Service worker for aggressive caching
const CACHE_NAME = 'webgpu-ocean-v1';
const CRITICAL_ASSETS = [
  '/',
  '/index.html',
  '/assets/index.js',
  '/assets/index.css'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(CRITICAL_ASSETS))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});
```

---

## Browser Compatibility

### WebGPU Feature Detection

```typescript
// Progressive enhancement for WebGPU support
class CompatibilityChecker {
  static async checkWebGPUSupport(): Promise<boolean> {
    if (!navigator.gpu) {
      return false;
    }

    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) return false;

      const device = await adapter.requestDevice();
      return !!device;
    } catch {
      return false;
    }
  }

  static showFallbackMessage(): void {
    const fallbackHtml = `
      <div class="webgpu-fallback">
        <h2>WebGPU Not Supported</h2>
        <p>This simulation requires WebGPU support. Please:</p>
        <ul>
          <li>Use Chrome 113+ or Edge 113+</li>
          <li>Enable WebGPU in Firefox Nightly</li>
          <li>Ensure you're on HTTPS</li>
        </ul>
      </div>
    `;

    document.body.innerHTML = fallbackHtml;
  }
}
```

### Graceful Degradation

```typescript
// Fallback for unsupported features
class FeatureDetection {
  static async getOptimalSettings(device: GPUDevice): Promise<SimulationSettings> {
    const adapter = device.adapter;
    const limits = device.limits;

    // Adjust settings based on hardware capabilities
    const maxParticles = Math.min(
      500000,
      Math.floor(limits.maxStorageBufferBindingSize / 64)
    );

    const supportsTimestamps = device.features.has('timestamp-query');
    const maxWorkgroupSize = limits.maxComputeWorkgroupSizeX;

    return {
      maxParticles,
      enableProfiling: supportsTimestamps,
      workgroupSize: Math.min(256, maxWorkgroupSize),
      enableAdvancedFeatures: this.checkAdvancedFeatures(device)
    };
  }
}
```

---

## Monitoring and Analytics

### Performance Monitoring

```typescript
class TelemetryService {
  private static metrics: PerformanceMetrics = {
    frameTime: 0,
    gpuTime: 0,
    particleCount: 0,
    memoryUsage: 0
  };

  static recordFrame(frameTime: number, gpuTime: number): void {
    this.metrics.frameTime = frameTime;
    this.metrics.gpuTime = gpuTime;

    // Send to analytics service
    if (Math.random() < 0.01) { // Sample 1% of frames
      this.sendMetrics();
    }
  }

  private static sendMetrics(): void {
    if (typeof gtag !== 'undefined') {
      gtag('event', 'performance_sample', {
        custom_map: {
          frame_time: this.metrics.frameTime,
          gpu_time: this.metrics.gpuTime,
          particle_count: this.metrics.particleCount
        }
      });
    }
  }
}
```

### Error Tracking

```typescript
// Production error handling
class ErrorReporter {
  static initialize(): void {
    window.addEventListener('error', this.handleError);
    window.addEventListener('unhandledrejection', this.handleRejection);
  }

  private static handleError(event: ErrorEvent): void {
    const errorData = {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      stack: event.error?.stack,
      userAgent: navigator.userAgent,
      webgpuSupported: !!navigator.gpu
    };

    // Send to error tracking service
    this.sendError(errorData);
  }

  private static sendError(error: any): void {
    // Example: Send to Sentry, LogRocket, etc.
    fetch('/api/errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(error)
    }).catch(() => {
      // Fail silently if error reporting fails
    });
  }
}
```

---

## Troubleshooting

### Common Deployment Issues

#### COOP/COEP Headers Missing
```bash
# Test headers
curl -I https://your-domain.com

# Should include:
# Cross-Origin-Embedder-Policy: require-corp
# Cross-Origin-Opener-Policy: same-origin
```

#### Asset Loading Failures
```typescript
// Debug asset loading
const DEBUG_ASSET_LOADING = import.meta.env.DEV;

async function loadAssetWithDebug(url: string): Promise<Response> {
  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    if (DEBUG_ASSET_LOADING) {
      console.log(`✓ Loaded: ${url}`);
    }

    return response;
  } catch (error) {
    console.error(`✗ Failed to load: ${url}`, error);
    throw error;
  }
}
```

#### WebGPU Device Creation Fails
```typescript
// Detailed WebGPU debugging
async function createDeviceWithDiagnostics(): Promise<GPUDevice> {
  console.log('WebGPU Support Check:');
  console.log('- navigator.gpu:', !!navigator.gpu);

  if (!navigator.gpu) {
    throw new Error('WebGPU not available');
  }

  const adapter = await navigator.gpu.requestAdapter();
  console.log('- Adapter available:', !!adapter);

  if (!adapter) {
    throw new Error('No WebGPU adapter found');
  }

  console.log('- Adapter info:', adapter.info);
  console.log('- Adapter features:', [...adapter.features]);
  console.log('- Adapter limits:', adapter.limits);

  const device = await adapter.requestDevice({
    requiredLimits: {
      maxStorageTexturesPerShaderStage: 8
    }
  });

  console.log('✓ WebGPU device created successfully');
  return device;
}
```

### Health Check Endpoint

```typescript
// Add a health check for monitoring
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version,
    webgpu: {
      required: true,
      browsers: ['Chrome 113+', 'Edge 113+', 'Firefox Nightly']
    }
  });
});
```

### Deployment Checklist

- [ ] **Build succeeds** without errors or warnings
- [ ] **HTTPS enabled** on target domain
- [ ] **Security headers** (COOP/COEP) configured correctly
- [ ] **Asset compression** enabled (gzip/brotli)
- [ ] **Cache headers** set appropriately
- [ ] **Error tracking** configured and tested
- [ ] **Performance monitoring** enabled
- [ ] **Browser compatibility** tested across target browsers
- [ ] **Fallback messaging** for unsupported browsers
- [ ] **CDN assets** loading correctly
- [ ] **Service worker** (if used) updating properly

---

The WebGPU Ocean Simulation System is designed for modern browsers and requires careful attention to security headers and HTTPS deployment. Following this guide ensures optimal performance and reliability in production environments.
