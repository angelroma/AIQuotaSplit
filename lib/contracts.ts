import { z } from "zod";

const tokenCount = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const estimatedCost = z.number().finite().min(0).nullable();

const tokenTotalsObject = z.object({
    inputTokens: tokenCount,
    outputTokens: tokenCount,
    cacheReadTokens: tokenCount,
    cacheCreationTokens: tokenCount,
    totalTokens: tokenCount,
    estimatedCostUsd: estimatedCost,
  }).strict();

function validateTokenComponents(
  value: z.infer<typeof tokenTotalsObject>,
  ctx: z.RefinementCtx,
) {
    const componentTotal =
      value.inputTokens +
      value.outputTokens +
      value.cacheReadTokens +
      value.cacheCreationTokens;

    if (value.totalTokens !== componentTotal) {
      ctx.addIssue({
        code: "custom",
        path: ["totalTokens"],
        message: "totalTokens must equal the token component sum",
      });
    }
}

const tokenTotalsSchema = tokenTotalsObject.superRefine(validateTokenComponents);

const canonicalDateTime = z
  .string()
  .datetime({ offset: true })
  .transform((value) => new Date(value).toISOString());

export const syncReportSchema = z
  .object({
    schemaVersion: z.literal(1),
    deviceId: z.string().uuid(),
    windowResetsAt: z.number().int().positive(),
    windowDurationMins: z.number().int().min(1).max(43_200),
    collectedAt: canonicalDateTime,
    trackingStartedAt: canonicalDateTime,
    localUsageAvailable: z.literal(true),
    rateLimitAvailable: z.boolean(),
    sharedUsedPercent: z.number().finite().min(0).max(100).nullable(),
    collectorVersion: z.string().trim().min(1).max(32),
    totals: tokenTotalsObject.extend({
      modelBreakdown: z
        .record(z.string().trim().min(1).max(128), tokenTotalsSchema)
        .refine(
          (value) => Object.keys(value).length <= 64,
          "modelBreakdown has too many models",
        ),
    }).superRefine(validateTokenComponents),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (Date.parse(value.trackingStartedAt) > Date.parse(value.collectedAt)) {
      ctx.addIssue({
        code: "custom",
        path: ["trackingStartedAt"],
        message: "trackingStartedAt must not be after collectedAt",
      });
    }

    if (value.rateLimitAvailable !== (value.sharedUsedPercent !== null)) {
      ctx.addIssue({
        code: "custom",
        path: ["sharedUsedPercent"],
        message: "sharedUsedPercent must match rateLimitAvailable",
      });
    }

    const models = Object.values(value.totals.modelBreakdown);
    if (value.totals.totalTokens > 0 && models.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["totals", "modelBreakdown"],
        message: "modelBreakdown is required when usage is non-zero",
      });
      return;
    }

    const fields = [
      "inputTokens",
      "outputTokens",
      "cacheReadTokens",
      "cacheCreationTokens",
      "totalTokens",
    ] as const;

    for (const field of fields) {
      const modelSum = models.reduce((sum, model) => sum + model[field], 0);
      if (modelSum !== value.totals[field]) {
        ctx.addIssue({
          code: "custom",
          path: ["totals", "modelBreakdown"],
          message: `modelBreakdown ${field} does not match totals`,
        });
      }
    }

    const modelCosts = models.map((model) => model.estimatedCostUsd);
    if (
      value.totals.estimatedCostUsd !== null &&
      modelCosts.every((cost): cost is number => cost !== null)
    ) {
      const modelCost = modelCosts.reduce((sum, cost) => sum + cost, 0);
      if (Math.abs(modelCost - value.totals.estimatedCostUsd) > 0.000_001) {
        ctx.addIssue({
          code: "custom",
          path: ["totals", "modelBreakdown"],
          message: "modelBreakdown estimated cost does not match totals",
        });
      }
    }
  });

export const memberNameSchema = z.string().trim().min(1).max(80);

export const deviceRegistrationSchema = z
  .object({
    deviceId: z.string().uuid(),
    memberId: z.string().uuid(),
    displayName: z.string().trim().min(1).max(120),
    platform: z.enum(["macos", "windows", "linux", "other"]),
    reassign: z.boolean().default(false),
  })
  .strict();

export type SyncReportInput = z.infer<typeof syncReportSchema>;
export type DeviceRegistrationInput = z.infer<
  typeof deviceRegistrationSchema
>;
