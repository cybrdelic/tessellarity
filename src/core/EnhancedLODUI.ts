/**
 * Enhanced LOD UI Integration
 * Adds comprehensive controls for the advanced LOD system
 */

// Enhanced LOD Control Panel Template
export const ENHANCED_LOD_UI_TEMPLATE = `
<!-- Enhanced LOD Control Panel -->
<div id="enhanced-lod-panel" class="control-panel-section" style="margin-bottom: var(--space-lg);">
  <label class="control-panel-label">
    <i class="fas fa-layer-group" style="margin-right: 0.5rem;"></i>
    Enhanced Level of Detail (LOD)
  </label>
  <div class="control-description">
    Advanced quality and performance optimization with focus-based high resolution rendering
  </div>

  <!-- Master Enable/Disable -->
  <div class="checkbox-container" id="enhanced-lod-enable-toggle">
    <input type="checkbox" id="enable-enhanced-lod" checked>
    <div>
      <div class="radio-option-label">Enable Enhanced LOD System</div>
      <div class="radio-option-description">Advanced multi-tier quality optimization</div>
    </div>
  </div>

  <!-- Enhanced LOD Status Display -->
  <div id="enhanced-lod-status" class="lod-status-enhanced"
       style="margin: var(--space-md) 0; padding: var(--space-md);
              background: linear-gradient(135deg, rgba(0, 122, 255, 0.12), rgba(0, 200, 150, 0.08));
              border: 1px solid rgba(0, 122, 255, 0.4); border-radius: 4px;">

    <!-- Main Status Grid -->
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-md); margin-bottom: var(--space-md);">
      <div>
        <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.25rem;">Active Particles</div>
        <div id="enhanced-lod-active-particles" style="color: var(--text-primary); font-weight: 700; font-size: 1.1rem;">100,000</div>
      </div>
      <div>
        <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.25rem;">Quality Level</div>
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <div id="enhanced-lod-quality-badge" class="quality-badge" style="padding: 0.2rem 0.6rem; border-radius: 12px; font-size: 0.7rem; font-weight: 600;">ULTRA</div>
          <div id="enhanced-lod-quality-percent" style="color: var(--text-primary); font-weight: 600;">100%</div>
        </div>
      </div>
      <div>
        <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.25rem;">Focus Distance</div>
        <div id="enhanced-lod-focus-distance" style="color: var(--text-primary); font-weight: 600;">25.0</div>
      </div>
      <div>
        <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 0.25rem;">Frame Rate</div>
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <div id="enhanced-lod-fps" style="color: var(--text-primary); font-weight: 600;">60</div>
          <div id="enhanced-lod-fps-status" class="fps-indicator" style="font-size: 0.7rem;">●</div>
        </div>
      </div>
    </div>

    <!-- Advanced Status Info -->
    <div style="border-top: 1px solid rgba(255, 255, 255, 0.1); padding-top: var(--space-sm);
                display: grid; grid-template-columns: 1fr 1fr 1fr; gap: var(--space-sm); font-size: 0.7rem;">
      <div>
        <span style="color: var(--text-muted);">Shader:</span>
        <div id="enhanced-lod-shader-mode" style="color: var(--text-primary); font-weight: 600;">Full</div>
      </div>
      <div>
        <span style="color: var(--text-muted);">Lighting:</span>
        <div id="enhanced-lod-lighting-mode" style="color: var(--text-primary); font-weight: 600;">3 Lights</div>
      </div>
      <div>
        <span style="color: var(--text-muted);">Physics:</span>
        <div id="enhanced-lod-physics-mode" style="color: var(--text-primary); font-weight: 600;">Full</div>
      </div>
    </div>
  </div>

  <!-- Focus Enhancement Controls -->
  <div class="enhanced-lod-section" style="margin-bottom: var(--space-lg);">
    <div class="section-header">
      <h4 style="margin: 0; color: var(--text-primary); font-size: 0.9rem;">
        <i class="fas fa-crosshairs" style="margin-right: 0.5rem;"></i>
        High-Resolution Focus
      </h4>
      <div class="section-description" style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">
        Enhanced quality around points of interest
      </div>
    </div>

    <div class="checkbox-container" style="margin: var(--space-md) 0;">
      <input type="checkbox" id="enable-focus-enhancement" checked>
      <div>
        <div class="radio-option-label">Focus Enhancement</div>
        <div class="radio-option-description">Boost quality around camera focus point</div>
      </div>
    </div>

    <div class="slider-container" style="margin-bottom: var(--space-md);">
      <div class="slider-header">
        <div class="slider-label">
          <span>Focus Radius</span>
          <span class="slider-value" id="focus-radius-value">50</span>
        </div>
        <button class="slider-reset" onclick="resetEnhancedLODParameter('focus-radius', 50)" title="Reset to default">
          <i class="fas fa-undo" style="font-size: 10px;"></i>
        </button>
      </div>
      <input type="range" id="focus-radius" min="20" max="150" value="50" />
      <div style="display: flex; justify-content: space-between; font-size: 0.7rem; color: var(--text-muted); margin-top: 0.25rem;">
        <span>Tight</span>
        <span>Wide</span>
      </div>
    </div>

    <div class="slider-container" style="margin-bottom: var(--space-md);">
      <div class="slider-header">
        <div class="slider-label">
          <span>Focus Quality</span>
          <span class="slider-value" id="focus-quality-value">2.0x</span>
        </div>
        <button class="slider-reset" onclick="resetEnhancedLODParameter('focus-quality', 2.0)" title="Reset to default">
          <i class="fas fa-undo" style="font-size: 10px;"></i>
        </button>
      </div>
      <input type="range" id="focus-quality" min="1.0" max="4.0" step="0.1" value="2.0" />
      <div style="display: flex; justify-content: space-between; font-size: 0.7rem; color: var(--text-muted); margin-top: 0.25rem;">
        <span>1.0x</span>
        <span>4.0x</span>
      </div>
    </div>

    <div class="checkbox-container">
      <input type="checkbox" id="enable-auto-focus" checked>
      <div>
        <div class="radio-option-label">Adaptive Focus</div>
        <div class="radio-option-description">Automatically focus on interesting areas</div>
      </div>
    </div>
  </div>

  <!-- Performance Adaptation Controls -->
  <div class="enhanced-lod-section" style="margin-bottom: var(--space-lg);">
    <div class="section-header">
      <h4 style="margin: 0; color: var(--text-primary); font-size: 0.9rem;">
        <i class="fas fa-tachometer-alt" style="margin-right: 0.5rem;"></i>
        Performance Adaptation
      </h4>
      <div class="section-description" style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">
        Automatic quality adjustment based on frame rate
      </div>
    </div>

    <div class="checkbox-container" style="margin: var(--space-md) 0;">
      <input type="checkbox" id="enable-performance-adaptation" checked>
      <div>
        <div class="radio-option-label">Auto Performance Tuning</div>
        <div class="radio-option-description">Dynamically adjust quality to maintain target FPS</div>
      </div>
    </div>

    <div class="slider-container" style="margin-bottom: var(--space-md);">
      <div class="slider-header">
        <div class="slider-label">
          <span>Target FPS</span>
          <span class="slider-value" id="target-fps-value">60</span>
        </div>
        <button class="slider-reset" onclick="resetEnhancedLODParameter('target-fps', 60)" title="Reset to default">
          <i class="fas fa-undo" style="font-size: 10px;"></i>
        </button>
      </div>
      <input type="range" id="target-fps" min="30" max="120" value="60" />
      <div style="display: flex; justify-content: space-between; font-size: 0.7rem; color: var(--text-muted); margin-top: 0.25rem;">
        <span>30 FPS</span>
        <span>120 FPS</span>
      </div>
    </div>

    <div class="slider-container">
      <div class="slider-header">
        <div class="slider-label">
          <span>Adaptation Speed</span>
          <span class="slider-value" id="adaptation-speed-value">0.05</span>
        </div>
        <button class="slider-reset" onclick="resetEnhancedLODParameter('adaptation-speed', 0.05)" title="Reset to default">
          <i class="fas fa-undo" style="font-size: 10px;"></i>
        </button>
      </div>
      <input type="range" id="adaptation-speed" min="0.01" max="0.2" step="0.01" value="0.05" />
      <div style="display: flex; justify-content: space-between; font-size: 0.7rem; color: var(--text-muted); margin-top: 0.25rem;">
        <span>Slow</span>
        <span>Fast</span>
      </div>
    </div>
  </div>

  <!-- Visual Quality Controls -->
  <div class="enhanced-lod-section" style="margin-bottom: var(--space-lg);">
    <div class="section-header">
      <h4 style="margin: 0; color: var(--text-primary); font-size: 0.9rem;">
        <i class="fas fa-palette" style="margin-right: 0.5rem;"></i>
        Visual Quality LOD
      </h4>
      <div class="section-description" style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">
        Distance-based shader and lighting complexity
      </div>
    </div>

    <div class="checkbox-container" style="margin: var(--space-md) 0;">
      <input type="checkbox" id="enable-shader-lod" checked>
      <div>
        <div class="radio-option-label">Shader Complexity LOD</div>
        <div class="radio-option-description">Reduce shader effects at distance</div>
      </div>
    </div>

    <div class="radio-group" style="margin-bottom: var(--space-md);">
      <div class="radio-group-label">Distant Shader Mode</div>
      <div class="radio-options">
        <div class="radio-option">
          <input type="radio" id="distant-shader-minimal" name="distant-shader-mode" value="minimal">
          <label for="distant-shader-minimal">
            <div class="radio-option-label">Minimal</div>
            <div class="radio-option-description">Basic colors only</div>
          </label>
        </div>
        <div class="radio-option">
          <input type="radio" id="distant-shader-basic" name="distant-shader-mode" value="basic">
          <label for="distant-shader-basic">
            <div class="radio-option-label">Basic</div>
            <div class="radio-option-description">Essential effects</div>
          </label>
        </div>
        <div class="radio-option">
          <input type="radio" id="distant-shader-simplified" name="distant-shader-mode" value="simplified" checked>
          <label for="distant-shader-simplified">
            <div class="radio-option-label">Simplified</div>
            <div class="radio-option-description">Reduced complexity</div>
          </label>
        </div>
      </div>
    </div>

    <div class="checkbox-container" style="margin: var(--space-md) 0;">
      <input type="checkbox" id="enable-lighting-lod" checked>
      <div>
        <div class="radio-option-label">Lighting Quality LOD</div>
        <div class="radio-option-description">Reduce lighting complexity at distance</div>
      </div>
    </div>

    <div class="slider-container">
      <div class="slider-header">
        <div class="slider-label">
          <span>Quality Transition Distance</span>
          <span class="slider-value" id="quality-transition-distance-value">120</span>
        </div>
        <button class="slider-reset" onclick="resetEnhancedLODParameter('quality-transition-distance', 120)" title="Reset to default">
          <i class="fas fa-undo" style="font-size: 10px;"></i>
        </button>
      </div>
      <input type="range" id="quality-transition-distance" min="50" max="300" value="120" />
      <div style="display: flex; justify-content: space-between; font-size: 0.7rem; color: var(--text-muted); margin-top: 0.25rem;">
        <span>Near</span>
        <span>Far</span>
      </div>
    </div>
  </div>

  <!-- Advanced Settings (Collapsible) -->
  <div class="enhanced-lod-section">
    <div class="section-header clickable" id="enhanced-lod-advanced-toggle" style="cursor: pointer;">
      <div style="display: flex; align-items: center; justify-content: space-between;">
        <h4 style="margin: 0; color: var(--text-primary); font-size: 0.9rem;">
          <i class="fas fa-cogs" style="margin-right: 0.5rem;"></i>
          Advanced LOD Settings
        </h4>
        <i class="fas fa-chevron-down" style="transition: transform 0.3s ease;"></i>
      </div>
    </div>

    <div id="enhanced-lod-advanced-content" style="display: none; margin-top: var(--space-md);">

      <!-- Geometric LOD -->
      <div class="sub-section" style="margin-bottom: var(--space-md);">
        <div class="checkbox-container" style="margin-bottom: var(--space-sm);">
          <input type="checkbox" id="enable-geometric-lod" checked>
          <div>
            <div class="radio-option-label">Geometric Detail LOD</div>
            <div class="radio-option-description">Reduce mesh complexity at distance</div>
          </div>
        </div>
      </div>

      <!-- Physics LOD -->
      <div class="sub-section" style="margin-bottom: var(--space-md);">
        <div class="checkbox-container" style="margin-bottom: var(--space-sm);">
          <input type="checkbox" id="enable-physics-lod" checked>
          <div>
            <div class="radio-option-label">Physics Simulation LOD</div>
            <div class="radio-option-description">Simplify physics at distance</div>
          </div>
        </div>
      </div>

      <!-- Resolution LOD -->
      <div class="sub-section" style="margin-bottom: var(--space-md);">
        <div class="checkbox-container" style="margin-bottom: var(--space-sm);">
          <input type="checkbox" id="enable-resolution-lod" checked>
          <div>
            <div class="radio-option-label">Resolution Scaling LOD</div>
            <div class="radio-option-description">Render distant areas at lower resolution</div>
          </div>
        </div>

        <div class="slider-container">
          <div class="slider-header">
            <div class="slider-label">
              <span>Distant Render Scale</span>
              <span class="slider-value" id="distant-render-scale-value">70%</span>
            </div>
            <button class="slider-reset" onclick="resetEnhancedLODParameter('distant-render-scale', 0.7)" title="Reset to default">
              <i class="fas fa-undo" style="font-size: 10px;"></i>
            </button>
          </div>
          <input type="range" id="distant-render-scale" min="0.3" max="1.0" step="0.05" value="0.7" />
          <div style="display: flex; justify-content: space-between; font-size: 0.7rem; color: var(--text-muted); margin-top: 0.25rem;">
            <span>30%</span>
            <span>100%</span>
          </div>
        </div>
      </div>

      <!-- Temporal LOD -->
      <div class="sub-section">
        <div class="checkbox-container" style="margin-bottom: var(--space-sm);">
          <input type="checkbox" id="enable-temporal-lod" checked>
          <div>
            <div class="radio-option-label">Temporal Update LOD</div>
            <div class="radio-option-description">Reduce update frequency for distant objects</div>
          </div>
        </div>

        <div class="slider-container">
          <div class="slider-header">
            <div class="slider-label">
              <span>Min Update Rate</span>
              <span class="slider-value" id="min-update-rate-value">15 fps</span>
            </div>
            <button class="slider-reset" onclick="resetEnhancedLODParameter('min-update-rate', 15)" title="Reset to default">
              <i class="fas fa-undo" style="font-size: 10px;"></i>
            </button>
          </div>
          <input type="range" id="min-update-rate" min="5" max="60" value="15" />
          <div style="display: flex; justify-content: space-between; font-size: 0.7rem; color: var(--text-muted); margin-top: 0.25rem;">
            <span>5 fps</span>
            <span>60 fps</span>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Quality Presets -->
  <div class="enhanced-lod-section" style="margin-top: var(--space-lg);">
    <div class="section-header">
      <h4 style="margin: 0; color: var(--text-primary); font-size: 0.9rem;">
        <i class="fas fa-star" style="margin-right: 0.5rem;"></i>
        Enhanced Quality Presets
      </h4>
    </div>

    <div class="preset-buttons" style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-sm); margin-top: var(--space-md);">
      <button id="enhanced-lod-preset-performance" class="lod-preset-button enhanced" data-preset="performance">
        <div class="preset-name">Performance</div>
        <div class="preset-description">Maximum FPS</div>
      </button>
      <button id="enhanced-lod-preset-balanced" class="lod-preset-button enhanced primary" data-preset="balanced">
        <div class="preset-name">Balanced</div>
        <div class="preset-description">Quality + Speed</div>
      </button>
      <button id="enhanced-lod-preset-quality" class="lod-preset-button enhanced" data-preset="quality">
        <div class="preset-name">Quality</div>
        <div class="preset-description">Best Visuals</div>
      </button>
      <button id="enhanced-lod-preset-ultra" class="lod-preset-button enhanced" data-preset="ultra">
        <div class="preset-name">Ultra</div>
        <div class="preset-description">Maximum Quality</div>
      </button>
    </div>
  </div>
</div>
`;

