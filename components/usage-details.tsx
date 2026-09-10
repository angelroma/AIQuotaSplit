import type { UsageTotals } from "@/lib/allocation";
import {
  formatCompactTokens,
  formatEstimatedCost,
} from "@/lib/usage-format";

export function UsageDetails({ usage }: { usage: UsageTotals | null }) {
  if (!usage) return null;

  return (
    <details className="usage-details">
      <summary>Usage details</summary>
      <dl className="token-breakdown">
        <div>
          <dt>Input</dt>
          <dd>{formatCompactTokens(usage.inputTokens)}</dd>
        </div>
        <div>
          <dt>Output</dt>
          <dd>{formatCompactTokens(usage.outputTokens)}</dd>
        </div>
        <div>
          <dt>Cache read</dt>
          <dd>{formatCompactTokens(usage.cacheReadTokens)}</dd>
        </div>
        <div>
          <dt>Cache create</dt>
          <dd>{formatCompactTokens(usage.cacheCreationTokens)}</dd>
        </div>
      </dl>
      {usage.modelBreakdown.length ? (
        <ul className="model-breakdown">
          {usage.modelBreakdown.map((model) => (
            <li key={model.model}>
              <strong>{model.model}</strong>
              <span>{formatEstimatedCost(model.estimatedCostUsd)}</span>
              <small>{formatCompactTokens(model.totalTokens)}</small>
            </li>
          ))}
        </ul>
      ) : null}
    </details>
  );
}
