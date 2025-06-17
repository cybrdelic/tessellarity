/**
 * Next-Generation LOD UI Manager
 * Advanced interface for comprehensive LOD control and monitoring
 */

export interface NextGenLODUIConfig {
    enableRealTimeGraphs: boolean;
    enableSpatialVisualization: boolean;
    enablePredictiveDisplay: boolean;
    enablePerformanceAnalytics: boolean;
    updateInterval: number;
    graphHistorySize: number;
}

export class NextGenLODUI {
    private config: NextGenLODUIConfig;
    private isInitialized: boolean = false;
    private updateInterval?: number;
    private performanceGraphs: Map<string, {
        data: number[];
        color?: string;
        ctx: CanvasRenderingContext2D;
    }> = new Map();
    private spatialVisualization?: HTMLCanvasElement;

    constructor(config: Partial<NextGenLODUIConfig> = {}) {
        this.config = {
            enableRealTimeGraphs: true,
            enableSpatialVisualization: true,
            enablePredictiveDisplay: true,
            enablePerformanceAnalytics: true,
            updateInterval: 200, // 200ms updates
            graphHistorySize: 300, // 300 data points
            ...config
        };
    }

    initialize(): void {
        if (this.isInitialized) return;

        this.createAdvancedUI();
        this.initializeGraphs();
        this.initializeSpatialVisualization();
        this.startUpdates();

        this.isInitialized = true;
    }

    private createAdvancedUI(): void {
        // Create main container
        const existingContainer = document.getElementById('nextgen-lod-container');
        if (existingContainer) {
            existingContainer.remove();
        }

        const container = document.createElement('div');
        container.id = 'nextgen-lod-container';
        container.innerHTML = this.getAdvancedUITemplate();

        // Find the right place to insert (after existing LOD controls)
        const lodSection = document.querySelector('.lod-section') ||
            document.querySelector('[data-lod-section]') ||
            document.body;

        lodSection.appendChild(container);

        // Apply styles
        this.applyAdvancedStyles();

        // Bind events
        this.bindAdvancedEvents();
    }

