/**
 * Unified Model Interface
 * Guarantees a stable contract across arbitrary LLM providers.
 */
export class ModelAdapter {
  /**
   * Generates a conversational stream leveraging the underlying provider.
   * @param {Array} messages - Chat context history
   * @param {Object} config - The provider, modelname, api_key configuration.
   * @param {Function} onToken - Callback for delta text events
   * @param {Function} onError - Callback for errors
   * @param {Function} onComplete - Callback containing final telemetry and sources.
   */
  async streamResponse(messages, config, onToken, onError, onComplete, requestOptions = {}) {
    throw new Error('streamResponse must be implemented by subclass.');
  }

  async generateResponse(messages, config) {
     throw new Error('generateResponse must be implemented by subclass.');
  }
}
