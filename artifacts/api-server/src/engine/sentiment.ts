export type SentimentMode = "clean" | "hype" | "custom";

export interface SentimentConfig {
  mode: SentimentMode;
  institutionalWeight: number;
  retailWeight: number;
  momentumWeight: number;
  enabled: boolean;
  maxMultiplier: number;
  minMultiplier: number;
}

export interface SentimentScores {
  institutional: number;
  retail: number;
  momentum: number;
  composite: number;
  mode: SentimentMode;
  divergence: number;
  modelSentiment: number;
  trend: "bullish" | "bearish" | "neutral";
  updatedAt: string;
}

class SentimentEngine {
  private config: SentimentConfig = {
    mode: "clean",
    institutionalWeight: 0.60,
    retailWeight: 0.20,
    momentumWeight: 0.20,
    enabled: true,
    maxMultiplier: 1.5,
    minMultiplier: 0.5,
  };

  private institutional = 0.55;
  private retail = 0.50;
  private momentum = 0.60;
  private modelSentiment = 0.58;

  updateConfig(config: Partial<SentimentConfig>) {
    this.config = { ...this.config, ...config };
  }

  getConfig(): SentimentConfig {
    return { ...this.config };
  }

  /**
   * Simulate sentiment updates — in production these would come from real sources:
   * - Institutional: COT reports, dark pool data, options flow
   * - Retail: Twitter/Reddit sentiment, search trends
   * - Momentum: price momentum, volume trends
   */
  tick() {
    const nudge = () => (Math.random() - 0.5) * 0.02;
    this.institutional = Math.max(0, Math.min(1, this.institutional + nudge()));
    this.retail = Math.max(0, Math.min(1, this.retail + nudge() * 1.5));
    this.momentum = Math.max(0, Math.min(1, this.momentum + nudge()));
    this.modelSentiment = Math.max(0, Math.min(1, this.modelSentiment + nudge() * 0.5));
  }

  getState(): SentimentScores {
    const { mode, institutionalWeight, retailWeight, momentumWeight } = this.config;

    let weights: { inst: number; ret: number; mom: number };
    switch (mode) {
      case "clean":
        weights = { inst: 1.0, ret: 0.0, mom: 0.0 };
        break;
      case "hype":
        weights = { inst: 0.2, ret: 0.6, mom: 0.2 };
        break;
      case "custom":
      default:
        weights = { inst: institutionalWeight, ret: retailWeight, mom: momentumWeight };
    }

    const total = weights.inst + weights.ret + weights.mom;
    const composite =
      (this.institutional * weights.inst + this.retail * weights.ret + this.momentum * weights.mom) / total;

    const divergence = Math.abs(composite - this.modelSentiment);
    const trend =
      composite > 0.6 ? "bullish" : composite < 0.4 ? "bearish" : "neutral";

    return {
      institutional: parseFloat(this.institutional.toFixed(4)),
      retail: parseFloat(this.retail.toFixed(4)),
      momentum: parseFloat(this.momentum.toFixed(4)),
      composite: parseFloat(composite.toFixed(4)),
      mode,
      divergence: parseFloat(divergence.toFixed(4)),
      modelSentiment: parseFloat(this.modelSentiment.toFixed(4)),
      trend,
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Position sizing multiplier based on sentiment
   * Returns a value between minMultiplier and maxMultiplier
   * Sentiment score 0.5 = 1.0x (neutral)
   */
  getPositionMultiplier(): number {
    if (!this.config.enabled) return 1.0;
    const state = this.getState();
    const { minMultiplier, maxMultiplier } = this.config;
    const range = maxMultiplier - minMultiplier;
    const multiplier = minMultiplier + range * state.composite;
    return parseFloat(Math.max(minMultiplier, Math.min(maxMultiplier, multiplier)).toFixed(4));
  }
}

export const sentimentEngine = new SentimentEngine();