    private getAdvancedUITemplate(): string {
        return `
            <div class="nextgen-lod-panel">
                <div class="panel-header">
                    <h3><i class="fas fa-brain"></i> Next-Gen LOD System</h3>
                    <button class="collapse-toggle" id="nextgen-collapse-toggle">
                        <i class="fas fa-chevron-up"></i>
                    </button>
                </div>

                <div class="panel-content" id="nextgen-panel-content">
                    <!-- Performance Dashboard -->
                    <div class="dashboard-section">
                        <h4><i class="fas fa-tachometer-alt"></i> Performance Dashboard</h4>
                        <div class="metrics-grid">
                            <div class="metric-card">
                                <div class="metric-label">Frame Rate</div>
                                <div class="metric-value" id="nextgen-fps">60.0</div>
                                <div class="metric-unit">FPS</div>
                                <canvas class="mini-graph" id="fps-graph" width="100" height="30"></canvas>
                            </div>

                            <div class="metric-card">
                                <div class="metric-label">Particle Count</div>
                                <div class="metric-value" id="nextgen-particles">100,000</div>
                                <div class="metric-unit">Active</div>
                                <canvas class="mini-graph" id="particles-graph" width="100" height="30"></canvas>
                            </div>

                            <div class="metric-card">
                                <div class="metric-label">LOD Efficiency</div>
                                <div class="metric-value" id="nextgen-efficiency">85.2</div>
                                <div class="metric-unit">%</div>
                                <canvas class="mini-graph" id="efficiency-graph" width="100" height="30"></canvas>
                            </div>

                            <div class="metric-card">
                                <div class="metric-label">Memory Usage</div>
                                <div class="metric-value" id="nextgen-memory">245</div>
                                <div class="metric-unit">MB</div>
                                <canvas class="mini-graph" id="memory-graph" width="100" height="30"></canvas>
                            </div>
                        </div>
                    </div>

                    <!-- Predictive Analytics -->
                    <div class="analytics-section">
                        <h4><i class="fas fa-chart-line"></i> Predictive Analytics</h4>
                        <div class="prediction-display">
                            <div class="prediction-card">
                                <div class="prediction-header">
                                    <span>Next Frame Prediction</span>
                                    <span class="confidence-badge" id="prediction-confidence">87%</span>
                                </div>
                                <div class="prediction-content">
                                    <div class="prediction-metric">
                                        <span>Recommended LOD:</span>
                                        <span id="predicted-lod">Medium Detail</span>
                                    </div>
                                    <div class="prediction-metric">
                                        <span>Expected FPS:</span>
                                        <span id="predicted-fps">58-62</span>
                                    </div>
                                    <div class="prediction-reasoning" id="prediction-reasoning">
                                        Based on camera movement and performance history
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Spatial Visualization -->
                    <div class="spatial-section">
                        <h4><i class="fas fa-cube"></i> Spatial LOD Distribution</h4>
                        <div class="spatial-controls">
                            <button class="toggle-btn" id="spatial-toggle">
                                <i class="fas fa-eye"></i> Show Spatial View
                            </button>
                            <div class="spatial-legend">
                                <div class="legend-item">
                                    <div class="legend-color high-detail"></div>
                                    <span>High Detail</span>
                                </div>
                                <div class="legend-item">
                                    <div class="legend-color medium-detail"></div>
                                    <span>Medium Detail</span>
                                </div>
                                <div class="legend-item">
                                    <div class="legend-color low-detail"></div>
                                    <span>Low Detail</span>
                                </div>
                                <div class="legend-item">
                                    <div class="legend-color culled"></div>
                                    <span>Culled</span>
                                </div>
                            </div>
                        </div>
                        <canvas class="spatial-canvas" id="spatial-canvas" width="400" height="300"></canvas>
                    </div>

                    <!-- Advanced Controls -->
                    <div class="controls-section">
                        <h4><i class="fas fa-sliders-h"></i> Advanced Controls</h4>

                        <!-- AI Prediction Controls -->
                        <div class="control-group">
                            <label class="control-label">
                                <input type="checkbox" id="enable-predictive" checked>
                                <span>Enable AI Prediction</span>
                            </label>
                            <div class="control-range">
                                <label>Prediction Sensitivity</label>
                                <input type="range" id="prediction-sensitivity" min="0" max="100" value="70">
                                <span class="range-value">70%</span>
                            </div>
                        </div>

                        <!-- GPU Culling Controls -->
                        <div class="control-group">
                            <label class="control-label">
                                <input type="checkbox" id="enable-gpu-culling" checked>
                                <span>Enable GPU Culling</span>
                            </label>
                            <div class="control-range">
                                <label>Culling Aggressiveness</label>
                                <input type="range" id="culling-aggressiveness" min="0" max="100" value="50">
                                <span class="range-value">50%</span>
                            </div>
                        </div>

                        <!-- Spatial LOD Controls -->
                        <div class="control-group">
                            <label class="control-label">
                                <input type="checkbox" id="enable-spatial-lod" checked>
                                <span>Enable Spatial LOD</span>
                            </label>
                            <div class="control-range">
                                <label>Spatial Resolution</label>
                                <input type="range" id="spatial-resolution" min="1" max="10" value="6">
                                <span class="range-value">6 Levels</span>
                            </div>
                        </div>

                        <!-- Quality vs Performance Balance -->
                        <div class="control-group">
                            <label>Quality vs Performance Balance</label>
                            <div class="balance-slider">
                                <span class="balance-label">Performance</span>
                                <input type="range" id="quality-balance" min="0" max="100" value="60">
                                <span class="balance-label">Quality</span>
                            </div>
                            <div class="balance-indicator" id="balance-indicator">Balanced</div>
                        </div>
                    </div>

                    <!-- Performance Analytics -->
                    <div class="analytics-detailed">
                        <h4><i class="fas fa-analytics"></i> Detailed Analytics</h4>
                        <div class="analytics-tabs">
                            <button class="tab-btn active" data-tab="performance">Performance</button>
                            <button class="tab-btn" data-tab="spatial">Spatial</button>
                            <button class="tab-btn" data-tab="prediction">Prediction</button>
                        </div>

                        <div class="tab-content active" id="performance-tab">
                            <canvas class="large-graph" id="performance-graph" width="600" height="200"></canvas>
                            <div class="analytics-stats">
                                <div class="stat-item">
                                    <span>Avg Frame Time:</span>
                                    <span id="avg-frame-time">16.7ms</span>
                                </div>
                                <div class="stat-item">
                                    <span>Culling Efficiency:</span>
                                    <span id="culling-efficiency">78%</span>
                                </div>
                                <div class="stat-item">
                                    <span>Memory Savings:</span>
                                    <span id="memory-savings">156MB</span>
                                </div>
                            </div>
                        </div>

                        <div class="tab-content" id="spatial-tab">
                            <div class="spatial-stats">
                                <div class="stat-grid">
                                    <div>High Detail Regions: <span id="high-detail-count">12</span></div>
                                    <div>Medium Detail Regions: <span id="medium-detail-count">28</span></div>
                                    <div>Low Detail Regions: <span id="low-detail-count">45</span></div>
                                    <div>Culled Regions: <span id="culled-count">15</span></div>
                                </div>
                                <canvas class="spatial-graph" id="spatial-distribution-graph" width="600" height="200"></canvas>
                            </div>
                        </div>

                        <div class="tab-content" id="prediction-tab">
                            <div class="prediction-stats">
                                <div class="prediction-accuracy">
                                    <span>Prediction Accuracy:</span>
                                    <span id="prediction-accuracy">84.2%</span>
                                </div>
                                <canvas class="prediction-graph" id="prediction-graph" width="600" height="200"></canvas>
                            </div>
                        </div>
                    </div>

                    <!-- Export/Import Settings -->
                    <div class="settings-section">
                        <h4><i class="fas fa-cog"></i> Settings</h4>
                        <div class="settings-buttons">
                            <button class="btn-secondary" id="export-settings">
                                <i class="fas fa-download"></i> Export Settings
                            </button>
                            <button class="btn-secondary" id="import-settings">
                                <i class="fas fa-upload"></i> Import Settings
                            </button>
                            <button class="btn-secondary" id="reset-learning">
                                <i class="fas fa-brain"></i> Reset AI Learning
                            </button>
                            <button class="btn-danger" id="emergency-mode">
                                <i class="fas fa-exclamation-triangle"></i> Emergency Mode
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    private applyAdvancedStyles(): void {
        const styles = `
            <style id="nextgen-lod-styles">
                .nextgen-lod-panel {
                    background: rgba(26, 26, 30, 0.95);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 12px;
                    margin: 1rem 0;
                    backdrop-filter: blur(10px);
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
                }

                .panel-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 1rem 1.5rem;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                    background: linear-gradient(135deg, rgba(0, 122, 255, 0.1) 0%, rgba(0, 122, 255, 0.05) 100%);
                }

