
Here’s what each column means for **`NSE:ADANIPOWER`** in your round-bottom scan (same logic as in `scoreRoundBottom`):

| Column | Your value | Meaning |
|--------|------------|--------|
| **SYMBOL** | NSE:ADANIPOWER | NSE cash symbol the scan evaluated on **daily** bars over your **From → To** window. |
| **SCORE** | 60.1 | **Composite score (0–100)** blending drawdown depth, time in base, how many **higher** swing lows after the trough, breakout strength vs the prior range high, and volume spike on the last bar. Higher = stronger fit to the **heuristic** (not a guarantee of a “textbook” cup). |
| **DD %** | 10.4 | **Drawdown into the base**: from the **highest high before the chosen trough** to that trough’s low, as a % of the peak. ~10.4% means the dip from that peak to the trough was about that deep. |
| **BASE BARS** | 55 | **Bars from the detected trough to the latest bar** in the window — roughly how long price has been forming the right side of the pattern after the low (in **trading days** for daily data). |
| **HL PIVOTS** | 5 | Count of **fractal pivot lows** after the trough where each accepted pivot is **higher than the previous** in the chain — i.e. “higher lows” on the way up before the breakout. **5** means that chain had five steps (looser than a perfect saucer, but directionally rising lows). |
| **BREAKOUT %** | 2.12 | Last bar’s **close** vs **neckline** (the max high from the trough through the bar before the last), expressed as **(close − neckline) / neckline × 100**. ~2.12% means the close cleared that ceiling by about that much — a small but positive breakout by the rule. |
| **VOL Z** | 2.39 | **Z-score of volume on the last bar** vs the distribution of volume over the prior **vol lookback** (excluding that bar): how many standard deviations above average. **2.39** = noticeably above typical volume, often read as more interest on the breakout bar. |
| **CLOSE** | 198.50 | **Close of the last daily bar** in the range — the same bar used for breakout % and volume z-score. |

**Caveat:** This is an automated **scorecard**, not chart analysis. Names like ADANIPOWER can match the math while still failing a human “round bottom” read (e.g. shape, duration, fundamentals). Use it as a **filter**, not a signal by itself.