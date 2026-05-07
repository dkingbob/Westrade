import { logger } from "../lib/logger";
import { riskEngine } from "./risk";
import { getCurrentPrice } from "./marketData";

export interface Order {
  id: string;
  symbol: string;
  side: "long" | "short";
  orderType: "market" | "limit";
  quantity: number;
  limitPrice?: number;
  status: "pending" | "filled" | "cancelled" | "rejected";
  filledPrice?: number;
  filledAt?: string;
  reason?: string;
}

export interface ExecutionResult {
  success: boolean;
  order?: Order;
  error?: string;
  fillPrice?: number;
  fees?: number;
  slippage?: number;
  latencyMs?: number;
}

class ExecutionEngine {
  private pendingOrders: Order[] = [];

  /**
   * Simulate realistic latency (5-50ms for limit, 1-5ms for market)
   */
  private simulateLatency(orderType: "market" | "limit"): Promise<void> {
    const ms = orderType === "market"
      ? Math.random() * 4 + 1
      : Math.random() * 45 + 5;
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async submitMarketOrder(
    symbol: string,
    side: "long" | "short",
    quantity: number,
    strategyName: string,
  ): Promise<ExecutionResult> {
    const start = Date.now();
    await this.simulateLatency("market");

    const rawPrice = getCurrentPrice(symbol);
    const fillPrice = riskEngine.applySlippage(rawPrice, side);
    const notional = fillPrice * quantity;
    const fees = riskEngine.calculateFees(notional);
    const slippage = Math.abs(fillPrice - rawPrice) * quantity;

    const order: Order = {
      id: `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
      symbol,
      side,
      orderType: "market",
      quantity,
      status: "filled",
      filledPrice: fillPrice,
      filledAt: new Date().toISOString(),
    };

    logger.info({ order: order.id, symbol, side, fillPrice, fees }, "Market order filled");

    return {
      success: true,
      order,
      fillPrice,
      fees,
      slippage,
      latencyMs: Date.now() - start,
    };
  }

  async submitLimitOrder(
    symbol: string,
    side: "long" | "short",
    quantity: number,
    limitPrice: number,
  ): Promise<ExecutionResult> {
    await this.simulateLatency("limit");

    const currentPrice = getCurrentPrice(symbol);
    const canFill = side === "long" ? currentPrice <= limitPrice : currentPrice >= limitPrice;

    const order: Order = {
      id: `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
      symbol,
      side,
      orderType: "limit",
      quantity,
      limitPrice,
      status: canFill ? "filled" : "pending",
      filledPrice: canFill ? limitPrice : undefined,
      filledAt: canFill ? new Date().toISOString() : undefined,
    };

    if (canFill) {
      this.pendingOrders = this.pendingOrders.filter((o) => o.id !== order.id);
      const fees = riskEngine.calculateFees(limitPrice * quantity);
      return { success: true, order, fillPrice: limitPrice, fees, slippage: 0 };
    }

    this.pendingOrders.push(order);
    return { success: true, order };
  }

  cancelOrder(orderId: string): boolean {
    const idx = this.pendingOrders.findIndex((o) => o.id === orderId);
    if (idx === -1) return false;
    this.pendingOrders[idx].status = "cancelled";
    this.pendingOrders.splice(idx, 1);
    return true;
  }

  getPendingOrders(): Order[] {
    return [...this.pendingOrders];
  }
}

export const executionEngine = new ExecutionEngine();
