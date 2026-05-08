import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { BookOpen, Search, TrendingUp, Shield, Brain, FlaskConical, BarChart2, Cpu, Bell } from "lucide-react";

const sections = [
  {
    icon: TrendingUp,
    title: "Trading Basics",
    color: "text-blue-400",
    items: [
      { term: "P&L (Profit & Loss)", def: "The difference between what you paid to open a trade and what you received when you closed it. Positive P&L means you made money; negative means you lost money." },
      { term: "Long vs Short", def: "Going 'long' means you're buying an asset expecting its price to rise. Going 'short' means you're selling (or borrowing to sell) expecting the price to fall so you can buy it back cheaper." },
      { term: "Entry Price", def: "The price at which a trade was opened. For a long, you want the exit price to be higher than the entry." },
      { term: "Exit Price", def: "The price at which a trade was closed. The difference between entry and exit determines your profit or loss." },
      { term: "Market Order", def: "An order that executes immediately at the current market price. Fast but you may get a slightly different price than expected (slippage)." },
      { term: "Limit Order", def: "An order to buy or sell only at a specific price or better. You have price control but the order may not fill if the market never reaches your price." },
      { term: "Stop Loss", def: "A pre-set price at which a losing trade will automatically close to prevent further losses. Essential risk management." },
      { term: "Take Profit", def: "A pre-set price at which a winning trade will automatically close to lock in gains." },
      { term: "Slippage", def: "The difference between the expected trade price and the actual execution price. Common during fast-moving markets or with large orders." },
      { term: "Volatility", def: "How much an asset's price fluctuates. High volatility = large price swings. Low volatility = stable, predictable price movement." },
    ],
  },
  {
    icon: BarChart2,
    title: "Performance Metrics",
    color: "text-green-400",
    items: [
      { term: "Sharpe Ratio", def: "Measures risk-adjusted return. Compares the portfolio's excess return (above the risk-free rate) to its volatility. Higher is better: >1 is acceptable, >2 is very good, >3 is excellent." },
      { term: "Sortino Ratio", def: "Like Sharpe Ratio but only penalizes downside volatility (bad volatility), not upside. More relevant for traders since you only care about losses, not gains." },
      { term: "Calmar Ratio", def: "Annual return divided by maximum drawdown. Measures how much return you get per unit of drawdown risk. Higher is better." },
      { term: "Win Rate", def: "The percentage of trades that ended in profit. A 60% win rate means 6 out of every 10 trades were profitable. High win rate alone doesn't mean profitable — trade sizing matters." },
      { term: "Max Drawdown", def: "The largest peak-to-trough decline in portfolio value. A 10% max drawdown means the portfolio fell 10% from its highest point before recovering. Lower is better." },
      { term: "Expectancy", def: "The average amount you expect to win or lose per trade. Calculated as (Win Rate × Average Win) − (Loss Rate × Average Loss). Positive expectancy = edge in the market." },
      { term: "Profit Factor", def: "Gross profit divided by gross loss. A factor of 2.0 means you made $2 for every $1 lost. Anything above 1.0 is profitable; above 1.5 is considered good." },
      { term: "Exposure", def: "The percentage of your portfolio currently at risk in open positions. 100% exposure means all your capital is deployed in trades." },
      { term: "CAGR", def: "Compound Annual Growth Rate — the annualized rate of return as if gains were reinvested each year. The standard way to compare investment performance over time." },
    ],
  },
  {
    icon: Shield,
    title: "Risk Engine",
    color: "text-red-400",
    items: [
      { term: "Risk %", def: "The maximum percentage of your account you're willing to lose on a single trade. Typical professional traders risk 0.5%–2% per trade." },
      { term: "Daily Loss Limit", def: "The maximum loss allowed in a single trading day. Once hit, the engine stops trading for the day to prevent emotional overtrading after a bad streak." },
      { term: "Exposure Cap", def: "Maximum total exposure across all open positions as a percentage of account value. Prevents over-leveraging." },
      { term: "Kill Switch", def: "An emergency stop that immediately halts all trading and can close all open positions. Use when risk limits are breached or market conditions become extreme." },
      { term: "Risk Score", def: "A composite score (0–100) measuring overall portfolio risk. Considers drawdown, exposure, volatility, and daily loss. Higher = more risk." },
      { term: "MAE (Max Adverse Excursion)", def: "The worst unrealized loss a trade experienced during its life. Helps identify trades that went against you before recovering." },
      { term: "MFE (Max Favorable Excursion)", def: "The best unrealized gain a trade experienced during its life. Helps identify if trades hit profit targets before reversing." },
    ],
  },
  {
    icon: Brain,
    title: "Sentiment Analysis",
    color: "text-purple-400",
    items: [
      { term: "Market Sentiment", def: "The overall attitude of traders and investors toward an asset or market. Bullish sentiment means people expect prices to rise; bearish means they expect prices to fall." },
      { term: "Sentiment Score", def: "A number (typically 0–100) representing the market mood. Above 50 = bullish bias; below 50 = bearish bias. Used to adjust position sizing and trade filtering." },
      { term: "Institutional vs Retail", def: "Institutional sentiment tracks large players (hedge funds, banks). Retail tracks individual traders. Institutional sentiment is generally considered more reliable." },
      { term: "Fear vs Hype", def: "Extreme fear often signals a buying opportunity (oversold conditions). Extreme hype often signals a selling opportunity (overbought). The sentiment engine detects these extremes." },
      { term: "Position Sizing Multiplier", def: "Sentiment adjusts how large each position is. Bullish sentiment → larger positions (up to 1.5×). Bearish or uncertain → smaller positions (down to 0.5×)." },
      { term: "Controlled Mode", def: "Only approved, vetted news and API sources are used for sentiment analysis. More reliable but potentially misses emerging trends." },
      { term: "Open Discovery Mode", def: "Broader scanning of internet sources, social media, and news. Can catch trends earlier but may include unreliable information." },
      { term: "Source Weighting", def: "Not all sentiment sources are equal. Professional financial news gets a higher weight than social media posts. You can adjust weights per source." },
    ],
  },
  {
    icon: Cpu,
    title: "Trading Strategies",
    color: "text-yellow-400",
    items: [
      { term: "Mean Reversion", def: "Based on the theory that prices eventually return to their historical average. The strategy buys when price is significantly below average (Z-score) and sells when above." },
      { term: "Momentum", def: "Follows the trend — buys assets that have been rising and sells (or shorts) assets that have been falling. Assumes trends continue in the short term." },
      { term: "Statistical Arbitrage (Stat Arb)", def: "Exploits pricing inefficiencies between related assets or between an asset and a benchmark like VWAP. Typically market-neutral." },
      { term: "Z-Score", def: "Measures how far a price has deviated from its moving average in terms of standard deviations. Z-score of 2 means 2 standard deviations away — statistically unusual." },
      { term: "VWAP (Volume Weighted Average Price)", def: "The average price weighted by trading volume. Used as a benchmark — price above VWAP is bullish; below is bearish." },
      { term: "RSI (Relative Strength Index)", def: "A momentum oscillator ranging 0–100. Above 70 = overbought (potential sell). Below 30 = oversold (potential buy). Confirms trade signals." },
    ],
  },
  {
    icon: FlaskConical,
    title: "Backtesting",
    color: "text-orange-400",
    items: [
      { term: "Backtesting", def: "Running a trading strategy on historical data to see how it would have performed. Does not guarantee future results but helps validate the strategy logic." },
      { term: "Walk-Forward Analysis", def: "A more robust backtesting method that optimizes the strategy on a training period, then tests it on the next period. Reduces overfitting." },
      { term: "Monte Carlo Simulation", def: "Runs hundreds of randomized variations of a strategy's trade sequence to estimate the range of possible outcomes. Shows best case, worst case, and median results." },
      { term: "Overfitting", def: "When a strategy is tuned too specifically to historical data and performs poorly on new data. The more parameters a strategy has, the higher the overfitting risk." },
      { term: "Out-of-Sample Testing", def: "Testing a strategy on data it has never 'seen' before. Critical for validating that backtested results are realistic." },
      { term: "Initial Capital", def: "The starting amount of money in the simulation. Results are normalized to show percentage returns so different capital amounts are comparable." },
    ],
  },
  {
    icon: Bell,
    title: "Alerts & Notifications",
    color: "text-cyan-400",
    items: [
      { term: "Trade Alert", def: "Notification when a new trade is opened or closed by the bot. Includes symbol, direction, price, and P&L (for closed trades)." },
      { term: "Drawdown Alert", def: "Warning when portfolio drawdown exceeds a threshold. Helps catch extended losing streaks before they become catastrophic." },
      { term: "Kill Switch Alert", def: "Immediate notification when the emergency kill switch is activated — either manually or by automatic risk limits." },
      { term: "Daily Summary", def: "End-of-day report showing total trades, P&L, win rate, and key risk metrics for the day." },
      { term: "Profit Target Alert", def: "Notification when the portfolio hits a daily profit target. Can be used to lock in gains and stop trading for the day." },
    ],
  },
];

