/**
 * SmartQMS – RootCauseAnalyzer.js
 * AI-assisted root cause analysis for NCR/CAPA records.
 *
 * HUMAN-IN-THE-LOOP (HITL) PROTOCOL:
 *   All AI output is flagged as ai_generated=true and DRAFT status.
 *   A qualified human expert MUST review, edit, and sign off before the
 *   CAPA record can be moved to any active status.
 *   This is enforced at the DB level (CAPAs with ai_generated=true cannot
 *   be set to status != 'DRAFT' without a reviewer signature).
 */

'use strict';

const RootCauseAnalyzer = (() => {

  const SYSTEM_PROMPT = `You are an expert Quality Engineer specializing in root cause analysis for regulated industries (medical devices, ISO 13485, FDA 21 CFR Part 820).

Your task is to analyze a Non-Conformance Report (NCR) and suggest the most probable root causes and corrective actions.

CRITICAL RULES:
- Always respond in valid JSON only (no markdown, no prose outside the JSON).
- Your analysis is a DRAFT for human expert review — state this clearly in the rationale.
- Be specific, actionable, and cite applicable clauses where relevant.
- Confidence must be "low", "medium", or "high" — be conservative.

Response format:
{
  "rootCauses": [
    { "category": "5M+1 category (Man/Machine/Method/Material/Measurement/Environment)", "description": "..." }
  ],
  "suggestedActions": [
    { "type": "Immediate Containment | Corrective | Preventive", "action": "...", "owner": "...", "dueWeeks": 2 }
  ],
  "relatedStandards": ["ISO 13485:2016 §8.5.2", "..."],
  "confidence": "low|medium|high",
  "rationale": "Brief reasoning. This is an AI DRAFT — mandatory human expert review required before approval.",
  "language": "en"
}`;

  /**
   * Analyzes an NCR and returns a structured root cause draft.
   * @param {{ ncrId: number, description: string, deviceSN: string, pastNcrs: Object[] }} input
   * @returns {{ rootCauses, suggestedActions, relatedStandards, confidence, rationale, aiGenerated: true }}
   */
  function analyze({ ncrId, description, deviceSN, pastNcrs = [] }) {
    Auth.requireRole('quality');

    const pastNcrSummary = pastNcrs.length > 0
      ? pastNcrs.map((n, i) => `${i + 1}. [${n.created_at}] ${n.description}`).join('\n')
      : 'No previous NCRs found for this device.';

    const userPrompt = `
NCR ID: ${ncrId}
Device Serial Number: ${deviceSN}
NCR Description: ${description}

Previous NCRs for this device S/N:
${pastNcrSummary}

Perform a root cause analysis and suggest corrective/preventive actions.`;

    const rawResponse = GeminiClient.generate({
      tier: 'pro',
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      temperature: 0.2,
      maxOutputTokens: 2048,
    });

    let parsed;
    try {
      // Strip any accidental markdown code fences
      const cleaned = rawResponse.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
      parsed = JSON.parse(cleaned);
    } catch (e) {
      throw new Error(`[RootCauseAnalyzer] AI returned invalid JSON: ${rawResponse.substring(0, 200)}`);
    }

    AuditTrail.log({
      action:     'AI_ROOT_CAUSE_DRAFT_GENERATED',
      entityType: 'ncr',
      entityId:   ncrId,
      newValue:   { confidence: parsed.confidence, model: 'gemini-pro-latest' },
      note:       'HITL: Requires human expert review and sign-off.',
    });

    return { ...parsed, aiGenerated: true };
  }

  return { analyze };
})();