// Enhanced LOD UI CSS Styles
export const ENHANCED_LOD_UI_STYLES = `
<style>
/* Enhanced LOD Panel Styles */
.lod-status-enhanced {
  transition: all 0.3s ease;
  backdrop-filter: blur(8px);
}

.lod-status-enhanced:hover {
  background: linear-gradient(135deg, rgba(0, 122, 255, 0.18), rgba(0, 200, 150, 0.12));
  border-color: rgba(0, 122, 255, 0.6);
  transform: translateY(-1px);
}

.enhanced-lod-section {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 4px;
  padding: var(--space-md);
}

.section-header {
  margin-bottom: var(--space-md);
}

.section-header.clickable:hover {
  color: var(--accent-primary);
}

.section-description {
  opacity: 0.8;
}

.quality-badge {
  background: var(--accent-success);
  color: white;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  animation: qualityPulse 2s ease-in-out infinite;
}

@keyframes qualityPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.8; }
}

.quality-badge.ultra { background: linear-gradient(45deg, #ff6b35, #f7931e); }
.quality-badge.high { background: linear-gradient(45deg, #4caf50, #8bc34a); }
.quality-badge.medium { background: linear-gradient(45deg, #ff9800, #ffc107); }
.quality-badge.low { background: linear-gradient(45deg, #f44336, #ff5722); }

.fps-indicator {
  transition: color 0.3s ease;
}

.fps-indicator.excellent { color: var(--accent-success); }
.fps-indicator.good { color: var(--accent-warning); }
.fps-indicator.poor { color: var(--accent-danger); }

.lod-preset-button.enhanced {
  position: relative;
  overflow: hidden;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.02));
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: var(--text-primary);
  padding: var(--space-md);
  border-radius: 4px;
  transition: all 0.3s ease;
  text-align: center;
}

.lod-preset-button.enhanced:hover {
  background: linear-gradient(135deg, rgba(0, 122, 255, 0.15), rgba(0, 122, 255, 0.05));
  border-color: rgba(0, 122, 255, 0.4);
  transform: translateY(-2px);
}

.lod-preset-button.enhanced.primary {
  background: linear-gradient(135deg, rgba(0, 122, 255, 0.2), rgba(0, 122, 255, 0.1));
  border-color: rgba(0, 122, 255, 0.5);
}

.preset-name {
  font-weight: 600;
  font-size: 0.9rem;
  margin-bottom: 0.25rem;
}

.preset-description {
  font-size: 0.7rem;
  opacity: 0.8;
}

.sub-section {
  padding-left: var(--space-md);
  border-left: 2px solid rgba(255, 255, 255, 0.1);
}

/* Animation for expanding/collapsing sections */
.enhanced-lod-section .section-header.clickable i {
  transition: transform 0.3s ease;
}

.enhanced-lod-section .section-header.expanded i {
  transform: rotate(180deg);
}

/* Real-time update animations */
.lod-updating {
  animation: lodUpdatePulse 0.8s ease-in-out;
}

@keyframes lodUpdatePulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.8; transform: scale(1.02); }
}

/* Focus visualization helper */
.focus-zone-indicator {
  position: absolute;
  border: 2px solid rgba(0, 255, 150, 0.6);
  border-radius: 50%;
  pointer-events: none;
  animation: focusZonePulse 3s ease-in-out infinite;
}

@keyframes focusZonePulse {
  0%, 100% { opacity: 0.6; transform: scale(1); }
  50% { opacity: 0.3; transform: scale(1.1); }
}

/* Performance status indicators */
.performance-critical {
  animation: performanceAlert 1s ease-in-out infinite;
}

@keyframes performanceAlert {
  0%, 100% { color: var(--accent-danger); }
  50% { color: var(--accent-warning); }
}

/* Responsive design for mobile */
@media (max-width: 768px) {
  .enhanced-lod-status {
    grid-template-columns: 1fr;
  }

  .preset-buttons {
    grid-template-columns: 1fr;
  }
}
</style>
`;