                .panel-header h3 {
                    margin: 0;
                    color: #007AFF;
                    font-size: 1.1rem;
                    font-weight: 600;
                }

                .panel-header h3 i {
                    margin-right: 0.5rem;
                    color: #00D4FF;
                }

                .collapse-toggle {
                    background: none;
                    border: none;
                    color: #007AFF;
                    cursor: pointer;
                    padding: 0.5rem;
                    border-radius: 6px;
                    transition: all 0.2s ease;
                }

                .collapse-toggle:hover {
                    background: rgba(0, 122, 255, 0.1);
                }

                .panel-content {
                    padding: 1.5rem;
                    max-height: 800px;
                    overflow-y: auto;
                    transition: all 0.3s ease;
                }

                .panel-content.collapsed {
                    max-height: 0;
                    padding: 0 1.5rem;
                    overflow: hidden;
                }

                /* Dashboard Metrics */
                .dashboard-section h4 {
                    color: #ffffff;
                    margin: 0 0 1rem 0;
                    font-size: 1rem;
                    font-weight: 600;
                }

                .dashboard-section h4 i {
                    color: #00D4FF;
                    margin-right: 0.5rem;
                }

                .metrics-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
                    gap: 1rem;
                    margin-bottom: 2rem;
                }

                .metric-card {
                    background: rgba(255, 255, 255, 0.05);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 8px;
                    padding: 1rem;
                    text-align: center;
                    position: relative;
                    overflow: hidden;
                }

                .metric-card::before {
                    content: '';
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    height: 3px;
                    background: linear-gradient(90deg, #007AFF, #00D4FF);
                    opacity: 0.8;
                }

                .metric-label {
                    color: #ffffff;
                    font-size: 0.8rem;
                    font-weight: 500;
                    margin-bottom: 0.5rem;
                }

                .metric-value {
                    color: #00D4FF;
                    font-size: 1.8rem;
                    font-weight: 700;
                    line-height: 1;
                }

                .metric-unit {
                    color: rgba(255, 255, 255, 0.7);
                    font-size: 0.7rem;
                    margin-top: 0.25rem;
                }

                .mini-graph {
                    margin-top: 0.5rem;
                    width: 100%;
                    height: 30px;
                    opacity: 0.7;
                }

                /* Prediction Display */
                .analytics-section {
                    margin-bottom: 2rem;
                }

                .prediction-card {
                    background: rgba(0, 255, 128, 0.05);
                    border: 1px solid rgba(0, 255, 128, 0.2);
                    border-radius: 8px;
                    padding: 1rem;
                }

                .prediction-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 1rem;
                    color: #ffffff;
                    font-weight: 600;
                }

                .confidence-badge {
                    background: rgba(0, 255, 128, 0.2);
                    color: #00FF80;
                    padding: 0.25rem 0.75rem;
                    border-radius: 12px;
                    font-size: 0.8rem;
                    font-weight: 600;
                }

                .prediction-metric {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 0.5rem;
                    color: #ffffff;
                    font-size: 0.9rem;
                }

                .prediction-reasoning {
                    color: rgba(255, 255, 255, 0.7);
                    font-size: 0.8rem;
                    font-style: italic;
                    margin-top: 0.5rem;
                    padding-top: 0.5rem;
                    border-top: 1px solid rgba(255, 255, 255, 0.1);
                }

                /* Spatial Visualization */
                .spatial-controls {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 1rem;
                }

                .toggle-btn {
                    background: rgba(0, 122, 255, 0.2);
                    border: 1px solid rgba(0, 122, 255, 0.4);
                    color: #007AFF;
                    padding: 0.5rem 1rem;
                    border-radius: 6px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }

                .toggle-btn:hover {
                    background: rgba(0, 122, 255, 0.3);
                }

                .toggle-btn.active {
                    background: #007AFF;
                    color: white;
                }

                .spatial-legend {
                    display: flex;
                    gap: 1rem;
                }

                .legend-item {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    color: #ffffff;
                    font-size: 0.8rem;
                }

                .legend-color {
                    width: 12px;
                    height: 12px;
                    border-radius: 2px;
                }

                .legend-color.high-detail { background: #00FF80; }
                .legend-color.medium-detail { background: #FFD700; }
                .legend-color.low-detail { background: #FF8C00; }
                .legend-color.culled { background: #FF4444; }

                .spatial-canvas {
                    width: 100%;
                    background: rgba(0, 0, 0, 0.3);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 6px;
                }

                /* Controls */
                .controls-section {
                    margin-bottom: 2rem;
                }

                .control-group {
                    margin-bottom: 1.5rem;
                    padding: 1rem;
                    background: rgba(255, 255, 255, 0.02);
                    border-radius: 6px;
                    border: 1px solid rgba(255, 255, 255, 0.05);
                }

                .control-label {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    color: #ffffff;
                    font-weight: 500;
                    margin-bottom: 0.75rem;
                    cursor: pointer;
                }

                .control-label input[type="checkbox"] {
                    accent-color: #007AFF;
                }

                .control-range {
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                }

                .control-range label {
                    color: rgba(255, 255, 255, 0.8);
                    font-size: 0.9rem;
                    min-width: 120px;
                }

                .control-range input[type="range"] {
                    flex: 1;
                    accent-color: #007AFF;
                }

                .range-value {
                    color: #00D4FF;
                    font-weight: 600;
                    min-width: 50px;
                    text-align: right;
                }

                .balance-slider {
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                    margin: 0.5rem 0;
                }

                .balance-label {
                    color: rgba(255, 255, 255, 0.7);
                    font-size: 0.8rem;
                    min-width: 80px;
                }

                .balance-label:first-child { text-align: right; }
                .balance-label:last-child { text-align: left; }

                .balance-indicator {
                    text-align: center;
                    color: #00D4FF;
                    font-weight: 600;
                    margin-top: 0.5rem;
                }

                /* Tabs */
                .analytics-tabs {
                    display: flex;
                    gap: 0.25rem;
                    margin-bottom: 1rem;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                }

                .tab-btn {
                    background: none;
                    border: none;
                    color: rgba(255, 255, 255, 0.7);
                    padding: 0.75rem 1rem;
                    cursor: pointer;
                    border-radius: 6px 6px 0 0;
                    transition: all 0.2s ease;
                }

                .tab-btn:hover {
                    color: #ffffff;
                    background: rgba(255, 255, 255, 0.05);
                }

                .tab-btn.active {
                    color: #007AFF;
                    background: rgba(0, 122, 255, 0.1);
                    border-bottom: 2px solid #007AFF;
                }

                .tab-content {
                    display: none;
                }

                .tab-content.active {
                    display: block;
                }

                .large-graph, .spatial-graph, .prediction-graph {
                    width: 100%;
                    background: rgba(0, 0, 0, 0.3);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 6px;
                    margin-bottom: 1rem;
                }

                /* Settings */
                .settings-buttons {
                    display: flex;
                    gap: 0.75rem;
                    flex-wrap: wrap;
                }

                .btn-secondary, .btn-danger {
                    padding: 0.5rem 1rem;
                    border: none;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 0.85rem;
                    font-weight: 500;
                    transition: all 0.2s ease;
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                }

                .btn-secondary {
                    background: rgba(255, 255, 255, 0.1);
                    color: #ffffff;
                    border: 1px solid rgba(255, 255, 255, 0.2);
                }

                .btn-secondary:hover {
                    background: rgba(255, 255, 255, 0.15);
                }

                .btn-danger {
                    background: rgba(255, 68, 68, 0.2);
                    color: #FF4444;
                    border: 1px solid rgba(255, 68, 68, 0.4);
                }

                .btn-danger:hover {
                    background: rgba(255, 68, 68, 0.3);
                }

                /* Statistics */
                .analytics-stats, .stat-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
                    gap: 1rem;
                    margin-top: 1rem;
                }

                .stat-item {
                    display: flex;
                    justify-content: space-between;
                    padding: 0.5rem;
                    background: rgba(255, 255, 255, 0.03);
                    border-radius: 4px;
                    color: #ffffff;
                    font-size: 0.9rem;
                }

                .stat-item span:last-child {
                    color: #00D4FF;
                    font-weight: 600;
                }

                /* Scrollbar styling */
                .panel-content::-webkit-scrollbar {
                    width: 6px;
                }

                .panel-content::-webkit-scrollbar-track {
                    background: rgba(255, 255, 255, 0.05);
                    border-radius: 3px;
                }

                .panel-content::-webkit-scrollbar-thumb {
                    background: rgba(0, 122, 255, 0.3);
                    border-radius: 3px;
                }

                .panel-content::-webkit-scrollbar-thumb:hover {
                    background: rgba(0, 122, 255, 0.5);
                }
            </style>
        `;

        // Remove existing styles and add new ones
        const existingStyles = document.getElementById('nextgen-lod-styles');
        if (existingStyles) {
            existingStyles.remove();
        }
        document.head.insertAdjacentHTML('beforeend', styles);
    }

    private bindAdvancedEvents(): void {
        // Collapse/expand functionality
        const collapseToggle = document.getElementById('nextgen-collapse-toggle');
        const panelContent = document.getElementById('nextgen-panel-content');

        collapseToggle?.addEventListener('click', () => {
            panelContent?.classList.toggle('collapsed');
            const icon = collapseToggle.querySelector('i');
            if (icon) {
                icon.classList.toggle('fa-chevron-up');
                icon.classList.toggle('fa-chevron-down');
            }
        });

        // Tab switching
        const tabButtons = document.querySelectorAll('.tab-btn');
        const tabContents = document.querySelectorAll('.tab-content');

        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const tabName = button.getAttribute('data-tab');

                // Update active tab button
                tabButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');

                // Update active tab content
                tabContents.forEach(content => content.classList.remove('active'));
                const targetContent = document.getElementById(`${tabName}-tab`);
                targetContent?.classList.add('active');
            });
        });

        // Range slider updates
        this.bindRangeSliders();

        // Control checkboxes
        this.bindControlCheckboxes();

        // Settings buttons
        this.bindSettingsButtons();
    }

    private bindRangeSliders(): void {
        const rangeInputs = document.querySelectorAll('input[type="range"]');
        rangeInputs.forEach(input => {
            const rangeInput = input as HTMLInputElement;
            const updateValue = () => {
                const valueSpan = rangeInput.parentElement?.querySelector('.range-value');
                if (valueSpan) {
                    const value = rangeInput.value;
                    const id = rangeInput.id;

                    // Format value based on input type
                    if (id === 'spatial-resolution') {
                        valueSpan.textContent = `${value} Levels`;
                    } else if (id === 'quality-balance') {
                        const balanceIndicator = document.getElementById('balance-indicator');
                        const numValue = parseInt(value);

                        if (balanceIndicator) {
                            if (numValue < 30) {
                                valueSpan.textContent = `${value}%`;
                                balanceIndicator.textContent = 'Performance Focused';
                            } else if (numValue > 70) {
                                valueSpan.textContent = `${value}%`;
                                balanceIndicator.textContent = 'Quality Focused';
                            } else {
                                valueSpan.textContent = `${value}%`;
                                balanceIndicator.textContent = 'Balanced';
                            }
                        }
                    } else {
                        valueSpan.textContent = `${value}%`;
                    }
                }
            };

            rangeInput.addEventListener('input', updateValue);
            rangeInput.addEventListener('change', updateValue);

            // Initial value update
            updateValue();
        });
    }

    private bindControlCheckboxes(): void {
        const checkboxes = document.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            const checkboxInput = checkbox as HTMLInputElement;
            checkboxInput.addEventListener('change', () => {
                const id = checkboxInput.id;
                const enabled = checkboxInput.checked;

                // Emit events for the main LOD system to handle
                window.dispatchEvent(new CustomEvent('nextgen-lod-config-change', {
                    detail: { [id]: enabled }
                }));
            });
        });
    }

    private bindSettingsButtons(): void {
        // Export settings
        document.getElementById('export-settings')?.addEventListener('click', () => {
            this.exportSettings();
        });

        // Import settings
        document.getElementById('import-settings')?.addEventListener('click', () => {
            this.importSettings();
        });

        // Reset AI learning
        document.getElementById('reset-learning')?.addEventListener('click', () => {
            this.resetAILearning();
        });

        // Emergency mode
        document.getElementById('emergency-mode')?.addEventListener('click', () => {
            this.activateEmergencyMode();
        });

        // Spatial visualization toggle
        document.getElementById('spatial-toggle')?.addEventListener('click', () => {
            this.toggleSpatialVisualization();
        });
    }

    private initializeGraphs(): void {
        if (!this.config.enableRealTimeGraphs) return;

        // Initialize mini graphs
        this.initializeMiniGraph('fps-graph', '#00D4FF');
        this.initializeMiniGraph('particles-graph', '#00FF80');
        this.initializeMiniGraph('efficiency-graph', '#FFD700');
        this.initializeMiniGraph('memory-graph', '#FF8C00');

        // Initialize large graphs
        this.initializeLargeGraph('performance-graph');
        this.initializeLargeGraph('spatial-distribution-graph');
        this.initializeLargeGraph('prediction-graph');
    }

    private initializeMiniGraph(canvasId: string, color: string): void {
        const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Initialize with empty data
        const data: number[] = new Array(50).fill(0);
        this.performanceGraphs.set(canvasId, { data, color, ctx });
    }

    private initializeLargeGraph(canvasId: string): void {
        const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Initialize with empty data
        const data: number[] = new Array(this.config.graphHistorySize).fill(0);
        this.performanceGraphs.set(canvasId, { data, ctx });
    }

    private initializeSpatialVisualization(): void {
        if (!this.config.enableSpatialVisualization) return;

        this.spatialVisualization = document.getElementById('spatial-canvas') as HTMLCanvasElement;
    }

    private startUpdates(): void {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }

        this.updateInterval = window.setInterval(() => {
            this.updateDisplay();
        }, this.config.updateInterval);
    }

    private updateDisplay(): void {
        // Get current LOD data from the main system
        if (window.getNextGenLODInfo) {
            const lodInfo = window.getNextGenLODInfo();
            this.updateMetrics(lodInfo);
            this.updateGraphs(lodInfo);
            this.updatePrediction(lodInfo);
            this.updateSpatialVisualization(lodInfo);
        }
    }

    private updateMetrics(lodInfo: any): void {
        // Update FPS
        const fpsElement = document.getElementById('nextgen-fps');
        if (fpsElement && lodInfo.fps) {
            fpsElement.textContent = lodInfo.fps.toFixed(1);
        }

        // Update particle count
        const particlesElement = document.getElementById('nextgen-particles');
        if (particlesElement && lodInfo.effectiveParticleCount) {
            particlesElement.textContent = lodInfo.effectiveParticleCount.toLocaleString();
        }

        // Update efficiency
        const efficiencyElement = document.getElementById('nextgen-efficiency');
        if (efficiencyElement && lodInfo.cullingEfficiency) {
            efficiencyElement.textContent = (lodInfo.cullingEfficiency * 100).toFixed(1);
        }

        // Update memory usage
        const memoryElement = document.getElementById('nextgen-memory');
        if (memoryElement && lodInfo.memoryUsageMB) {
            memoryElement.textContent = Math.round(lodInfo.memoryUsageMB).toString();
        }
    }

    private updateGraphs(lodInfo: any): void {
        // Update mini graphs
        this.updateMiniGraph('fps-graph', lodInfo.fps || 60);
        this.updateMiniGraph('particles-graph', (lodInfo.effectiveParticleCount || 100000) / 1000);
        this.updateMiniGraph('efficiency-graph', (lodInfo.cullingEfficiency || 0.8) * 100);
        this.updateMiniGraph('memory-graph', lodInfo.memoryUsageMB || 200);
    }

    private updateMiniGraph(graphId: string, value: number): void {
        const graphData = this.performanceGraphs.get(graphId);
        if (!graphData) return;

        const { data, color, ctx } = graphData;

        // Add new value, remove old one
        data.push(value);
        if (data.length > 50) {
            data.shift();
        }

        // Clear canvas
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        // Draw graph
        ctx.strokeStyle = color || '#007AFF';
        ctx.lineWidth = 2;
        ctx.beginPath();

        const maxValue = Math.max(...data) || 1;
        const minValue = Math.min(...data) || 0;
        const range = maxValue - minValue || 1;

        for (let i = 0; i < data.length; i++) {
            const x = (i / (data.length - 1)) * ctx.canvas.width;
            const y = ctx.canvas.height - ((data[i] - minValue) / range) * ctx.canvas.height;

            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }

        ctx.stroke();
    }

    private updatePrediction(lodInfo: any): void {
        if (!lodInfo.predictedOptimalSettings) return;

        // Update confidence
        const confidenceElement = document.getElementById('prediction-confidence');
        if (confidenceElement && lodInfo.predictionConfidence) {
            confidenceElement.textContent = `${Math.round(lodInfo.predictionConfidence * 100)}%`;
        }

        // Update predictions
        const lodElement = document.getElementById('predicted-lod');
        const fpsElement = document.getElementById('predicted-fps');
        const reasoningElement = document.getElementById('prediction-reasoning');

        if (lodElement && lodInfo.predictedOptimalSettings.particleRatio) {
            const ratio = lodInfo.predictedOptimalSettings.particleRatio;
            if (ratio > 0.8) lodElement.textContent = 'High Detail';
            else if (ratio > 0.5) lodElement.textContent = 'Medium Detail';
            else lodElement.textContent = 'Low Detail';
        }

        if (fpsElement && lodInfo.predictedFPS) {
            fpsElement.textContent = `${lodInfo.predictedFPS.min}-${lodInfo.predictedFPS.max}`;
        }

        if (reasoningElement && lodInfo.predictionReasoning) {
            reasoningElement.textContent = lodInfo.predictionReasoning;
        }
    }

    private updateSpatialVisualization(lodInfo: any): void {
        if (!this.spatialVisualization || !lodInfo.spatialDistribution) return;

        const canvas = this.spatialVisualization;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw spatial regions
        // This would need to be implemented based on the actual spatial data structure
        // For now, draw a placeholder representation
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = '#00FF80';
        ctx.fillText('Spatial visualization would be rendered here', 20, 150);
    }

    // Settings methods
    private exportSettings(): void {
        const settings = {
            timestamp: Date.now(),
            config: this.config,
            // Additional settings would be gathered here
        };

        const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `nextgen-lod-settings-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    private importSettings(): void {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const settings = JSON.parse(e.target?.result as string);
                        this.config = { ...this.config, ...settings.config };
                        // Apply imported settings
                        console.log('Settings imported successfully');
                    } catch (error) {
                        console.error('Failed to import settings:', error);
                    }
                };
                reader.readAsText(file);
            }
        };
        input.click();
    }

    private resetAILearning(): void {
        if (confirm('Are you sure you want to reset all AI learning data? This cannot be undone.')) {
            window.dispatchEvent(new CustomEvent('reset-predictive-learning'));
            console.log('AI learning data reset');
        }
    }

    private activateEmergencyMode(): void {
        if (confirm('Activate emergency performance mode? This will severely reduce quality.')) {
            window.dispatchEvent(new CustomEvent('activate-emergency-mode'));
            console.log('Emergency mode activated');
        }
    }

    private toggleSpatialVisualization(): void {
        const button = document.getElementById('spatial-toggle');
        const canvas = document.getElementById('spatial-canvas');

        if (button && canvas) {
            const isActive = button.classList.contains('active');
            button.classList.toggle('active');
            canvas.style.display = isActive ? 'none' : 'block';

            const icon = button.querySelector('i');
            if (icon) {
                icon.classList.toggle('fa-eye');
                icon.classList.toggle('fa-eye-slash');
            }

            button.querySelector('span')!.textContent = isActive ? 'Show Spatial View' : 'Hide Spatial View';
        }
    }

    // Cleanup
    destroy(): void {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }

        const container = document.getElementById('nextgen-lod-container');
        container?.remove();

        const styles = document.getElementById('nextgen-lod-styles');
        styles?.remove();

        this.isInitialized = false;
    }
}

// Make it available globally for the main application
declare global {
    interface Window {
        NextGenLODUI: typeof NextGenLODUI;
        getNextGenLODInfo: () => any;
    }
}

window.NextGenLODUI = NextGenLODUI;
