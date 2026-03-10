import { tool } from "@langchain/core/tools";
import { z } from "zod";

export function createDataQualityTools() {
  const reportScanResultsTool = tool(
    async (input) => {
      return JSON.stringify({
        success: true,
        missingDataSummary: input.missingDataSummary,
        abnormalities: input.abnormalities,
        overallScore: input.overallScore,
      });
    },
    {
      name: "report_scan_results",
      description: `Submit the complete data quality scan results. Call this exactly once after analyzing the dataset. Include all missing data findings and abnormalities detected.`,
      schema: z.object({
        missingDataSummary: z.array(
          z.object({
            column: z.string().describe("Column name"),
            missingCount: z.number().describe("Number of rows with missing/null/empty values"),
            missingPercentage: z.number().describe("Percentage of rows with missing values (0-100)"),
            totalRows: z.number().describe("Total number of rows analyzed"),
          }),
        ).describe("List of columns with missing data"),
        abnormalities: z.array(
          z.object({
            type: z.enum(["outlier", "type_mismatch", "duplicate", "inconsistent_format", "suspicious_value"])
              .describe("Type of abnormality"),
            column: z.string().describe("Column where the abnormality was found"),
            description: z.string().describe("Human-readable description of the issue"),
            affectedRows: z.number().describe("Approximate number of rows affected"),
            severity: z.enum(["low", "medium", "high"]).describe("Severity of the issue"),
          }),
        ).describe("List of detected abnormalities"),
        overallScore: z.number().min(0).max(100).describe("Overall data quality score from 0 (worst) to 100 (best)"),
      }),
    },
  );

  return [reportScanResultsTool];
}