// Enhanced LOD UI JavaScript Integration
export const ENHANCED_LOD_UI_SCRIPT = `
// Enhanced LOD UI Control System
class EnhancedLODUI {
  constructor() {
    this.updateInterval = null;
    this.isInitialized = false;
    this.currentPreset = 'balanced';

    // Enhanced presets with all new features
    this.enhancedPresets = {
      performance: {
        name: 'Performance',
        enabled: true,
        enableFocusEnhancement: false,
        enablePerformanceAdaptation: true,
        enableShaderLOD: true,
        enableLightingLOD: true,
        enableGeometricLOD: true,
        enablePhysicsLOD: true,
        enableResolutionLOD: true,
        enableTemporalLOD: true,
        focusRadius: 30,
        focusQualityMultiplier: 1.5,
        targetFrameRate: 60,
        qualityAdjustmentRate: 0.1,
        distantShaderMode: 'minimal',
        distantLightingMode: 'single',
        distantRenderScale: 0.5,
        minUpdateRate: 10
      },
      balanced: {
        name: 'Balanced',
        enabled: true,
        enableFocusEnhancement: true,
        enablePerformanceAdaptation: true,
        enableShaderLOD: true,
        enableLightingLOD: true,
        enableGeometricLOD: true,
        enablePhysicsLOD: true,
        enableResolutionLOD: true,
        enableTemporalLOD: true,
        focusRadius: 50,
        focusQualityMultiplier: 2.0,
        targetFrameRate: 60,
        qualityAdjustmentRate: 0.05,
        distantShaderMode: 'simplified',
        distantLightingMode: 'dual',
        distantRenderScale: 0.7,
        minUpdateRate: 15
      },
      quality: {
        name: 'Quality',
        enabled: true,
        enableFocusEnhancement: true,
        enablePerformanceAdaptation: false,
        enableShaderLOD: true,
        enableLightingLOD: false,
        enableGeometricLOD: true,
        enablePhysicsLOD: false,
        enableResolutionLOD: false,
        enableTemporalLOD: false,
        focusRadius: 80,
        focusQualityMultiplier: 2.5,
        targetFrameRate: 45,
        qualityAdjustmentRate: 0.02,
        distantShaderMode: 'simplified',
        distantLightingMode: 'full',
        distantRenderScale: 0.9,
        minUpdateRate: 30
      },
      ultra: {
        name: 'Ultra',
        enabled: true,
        enableFocusEnhancement: true,
        enablePerformanceAdaptation: false,
        enableShaderLOD: false,
        enableLightingLOD: false,
        enableGeometricLOD: false,
        enablePhysicsLOD: false,
        enableResolutionLOD: false,
        enableTemporalLOD: false,
        focusRadius: 100,
        focusQualityMultiplier: 3.0,
        targetFrameRate: 30,
        qualityAdjustmentRate: 0.01,
        distantShaderMode: 'simplified',
        distantLightingMode: 'full',
        distantRenderScale: 1.0,
        minUpdateRate: 60
      }
    };
  }

  initialize() {
    if (this.isInitialized) return;

    console.log('Initializing Enhanced LOD UI...');

    // Initialize all control event listeners
    this.initializeEventListeners();

    // Apply default preset
    this.applyEnhancedPreset('balanced');

    // Start status updates
    this.startStatusUpdates();

    this.isInitialized = true;
    console.log('Enhanced LOD UI initialized successfully');
  }

  initializeEventListeners() {
    // Master enable/disable
    const masterToggle = document.getElementById('enable-enhanced-lod');
    if (masterToggle) {
      masterToggle.addEventListener('change', (e) => {
        this.setEnhancedLODEnabled(e.target.checked);
      });
    }

    // Focus enhancement controls
    const focusToggle = document.getElementById('enable-focus-enhancement');
    if (focusToggle) {
      focusToggle.addEventListener('change', (e) => {
        this.updateEnhancedLODConfig({ enableFocusEnhancement: e.target.checked });
      });
    }

    // Focus radius slider
    const focusRadiusSlider = document.getElementById('focus-radius');
    if (focusRadiusSlider) {
      focusRadiusSlider.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        document.getElementById('focus-radius-value').textContent = value;
        this.updateEnhancedLODConfig({ focusRadius: value });
      });
    }

    // Focus quality slider
    const focusQualitySlider = document.getElementById('focus-quality');
    if (focusQualitySlider) {
      focusQualitySlider.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        document.getElementById('focus-quality-value').textContent = value + 'x';
        this.updateEnhancedLODConfig({ focusQualityMultiplier: value });
      });
    }

    // Auto focus toggle
    const autoFocusToggle = document.getElementById('enable-auto-focus');
    if (autoFocusToggle) {
      autoFocusToggle.addEventListener('change', (e) => {
        this.updateEnhancedLODConfig({ adaptiveFocusPoint: e.target.checked });
      });
    }

    // Performance adaptation controls
    const perfAdaptToggle = document.getElementById('enable-performance-adaptation');
    if (perfAdaptToggle) {
      perfAdaptToggle.addEventListener('change', (e) => {
        this.updateEnhancedLODConfig({ enablePerformanceAdaptation: e.target.checked });
      });
    }

    // Target FPS slider
    const targetFPSSlider = document.getElementById('target-fps');
    if (targetFPSSlider) {
      targetFPSSlider.addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        document.getElementById('target-fps-value').textContent = value;
        this.updateEnhancedLODConfig({ targetFrameRate: value });
      });
    }

    // Adaptation speed slider
    const adaptSpeedSlider = document.getElementById('adaptation-speed');
    if (adaptSpeedSlider) {
      adaptSpeedSlider.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        document.getElementById('adaptation-speed-value').textContent = value;
        this.updateEnhancedLODConfig({ qualityAdjustmentRate: value });
      });
    }

    // Shader LOD controls
    const shaderLODToggle = document.getElementById('enable-shader-lod');
    if (shaderLODToggle) {
      shaderLODToggle.addEventListener('change', (e) => {
        this.updateEnhancedLODConfig({ enableShaderLOD: e.target.checked });
      });
    }

    // Distant shader mode radio buttons
    const shaderModeRadios = document.querySelectorAll('input[name="distant-shader-mode"]');
    shaderModeRadios.forEach(radio => {
      radio.addEventListener('change', (e) => {
        if (e.target.checked) {
          this.updateEnhancedLODConfig({ distantShaderMode: e.target.value });
        }
      });
    });

    // Other feature toggles
    const featureToggles = [
      { id: 'enable-lighting-lod', config: 'enableLightingLOD' },
      { id: 'enable-geometric-lod', config: 'enableGeometricLOD' },
      { id: 'enable-physics-lod', config: 'enablePhysicsLOD' },
      { id: 'enable-resolution-lod', config: 'enableResolutionLOD' },
      { id: 'enable-temporal-lod', config: 'enableTemporalLOD' }
    ];

    featureToggles.forEach(({ id, config }) => {
      const toggle = document.getElementById(id);
      if (toggle) {
        toggle.addEventListener('change', (e) => {
          this.updateEnhancedLODConfig({ [config]: e.target.checked });
        });
      }
    });

    // Advanced sliders
    const advancedSliders = [
      { id: 'quality-transition-distance', config: 'shaderTransitionDistance', suffix: '' },
      { id: 'distant-render-scale', config: 'distantRenderScale', suffix: '%', multiplier: 100 },
      { id: 'min-update-rate', config: 'minUpdateRate', suffix: ' fps' }
    ];

    advancedSliders.forEach(({ id, config, suffix, multiplier = 1 }) => {
      const slider = document.getElementById(id);
      const valueDisplay = document.getElementById(id + '-value');

      if (slider && valueDisplay) {
        slider.addEventListener('input', (e) => {
          const value = parseFloat(e.target.value);
          const displayValue = multiplier !== 1 ? (value * multiplier) + suffix : value + suffix;
          valueDisplay.textContent = displayValue;
          this.updateEnhancedLODConfig({ [config]: value });
        });
      }
    });

    // Advanced settings toggle
    const advancedToggle = document.getElementById('enhanced-lod-advanced-toggle');
    const advancedContent = document.getElementById('enhanced-lod-advanced-content');
    if (advancedToggle && advancedContent) {
      advancedToggle.addEventListener('click', () => {
        const isExpanded = advancedContent.style.display !== 'none';
        advancedContent.style.display = isExpanded ? 'none' : 'block';
        advancedToggle.classList.toggle('expanded', !isExpanded);
      });
    }

    // Preset buttons
    const presetButtons = ['performance', 'balanced', 'quality', 'ultra'];
    presetButtons.forEach(preset => {
      const button = document.getElementById(\`enhanced-lod-preset-\${preset}\`);
      if (button) {
        button.addEventListener('click', () => {
          this.applyEnhancedPreset(preset);
          this.updatePresetButtons(preset);
        });
      }
    });
  }

  updateEnhancedLODConfig(config) {
    console.log('Updating Enhanced LOD config:', config);

    // Call the enhanced LOD system update function
    if (window.setEnhancedLODConfig) {
      window.setEnhancedLODConfig(config);
    } else {
      console.warn('Enhanced LOD system not available yet');
    }

    // Switch to custom preset if user is manually adjusting
    if (this.currentPreset !== 'custom') {
      this.currentPreset = 'custom';
      this.updatePresetButtons('custom');
    }
  }

  setEnhancedLODEnabled(enabled) {
    console.log('Enhanced LOD enabled:', enabled);

    if (window.setEnhancedLODEnabled) {
      window.setEnhancedLODEnabled(enabled);
    } else {
      console.warn('Enhanced LOD system not available yet');
    }
  }

  applyEnhancedPreset(presetName) {
    const preset = this.enhancedPresets[presetName];
    if (!preset) {
      console.error('Enhanced LOD preset not found:', presetName);
      return;
    }

    console.log(\`Applying Enhanced LOD preset: \${preset.name}\`);

    // Update UI controls to match preset
    this.updateUIFromPreset(preset);

    // Apply to enhanced LOD system
    if (window.setEnhancedLODConfig) {
      window.setEnhancedLODConfig(preset);
    }

    this.currentPreset = presetName;
    this.showPresetFeedback(preset.name);
  }

  updateUIFromPreset(preset) {
    // Update checkboxes
    const checkboxes = [
      { id: 'enable-enhanced-lod', value: preset.enabled },
      { id: 'enable-focus-enhancement', value: preset.enableFocusEnhancement },
      { id: 'enable-auto-focus', value: preset.adaptiveFocusPoint !== false },
      { id: 'enable-performance-adaptation', value: preset.enablePerformanceAdaptation },
      { id: 'enable-shader-lod', value: preset.enableShaderLOD },
      { id: 'enable-lighting-lod', value: preset.enableLightingLOD },
      { id: 'enable-geometric-lod', value: preset.enableGeometricLOD },
      { id: 'enable-physics-lod', value: preset.enablePhysicsLOD },
      { id: 'enable-resolution-lod', value: preset.enableResolutionLOD },
      { id: 'enable-temporal-lod', value: preset.enableTemporalLOD }
    ];

    checkboxes.forEach(({ id, value }) => {
      const element = document.getElementById(id);
      if (element) element.checked = value;
    });

    // Update sliders
    const sliders = [
      { id: 'focus-radius', value: preset.focusRadius, suffix: '' },
      { id: 'focus-quality', value: preset.focusQualityMultiplier, suffix: 'x' },
      { id: 'target-fps', value: preset.targetFrameRate, suffix: '' },
      { id: 'adaptation-speed', value: preset.qualityAdjustmentRate, suffix: '' },
      { id: 'distant-render-scale', value: preset.distantRenderScale, suffix: '%', multiplier: 100 },
      { id: 'min-update-rate', value: preset.minUpdateRate, suffix: ' fps' }
    ];

    sliders.forEach(({ id, value, suffix, multiplier = 1 }) => {
      const slider = document.getElementById(id);
      const valueDisplay = document.getElementById(id + '-value');

      if (slider) slider.value = value;
      if (valueDisplay) {
        const displayValue = multiplier !== 1 ? (value * multiplier) + suffix : value + suffix;
        valueDisplay.textContent = displayValue;
      }
    });

    // Update radio buttons
    if (preset.distantShaderMode) {
      const radio = document.getElementById(\`distant-shader-\${preset.distantShaderMode}\`);
      if (radio) radio.checked = true;
    }
  }

  updatePresetButtons(activePreset) {
    const presetButtons = ['performance', 'balanced', 'quality', 'ultra'];
    presetButtons.forEach(preset => {
      const button = document.getElementById(\`enhanced-lod-preset-\${preset}\`);
      if (button) {
        if (preset === activePreset) {
          button.classList.add('primary');
        } else {
          button.classList.remove('primary');
        }
      }
    });
  }

  showPresetFeedback(presetName) {
    // Create and show feedback notification
    const feedback = document.createElement('div');
    feedback.textContent = \`Enhanced LOD preset applied: \${presetName}\`;
    feedback.style.cssText = \`
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: linear-gradient(135deg, rgba(0, 122, 255, 0.95), rgba(0, 200, 150, 0.95));
      color: white;
      padding: 1rem 2rem;
      border-radius: 4px;
      font-weight: 600;
      z-index: 10000;
      backdrop-filter: blur(10px);
      animation: slideInFadeOut 2.5s ease-out forwards;
    \`;

    document.body.appendChild(feedback);
    setTimeout(() => feedback.remove(), 2500);
  }

  startStatusUpdates() {
    if (this.updateInterval) return;

    // Update status every 500ms
    this.updateInterval = setInterval(() => {
      this.updateEnhancedLODStatus();
    }, 500);
  }

  updateEnhancedLODStatus() {
    if (!window.getEnhancedLODInfo) return;

    try {
      const lodInfo = window.getEnhancedLODInfo();
      if (!lodInfo) return;

      // Update active particles
      const activeParticlesEl = document.getElementById('enhanced-lod-active-particles');
      if (activeParticlesEl && lodInfo.activeParticles !== undefined) {
        activeParticlesEl.textContent = lodInfo.activeParticles.toLocaleString();
      }

      // Update quality badge and percentage
      const qualityBadge = document.getElementById('enhanced-lod-quality-badge');
      const qualityPercent = document.getElementById('enhanced-lod-quality-percent');
      if (qualityBadge && qualityPercent && lodInfo.particleRatio !== undefined) {
        const ratio = lodInfo.particleRatio;
        const percentage = Math.round(ratio * 100);

        let level, className;
        if (ratio >= 0.9) {
          level = 'ULTRA';
          className = 'ultra';
        } else if (ratio >= 0.7) {
          level = 'HIGH';
          className = 'high';
        } else if (ratio >= 0.4) {
          level = 'MEDIUM';
          className = 'medium';
        } else {
          level = 'LOW';
          className = 'low';
        }

        qualityBadge.textContent = level;
        qualityBadge.className = \`quality-badge \${className}\`;
        qualityPercent.textContent = percentage + '%';
      }

      // Update focus distance
      const focusDistanceEl = document.getElementById('enhanced-lod-focus-distance');
      if (focusDistanceEl && lodInfo.cameraDistance !== undefined) {
        focusDistanceEl.textContent = lodInfo.cameraDistance.toFixed(1);
      }

      // Update frame rate
      const fpsEl = document.getElementById('enhanced-lod-fps');
      const fpsStatusEl = document.getElementById('enhanced-lod-fps-status');
      if (fpsEl && fpsStatusEl && lodInfo.averageFrameRate !== undefined) {
        const fps = Math.round(lodInfo.averageFrameRate);
        fpsEl.textContent = fps;

        let statusClass;
        if (fps >= 55) {
          statusClass = 'excellent';
        } else if (fps >= 35) {
          statusClass = 'good';
        } else {
          statusClass = 'poor';
        }

        fpsStatusEl.className = \`fps-indicator \${statusClass}\`;
      }

      // Update advanced status
      const shaderModeEl = document.getElementById('enhanced-lod-shader-mode');
      const lightingModeEl = document.getElementById('enhanced-lod-lighting-mode');
      const physicsModeEl = document.getElementById('enhanced-lod-physics-mode');

      if (shaderModeEl && lodInfo.shaderMode) {
        shaderModeEl.textContent = lodInfo.shaderMode.charAt(0).toUpperCase() + lodInfo.shaderMode.slice(1);
      }

      if (lightingModeEl && lodInfo.lightingMode) {
        const lightCount = lodInfo.activeLights || 3;
        lightingModeEl.textContent = \`\${lightCount} Light\${lightCount !== 1 ? 's' : ''}\`;
      }

      if (physicsModeEl && lodInfo.physicsMode) {
        physicsModeEl.textContent = lodInfo.physicsMode.charAt(0).toUpperCase() + lodInfo.physicsMode.slice(1);
      }

    } catch (error) {
      console.error('Error updating enhanced LOD status:', error);
    }
  }

  destroy() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    this.isInitialized = false;
  }
}

// Global instance
window.enhancedLODUI = new EnhancedLODUI();

// Reset function for UI buttons
window.resetEnhancedLODParameter = function(parameterId, defaultValue) {
  console.log('Resetting Enhanced LOD parameter:', parameterId, 'to', defaultValue);

  const slider = document.getElementById(parameterId);
  const valueDisplay = document.getElementById(parameterId + '-value');

  if (slider) {
    slider.value = defaultValue;

    // Trigger input event to update the system
    slider.dispatchEvent(new Event('input'));
  }
};
`;
