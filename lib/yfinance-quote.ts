import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance();

const QUOTE_SUMMARY_MODULES = [
  "summaryProfile",
  "financialData",
  "price",
  "defaultKeyStatistics",
] as const;

export type YahooFinanceQuoteBundle = {
  quote: Awaited<ReturnType<typeof yahooFinance.quote>>;
  summary: Awaited<ReturnType<typeof yahooFinance.quoteSummary>>;
};

export async function fetchYahooQuoteAndSummary(
  symbol: string,
): Promise<YahooFinanceQuoteBundle> {
  const quote = await yahooFinance.quote(symbol);
  const summary = await yahooFinance.quoteSummary(symbol, {
    modules: [...QUOTE_SUMMARY_MODULES],
  });
  return { quote, summary };
}
