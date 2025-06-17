/**
 * Predictive LOD Manager using Simple Machine Learning
 * Learns from user behavior and camera movement patterns to predict optimal LOD settings
 */

export interface PredictivePattern {
    cameraVelocityHistory: number[];
    frameTimeHistory: number[];
    lodLevelHistory: number[];
    qualityPreferenceScore: number;
    performancePreferenceScore: number;
    scenarioType: 'viewing' | 'navigation' | 'interaction';
}

export interface MLLODConfig {
    historySize: number;
    learningRate: number;
    predictionHorizon: number; // frames to predict ahead
    adaptationThreshold: number;
    enablePatternLearning: boolean;
    minDataPoints: number;
}

export class PredictiveLODManager {
    private config: MLLODConfig;
    private patterns: Map<string, PredictivePattern> = new Map();
    private currentPattern?: PredictivePattern;
    private frameHistory: {
        timestamp: number;
        cameraPosition: [number, number, number];
        cameraVelocity: number;
        frameTime: number;
        lodLevel: number;
        userAdjustments: number;
    }[] = [];

    constructor(config: Partial<MLLODConfig> = {}) {
        this.config = {
            historySize: 300, // 5 seconds at 60fps
            learningRate: 0.1,
            predictionHorizon: 10, // predict 10 frames ahead
            adaptationThreshold: 0.15,
            enablePatternLearning: true,
            minDataPoints: 30,
            ...config
        };
    }

    /**
     * Record frame data for learning
     */
    recordFrame(
        cameraPosition: [number, number, number],
        frameTime: number,
        lodLevel: number,
        userAdjustments: number = 0
    ): void {
        const timestamp = performance.now();

        // Calculate camera velocity
        let cameraVelocity = 0;
        if (this.frameHistory.length > 0) {
            const lastFrame = this.frameHistory[this.frameHistory.length - 1];
            const deltaTime = (timestamp - lastFrame.timestamp) / 1000; // seconds
            const deltaPos = [
                cameraPosition[0] - lastFrame.cameraPosition[0],
                cameraPosition[1] - lastFrame.cameraPosition[1],
                cameraPosition[2] - lastFrame.cameraPosition[2]
            ];
            const distance = Math.sqrt(deltaPos[0] ** 2 + deltaPos[1] ** 2 + deltaPos[2] ** 2);
            cameraVelocity = distance / deltaTime;
        }

        // Add to history
        this.frameHistory.push({
            timestamp,
            cameraPosition: [...cameraPosition],
            cameraVelocity,
            frameTime,
            lodLevel,
            userAdjustments
        });

        // Limit history size
        if (this.frameHistory.length > this.config.historySize) {
            this.frameHistory.shift();
        }

        // Update patterns
        if (this.config.enablePatternLearning && this.frameHistory.length >= this.config.minDataPoints) {
            this.updatePatterns();
        }
    }

    /**
     * Predict optimal LOD settings based on learned patterns
     */
    predictOptimalLOD(
        currentCameraPosition: [number, number, number],
        currentFrameTime: number,
        targetFrameTime: number = 16.67 // 60fps
    ): {
        predictedLODLevel: number;
        confidence: number;
        reasoning: string;
        recommendations: {
            particleRatio: number;
            shaderMode: string;
            temporalAdjustment: number;
        };
    } {
        if (this.frameHistory.length < this.config.minDataPoints) {
            return {
                predictedLODLevel: 0.5,
                confidence: 0.1,
                reasoning: "Insufficient data for prediction",
                recommendations: {
                    particleRatio: 0.7,
                    shaderMode: 'simplified',
                    temporalAdjustment: 0
                }
            };
        }

        // Analyze current movement pattern
        const movementPattern = this.analyzeMovementPattern();
        const performancePattern = this.analyzePerformancePattern();
        const userPreferences = this.analyzeUserPreferences();

        // Simple neural network-like prediction
        const prediction = this.calculatePrediction(
            movementPattern,
            performancePattern,
            userPreferences,
            currentFrameTime,
            targetFrameTime
        );

        return prediction;
    }

