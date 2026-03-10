import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { HumanMessage } from "@langchain/core/messages";
import {
  getDataQualityAgent,
  type DataQualityScanResult,
  type MissingDataColumn,
  type Abnormality,
} from "@/lib/agents/data-quality-agent";

const MAX_SAMPLE_ROWS = 200;

export async function POST(req: NextRequest) {
  try {
    const authResult = await requireAuth();
    if (authResult.error) return authResult.error;

    const body = await req.json();
    const datasetId: string = body.datasetId;
    const columns: string[] = body.columns ?? [];
    const rows: Record<string, unknown>[] = body.rows ?? [];

    if (!datasetId) {
      return NextResponse.json({ error: "datasetId is required" }, { status: 400 });
    }
    if (columns.length === 0 || rows.length === 0) {
      return NextResponse.json({ error: "Dataset has no data to scan" }, { status: 400 });
    }

    const agent = getDataQualityAgent();
    if (!agent) {
      return NextResponse.json(
        { error: "Data quality agent not available. Please ensure ANTHROPIC_API_KEY is set." },
        { status: 500 },
      );
    }

    const sampleRows = rows.slice(0, MAX_SAMPLE_ROWS);
    const sampleCsv = buildCsvPreview(columns, sampleRows);

    const userMessage = `Analyze this dataset for data quality issues.

Dataset ID: ${datasetId}
Total rows: ${rows.length}
Total columns: ${columns.length}
Columns: ${columns.join(", ")}

Sample data (first ${sampleRows.length} of ${rows.length} rows) in CSV format:
${sampleCsv}

Please scan for missing data and abnormalities, then call the report_scan_results tool with your findings.`;

    const result = await agent.invoke(
      {
        messages: [new HumanMessage(userMessage)],
        datasetId,
        columns,
        rows: sampleRows,
      },
      { recursionLimit: 10 },
    );

    const scanResult = extractScanResult(result.messages, datasetId, rows.length, columns.length);

    return NextResponse.json({ scanResult });
  } catch (e: unknown) {
    const error = e as Error & { status?: number };
    return NextResponse.json(
      { error: error.message },
      { status: error.status ?? 500 },
    );
  }
}

function buildCsvPreview(columns: string[], rows: Record<string, unknown>[]): string {
  const escapeCsv = (val: unknown): string => {
    const text = String(val ?? "");
    if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  };

  const lines: string[] = [];
  lines.push(columns.map(escapeCsv).join(","));
  for (const row of rows) {
    lines.push(columns.map((col) => escapeCsv(row[col])).join(","));
  }
  return lines.join("\n");
}

function tryExtractReport(text: string): {
  missingDataSummary: MissingDataColumn[];
  abnormalities: Abnormality[];
  overallScore: number;
} | null {
  try {
    const parsed = JSON.parse(text);
    if (parsed.success && Array.isArray(parsed.missingDataSummary)) {
      return {
        missingDataSummary: parsed.missingDataSummary,
        abnormalities: parsed.abnormalities ?? [],
        overallScore: typeof parsed.overallScore === "number" ? parsed.overallScore : 100,
      };
    }
  } catch { /* not JSON */ }
  return null;
}

function extractScanResult(
  messages: unknown[],
  datasetId: string,
  totalRows: number,
  totalColumns: number,
): DataQualityScanResult {
  let missingDataSummary: MissingDataColumn[] = [];
  let abnormalities: Abnormality[] = [];
  let overallScore = 100;

  for (const msg of messages) {
    const content = (msg as { content?: unknown }).content;

    if (typeof content === "string") {
      const report = tryExtractReport(content);
      if (report) {
        missingDataSummary = report.missingDataSummary;
        abnormalities = report.abnormalities;
        overallScore = report.overallScore;
        break;
      }
    }

    if (Array.isArray(content)) {
      for (const block of content as Array<{ type?: string; text?: string }>) {
        if (block.text) {
          const report = tryExtractReport(block.text);
          if (report) {
            missingDataSummary = report.missingDataSummary;
            abnormalities = report.abnormalities;
            overallScore = report.overallScore;
            break;
          }
        }
      }
      if (missingDataSummary.length > 0) break;
    }
  }

  const hasMissingData = missingDataSummary.some((col) => col.missingCount > 0);
  const hasAbnormalities = abnormalities.length > 0;

  return {
    datasetId,
    scannedAt: new Date().toISOString(),
    totalRows,
    totalColumns,
    missingDataSummary,
    abnormalities,
    overallScore,
    hasMissingData,
    hasAbnormalities,
  };
}
