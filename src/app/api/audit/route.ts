import { NextRequest, NextResponse } from "next/server";
import { AzureOpenAI } from "openai";
import { AuditFinding } from "@/types";

type AuditApiRequest = {
  findings: AuditFinding[];
};

type ExplanationMap = Record<string, string>;

const MAX_FINDINGS_PER_CALL = 40;
function parseJsonObject(text: string): ExplanationMap | null {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  try {
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).filter(([, value]) => typeof value === "string"),
    ) as ExplanationMap;
  } catch {
    return null;
  }
}

function extractCompletionText(content: unknown): string | null {
  if (typeof content === "string" && content.trim()) return content;

  if (Array.isArray(content)) {
    const textPart = content.find(
      (part) =>
        typeof part === "object" &&
        part !== null &&
        "type" in part &&
        "text" in part &&
        (part as { type?: string }).type === "text" &&
        typeof (part as { text?: string }).text === "string",
    ) as { text?: string } | undefined;

    if (textPart?.text?.trim()) return textPart.text;
  }

  return null;
}

async function explainWithAzure(
  findings: AuditFinding[],
): Promise<{ explanations: ExplanationMap | null; error?: string }> {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_KEY;
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION;
  const deployment = process.env.AZURE_OPENAI_CHAT_DEPLOYMENT;

  if (!endpoint || !apiKey || !apiVersion || !deployment) {
    return {
      explanations: null,
      error: "Missing AZURE_OPENAI_* env vars.",
    };
  }

  const client = new AzureOpenAI({
    endpoint,
    apiKey,
    apiVersion,
    deployment,
  });

  const compactFindings = findings.map((f) => ({
    id: f.id,
    type: f.type,
    reason: f.reason,
    documentIds: f.documentIds.slice(0, 5),
    sampleRows: f.sampleRows.slice(0, 2),
  }));

  try {
    const completion = await client.chat.completions.create({
      model: deployment,
      messages: [
        {
          role: "system",
          content:
            "You are a senior financial auditor. Return one-sentence risk explanations.",
        },
        {
          role: "user",
          content: `Return ONLY JSON object: { findingId: explanation }. Findings: ${JSON.stringify(compactFindings)}`,
        },
      ],
      temperature: 0.1,
    });

    const rawContent = completion.choices?.[0]?.message?.content;
    const text = extractCompletionText(rawContent);
    if (!text) {
      return {
        explanations: null,
        error: "Model response did not include text content.",
      };
    }

    const parsed = parseJsonObject(text);
    if (!parsed || Object.keys(parsed).length === 0) {
      return {
        explanations: null,
        error: "Model response was not valid JSON map.",
      };
    }

    console.info(
      `[audit] Azure response success. explanations=${Object.keys(parsed).length}`,
    );
    return { explanations: parsed };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown Azure SDK error";
    console.error(`[audit] Azure SDK call failed: ${message}`);
    return {
      explanations: null,
      error: `Azure SDK call failed: ${message}`,
    };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as AuditApiRequest;
    const findings = (body.findings ?? []).slice(0, MAX_FINDINGS_PER_CALL);
    console.info(`[audit] Request received. findings=${findings.length}`);

    if (findings.length === 0) {
      return NextResponse.json({ explanations: {}, source: "ai" });
    }

    const { explanations, error } = await explainWithAzure(findings);

    if (!explanations) {
      return NextResponse.json({
        explanations: {},
        source: "ai_unavailable",
        ...(error ? { error } : {}),
      });
    }

    console.info("[audit] Returning AI explanations.");
    return NextResponse.json({
      explanations,
      source: "ai",
    });
  } catch {
    return NextResponse.json(
      { explanations: {}, source: "ai_unavailable", error: "Audit API failed." },
      { status: 500 },
    );
  }
}