export default function Help() {
  const [search, setSearch] = useState("");

  const filtered = sections.map(section => ({
    ...section,
    items: section.items.filter(item =>
      search === "" ||
      item.term.toLowerCase().includes(search.toLowerCase()) ||
      item.def.toLowerCase().includes(search.toLowerCase())
    ),
  })).filter(s => s.items.length > 0);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3">
        <BookOpen size={16} className="text-primary" />
        <h1 className="text-sm font-mono font-bold uppercase tracking-widest text-foreground">Help & Education Center</h1>
      </div>
      <p className="text-[11px] font-mono text-muted-foreground">
        Learn how the trading system works — from basic trading concepts to advanced risk metrics.
        Hover over any metric in the dashboard to see a quick definition.
      </p>

      <div className="relative">
        <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="h-8 pl-8 text-xs font-mono bg-background"
          placeholder="Search terms, e.g. 'Sharpe Ratio', 'drawdown', 'sentiment'..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {search && (
        <p className="text-[10px] font-mono text-muted-foreground">
          {filtered.reduce((acc, s) => acc + s.items.length, 0)} results for &quot;{search}&quot;
        </p>
      )}

      <div className="space-y-3">
        {filtered.map(section => {
          const Icon = section.icon;
          return (
            <Card key={section.title}>
              <CardHeader className="pb-1 pt-3 px-4">
                <CardTitle className={`text-[11px] font-mono uppercase tracking-wider flex items-center gap-2 ${section.color}`}>
                  <Icon size={12} />
                  {section.title}
                  <Badge variant="outline" className="text-[9px] font-mono ml-auto border-border">{section.items.length} terms</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-3">
                <Accordion type="multiple" className="space-y-0">
                  {section.items.map(item => (
                    <AccordionItem key={item.term} value={item.term} className="border-b border-border/50 last:border-0">
                      <AccordionTrigger className="text-[11px] font-mono font-semibold text-foreground py-2 hover:no-underline hover:text-primary transition-colors">
                        {item.term}
                      </AccordionTrigger>
                      <AccordionContent className="text-[11px] font-mono text-muted-foreground leading-relaxed pb-2">
                        {item.def}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </CardContent>
            </Card>
          );
        })}

        {filtered.length === 0 && (
          <div className="text-center py-8 text-[11px] font-mono text-muted-foreground">
            No results for &quot;{search}&quot;. Try a different term.
          </div>
        )}
      </div>

      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="p-4">
          <p className="text-[11px] font-mono text-primary font-semibold mb-1">Still have questions?</p>
          <p className="text-[10px] font-mono text-muted-foreground">
            Every metric in the dashboard includes a hover tooltip with a quick explanation.
            Look for the <span className="text-foreground">ⓘ</span> icon next to any metric for instant help.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
