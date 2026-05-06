/**
 * SmartQMS – GeminiClient.js
 * Thin wrapper around the Gemini REST API.
 * Dynamically selects the latest available model for each task tier.
 *
 * Model tiers:
 *   'flash' – Fast, cheap; used for triage, classification, short drafts
 *   'pro'   – Deep reasoning; used for root cause analysis, regulatory cross-referencing
 *
 * The model list is fetched from the API on first use and cached.
 * This ensures we always use the latest stable Gemini release without
 * needing to update code when new models are released.
 */

'use strict';

const GeminiClient = (() => {
  const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

  let _modelCache = null;

  function _getApiKey() {
    return Config.get().ai.apiKey;
  }

  /**
   * Fetches available models and picks the latest for the requested tier.
   * @param {'flash' | 'pro'} tier
   * @returns {string} model name (e.g. "gemini-2.5-pro-latest")
   */
  function _selectModel(tier) {
    if (!_modelCache) {
      const url = `${BASE_URL}/models?key=${_getApiKey()}`;
      const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      const data = JSON.parse(response.getContentText());

      if (!data.models) {
        throw new Error(`[GeminiClient] Failed to fetch model list: ${response.getContentText()}`);
      }

      // Only keep generative models (not embedding models etc.)
      _modelCache = data.models
        .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
        .map(m => m.name); // e.g. "models/gemini-2.0-flash"
    }

    const tierKeyword = tier === 'pro' ? 'pro' : 'flash';

    // Filter by tier, prefer "latest" suffix, then most recent version number
    const candidates = _modelCache.filter(name => name.includes(tierKeyword) && !name.includes('embed'));
    if (candidates.length === 0) throw new Error(`[GeminiClient] No model found for tier: ${tier}`);

    // Prefer models with "latest" in name, else take the last in the sorted list
    const withLatest = candidates.filter(n => n.includes('latest'));
    const chosen = withLatest.length > 0
      ? withLatest[withLatest.length - 1]
      : candidates[candidates.length - 1];

    return chosen; // e.g. "models/gemini-2.5-pro-latest"
  }

  /**
   * Sends a prompt to Gemini and returns the text response.
   * @param {{ tier: 'flash'|'pro', systemPrompt?: string, userPrompt: string,
   *           temperature?: number, maxOutputTokens?: number }} options
   * @returns {string}
   */
  function generate({ tier = 'flash', systemPrompt = null, userPrompt, temperature = 0.3, maxOutputTokens = 2048 }) {
    const model = _selectModel(tier);
    const url = `${BASE_URL}/${model}:generateContent?key=${_getApiKey()}`;

    const body = {
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: { temperature, maxOutputTokens }
    };

    if (systemPrompt) {
      body.systemInstruction = { parts: [{ text: systemPrompt }] };
    }

    const options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(body),
      muteHttpExceptions: true,
    };

    const response = UrlFetchApp.fetch(url, options);
    const data = JSON.parse(response.getContentText());

    if (response.getResponseCode() !== 200) {
      throw new Error(`[GeminiClient] API error (${response.getResponseCode()}): ${JSON.stringify(data.error)}`);
    }

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('[GeminiClient] Empty response from Gemini API.');

    return text;
  }

  /** Clears model cache (for testing). */
  function reset() { _modelCache = null; }

  return { generate, reset };
})();