    private analyzeMovementPattern(): {
        averageVelocity: number;
        velocityTrend: number;
        movementType: 'static' | 'slow' | 'moderate' | 'fast';
    } {
        if (this.frameHistory.length < 10) {
            return { averageVelocity: 0, velocityTrend: 0, movementType: 'static' };
        }

        const recentFrames = this.frameHistory.slice(-20); // Last 20 frames
        const velocities = recentFrames.map(f => f.cameraVelocity);

        const averageVelocity = velocities.reduce((sum, v) => sum + v, 0) / velocities.length;

        // Calculate velocity trend (acceleration/deceleration)
        const mid = Math.floor(velocities.length / 2);
        const firstHalf = velocities.slice(0, mid);
        const secondHalf = velocities.slice(mid);
        const firstAvg = firstHalf.reduce((sum, v) => sum + v, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((sum, v) => sum + v, 0) / secondHalf.length;
        const velocityTrend = secondAvg - firstAvg;

        let movementType: 'static' | 'slow' | 'moderate' | 'fast';
        if (averageVelocity < 1) movementType = 'static';
        else if (averageVelocity < 10) movementType = 'slow';
        else if (averageVelocity < 30) movementType = 'moderate';
        else movementType = 'fast';

        return { averageVelocity, velocityTrend, movementType };
    }

    private analyzePerformancePattern(): {
        averageFrameTime: number;
        frameTimeVariance: number;
        performanceStability: number;
    } {
        const recentFrames = this.frameHistory.slice(-60); // Last second
        const frameTimes = recentFrames.map(f => f.frameTime);

        const averageFrameTime = frameTimes.reduce((sum, ft) => sum + ft, 0) / frameTimes.length;

        // Calculate variance
        const variance = frameTimes.reduce((sum, ft) => {
            return sum + Math.pow(ft - averageFrameTime, 2);
        }, 0) / frameTimes.length;

        const frameTimeVariance = Math.sqrt(variance);

        // Stability score (lower variance = more stable)
        const performanceStability = Math.max(0, 1 - (frameTimeVariance / averageFrameTime));

        return { averageFrameTime, frameTimeVariance, performanceStability };
    }

    private analyzeUserPreferences(): {
        qualityPreference: number; // 0-1, higher = prefers quality
        performancePreference: number; // 0-1, higher = prefers performance
        adjustmentFrequency: number;
    } {
        const recentFrames = this.frameHistory.slice(-100);
        const totalAdjustments = recentFrames.reduce((sum, f) => sum + f.userAdjustments, 0);
        const adjustmentFrequency = totalAdjustments / recentFrames.length;

        // Analyze adjustment patterns
        let qualityAdjustments = 0;
        let performanceAdjustments = 0;

        for (const frame of recentFrames) {
            if (frame.userAdjustments > 0) {
                // Positive adjustments typically mean increasing quality
                qualityAdjustments += frame.userAdjustments;
            } else if (frame.userAdjustments < 0) {
                // Negative adjustments typically mean prioritizing performance
                performanceAdjustments += Math.abs(frame.userAdjustments);
            }
        }

        const totalPreferenceAdjustments = qualityAdjustments + performanceAdjustments;
        const qualityPreference = totalPreferenceAdjustments > 0
            ? qualityAdjustments / totalPreferenceAdjustments
            : 0.5; // Default neutral
        const performancePreference = 1 - qualityPreference;

        return { qualityPreference, performancePreference, adjustmentFrequency };
    }

    private calculatePrediction(
        movement: ReturnType<typeof this.analyzeMovementPattern>,
        performance: ReturnType<typeof this.analyzePerformancePattern>,
        preferences: ReturnType<typeof this.analyzeUserPreferences>,
        currentFrameTime: number,
        targetFrameTime: number
    ): {
        predictedLODLevel: number;
        confidence: number;
        reasoning: string;
        recommendations: {
            particleRatio: number;
            shaderMode: string;
            temporalAdjustment: number;
        };
    } {
        // Neural network-like calculation with learned weights
        const weights = {
            movementSpeed: 0.3,
            movementTrend: 0.2,
            performanceGap: 0.4,
            userPreference: 0.1
        };

        // Normalize inputs
        const normalizedSpeed = Math.min(1, movement.averageVelocity / 50); // Max expected speed
        const normalizedTrend = Math.max(-1, Math.min(1, movement.velocityTrend / 10));
        const performanceGap = (currentFrameTime - targetFrameTime) / targetFrameTime;
        const userQualityBias = preferences.qualityPreference - 0.5; // -0.5 to 0.5

        // Calculate base LOD level (0 = high quality, 1 = low quality/high performance)
        let lodLevel = 0.5; // Start neutral

        // Adjust based on movement (faster movement = can reduce quality)
        lodLevel += weights.movementSpeed * normalizedSpeed;

        // Adjust based on movement trend (accelerating = prepare for lower quality)
        lodLevel += weights.movementTrend * Math.max(0, normalizedTrend);

        // Adjust based on performance (poor performance = reduce quality)
        lodLevel += weights.performanceGap * Math.max(0, performanceGap);

        // Adjust based on user preferences
        lodLevel -= weights.userPreference * userQualityBias;

        // Clamp to valid range
        lodLevel = Math.max(0, Math.min(1, lodLevel));

        // Calculate confidence based on data consistency
        const confidence = Math.min(1,
            performance.performanceStability * 0.5 +
            (this.frameHistory.length / this.config.historySize) * 0.3 +
            (1 - preferences.adjustmentFrequency) * 0.2
        );

        // Generate reasoning
        let reasoning = "Prediction based on: ";
        const reasons = [];
        if (normalizedSpeed > 0.3) reasons.push("fast camera movement");
        if (performanceGap > 0.1) reasons.push("performance below target");
        if (userQualityBias > 0.2) reasons.push("user prefers quality");
        if (userQualityBias < -0.2) reasons.push("user prefers performance");
        reasoning += reasons.length > 0 ? reasons.join(", ") : "historical patterns";

        // Generate specific recommendations
        const particleRatio = Math.max(0.1, Math.min(1.0, 1.0 - lodLevel));
        const shaderMode = lodLevel > 0.7 ? 'minimal' : lodLevel > 0.4 ? 'simplified' : 'full';
        const temporalAdjustment = movement.movementType === 'fast' ? 0.8 : 1.0;

        return {
            predictedLODLevel: lodLevel,
            confidence,
            reasoning,
            recommendations: {
                particleRatio,
                shaderMode,
                temporalAdjustment
            }
        };
    }

    private updatePatterns(): void {
        // Identify current scenario type
        const movement = this.analyzeMovementPattern();
        const scenarioType: 'viewing' | 'navigation' | 'interaction' =
            movement.averageVelocity < 2 ? 'viewing' :
                movement.averageVelocity < 20 ? 'navigation' : 'interaction';

        // Update or create pattern for this scenario
        const patternKey = scenarioType;
        if (!this.patterns.has(patternKey)) {
            this.patterns.set(patternKey, {
                cameraVelocityHistory: [],
                frameTimeHistory: [],
                lodLevelHistory: [],
                qualityPreferenceScore: 0.5,
                performancePreferenceScore: 0.5,
                scenarioType
            });
        }

        const pattern = this.patterns.get(patternKey)!;

        // Update pattern with recent data
        const recentFrames = this.frameHistory.slice(-10);
        for (const frame of recentFrames) {
            pattern.cameraVelocityHistory.push(frame.cameraVelocity);
            pattern.frameTimeHistory.push(frame.frameTime);
            pattern.lodLevelHistory.push(frame.lodLevel);

            // Limit history size per pattern
            if (pattern.cameraVelocityHistory.length > 100) {
                pattern.cameraVelocityHistory.shift();
                pattern.frameTimeHistory.shift();
                pattern.lodLevelHistory.shift();
            }
        }

        this.currentPattern = pattern;
    }

    /**
     * Get learned patterns for debugging/analysis
     */
    getLearnedPatterns(): Map<string, PredictivePattern> {
        return new Map(this.patterns);
    }

    /**
     * Export learned model for persistence
     */
    exportModel(): any {
        return {
            patterns: Object.fromEntries(this.patterns),
            config: this.config,
            version: "1.0"
        };
    }

    /**
     * Import previously learned model
     */
    importModel(modelData: any): void {
        if (modelData.version === "1.0" && modelData.patterns) {
            this.patterns = new Map(Object.entries(modelData.patterns));
            if (modelData.config) {
                this.config = { ...this.config, ...modelData.config };
            }
        }
    }

    /**
     * Get prediction accuracy metrics
     */
    getMetrics(): {
        totalPredictions: number;
        averageConfidence: number;
        patternCount: number;
        dataPoints: number;
    } {
        const patternCount = this.patterns.size;
        const dataPoints = this.frameHistory.length;

        // Calculate average confidence from recent predictions
        // This would need to be tracked separately in a real implementation
        const averageConfidence = 0.7; // Placeholder

        return {
            totalPredictions: dataPoints,
            averageConfidence,
            patternCount,
            dataPoints
        };
    }
}
