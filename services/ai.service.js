// services/ai.service.js
const OpenAI = require('openai');

class AIService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  async enrichCaseData(caseData, documentText) {
    const prompt = `
      You are a legal AI assistant analyzing a case. Based on the following case information and document text, provide:
      1. Case type classification
      2. Key legal issues identified
      3. Relevant precedents to research
      4. Potential outcomes and probabilities
      5. Recommended legal strategies

      Case Information:
      ${JSON.stringify(caseData, null, 2)}

      Document Text:
      ${documentText}

      Provide your analysis in JSON format.
    `;

    const completion = await this.openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4-turbo-preview',
      messages: [
        { role: 'system', content: 'You are a legal analysis AI specialized in case law and litigation strategy.' },
        { role: 'user', content: prompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_tokens: 2000
    });

    return JSON.parse(completion.choices[0].message.content);
  }

  async generateCasePrediction(caseData, enrichmentData, precedents) {
    const prompt = `
      Based on the case analysis and similar precedents, generate a detailed prediction including:
      1. Success probability (percentage)
      2. Expected timeline
      3. Key risk factors
      4. Recommended actions
      5. Settlement likelihood

      Case Data: ${JSON.stringify(caseData)}
      Analysis: ${JSON.stringify(enrichmentData)}
      Precedents: ${JSON.stringify(precedents)}
    `;

    const completion = await this.openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4-turbo-preview',
      messages: [
        { role: 'system', content: 'You are a legal prediction AI with expertise in case outcome analysis.' },
        { role: 'user', content: prompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.6
    });

    return JSON.parse(completion.choices[0].message.content);
  }
}

module.exports = new AIService();
