/**
 * SmartQMS – SeverityClassifier.js
 * AI-assisted severity classification for customer complaints.
 * Uses Gemini Flash (fast, cheap) for this triage task.
 *
 * Severity levels:
 *   LOW      – Minor inconvenience, no safety risk
 *   MEDIUM   – Functional issue, workaround exists, no immediate safety risk
 *   HIGH     – Significant issue, potential safety concern, requires timely action
 *   CRITICAL – Immediate safety risk, potential for MDR/Vigilance report
 */

'use strict';

const SeverityClassifier = (() => {

  const SYSTEM_PROMPT = `You are a Medical Device Complaint Classification Expert with expertise in MDR (Medical Device Reporting), EU MDR Vigilance, and ISO 13485 §8.2.2.

Classify the severity of the following customer complaint for a regulated medical device.

CRITICAL RULES:
- Respond in valid JSON only (no markdown, no prose).
- If there is ANY doubt about patient safety, classify as HIGH or CRITICAL.
- Be conservative — it is always safer to over-classify than under-classify.

Response format:
{
  "severity": "LOW|MEDIUM|HIGH|CRITICAL",
  "reportingRequired": true|false,
  "reportingRegulations": ["EU MDR Article 87", "FDA 21 CFR 803"],
  "rationale": "Brief justification (2-3 sentences).",
  "suggestedActions": ["Immediate containment action...", "..."],
  "confidence": "low|medium|high"
}`;

  /**
   * Classifies the severity of a complaint.
   * @param {{ complaintId: number, description: string, deviceType: string, deviceSN?: string }} input
   * @returns {{ severity, reportingRequired, reportingRegulations, rationale, suggestedActions, confidence, aiGenerated: true }}
   */
  function classify({ complaintId, description, deviceType, deviceSN = null }) {
    Auth.requireRole('quality');

    const userPrompt = `
Device Type: ${deviceType}
Device S/N: ${deviceSN || 'Not provided'}
Complaint: ${description}

Classify the severity and determine if regulatory reporting is required.`;

    const rawResponse = GeminiClient.generate({
      tier: 'flash',
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      temperature: 0.1,  // Very low temp — we want consistent, conservative classification
      maxOutputTokens: 1024,
    });

    let parsed;
    try {
      const cleaned = rawResponse.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
      parsed = JSON.parse(cleaned);
    } catch (e) {
      throw new Error(`[SeverityClassifier] AI returned invalid JSON: ${rawResponse.substring(0, 200)}`);
    }

    AuditTrail.log({
      action:     'AI_SEVERITY_CLASSIFICATION',
      entityType: 'complaint',
      entityId:   complaintId,
      newValue:   {
        severity:          parsed.severity,
        reportingRequired: parsed.reportingRequired,
        confidence:        parsed.confidence,
      },
      note: 'AI classification — requires human QA review.',
    });

    return { ...parsed, aiGenerated: true };
  }

  return { classify };
})();
