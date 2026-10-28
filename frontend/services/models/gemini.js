import { ModelAdapter } from './base_model';

const API_BASE = '/api/chat';

export class GeminiAdapter extends ModelAdapter {
  async streamResponse(messages, config, onToken, onError, onComplete, requestOptions = {}) {
    if (!messages || messages.length === 0) return;
    
    const lastUserMessage = messages[messages.length - 1];
    const memory = messages.slice(0, -1).map(m => ({ role: m.role, content: m.content }));

     const mode = requestOptions.mode === 'normal' ? 'normal' : 'lawyer';
     const thinking = requestOptions.thinking === 'off' ? 'off' : 'on';
     const attachments = Array.isArray(requestOptions.attachments) ? requestOptions.attachments : [];
     const userProfile = requestOptions.user_profile || {};

    const payload = {
       query: lastUserMessage.content,
       conversation_memory: memory,
       mode,
       thinking,
       attachments,
       user_profile: userProfile,
       model: "gemini",
       model_name: config.modelName || "gemini-1.5-flash",
       top_k: 7,
       alpha: 0.6,
       role_mode: mode === 'lawyer' ? 'lawyer' : 'normal',
       response_mode: thinking === 'on' ? 'detailed' : 'brief',
    };

    try {
      const response = await fetch(`${API_BASE}/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Gemini-Api-Key': config.apiKey || ''
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Gemini Stream Error: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.replace('data: ', '').trim();
            if (!dataStr) continue;
            
            try {
              const event = JSON.parse(dataStr);
              if (event.type === 'delta') {
                onToken(event.text);
              } else if (event.type === 'final') {
                onComplete(event.response);
              }
            } catch (e) {
               console.warn("Parse error on stream chunk: ", dataStr);
            }
          }
        }
      }
    } catch (error) {
      onError(error);
    }
  }

  async generateResponse(messages, config) {
    throw new Error('Fallback block not implemented for Gemini Adapter');
  }
}
