// services/ai-prompts.service.js - AI prompt management

class AIPromptsService {
  constructor() {
    this.prompts = {
      probability: {
        system: `You are a legal analyst. Analyze the case and provide probability scores.
        Return JSON with: successProbability, failureProbability, settlementProbability (all 0-100),
        confidence (high/medium/low), and factors object with scores for jurisdiction, caseType, precedent, proceduralPosture.`,
        user: (context) => JSON.stringify(context)
      },
      
      riskAssessment: {
        system: `Perform legal risk assessment. Evaluate evidence strength,
        precedent alignment, jurisdictional challenges, and procedural risks.
        Return JSON with overallRisk, riskScore (0-100), detailed riskFactors array,
        and actionable recommendations.`,
        user: (context) => JSON.stringify(context)
      },
      
      costEstimate: {
        system: `Analyze case costs and provide detailed estimates.
        Consider case type, jurisdiction, complexity, and strategy.
        Return JSON with breakdown, totalEstimate, paymentSchedule, confidenceLevel, and assumptions.`,
        user: (context) => JSON.stringify(context)
      },
      
      settlementAnalysis: {
        system: `Analyze settlement vs trial outcomes. Consider costs, time, success rates.
        Return JSON with settlement and trial objects containing: estimatedValue (min/max/likely),
        timeToResolve (days), costs, successProbability, plus recommendation and reasoning array.`,
        user: (context) => JSON.stringify(context)
      },
      
      financialPrediction: {
        system: `Predict financial outcomes for legal cases.
        Consider case type, jurisdiction, evidence strength, and precedents.
        Return JSON with settlementRange, verdictRange, factors, methodology, and comparableCases.`,
        user: (context) => JSON.stringify(context)
      },
      
      timelineEstimate: {
        system: `Estimate case timeline and key milestones.
        Consider case stage, jurisdiction, complexity, and procedural requirements.
        Return JSON with estimatedDuration, milestones, criticalDates, and factors.`,
        user: (context) => JSON.stringify(context)
      }
    };
  }

  getPrompt(type, context = {}) {
    const prompt = this.prompts[type];
    if (!prompt) {
      throw new Error(`Unknown prompt type: ${type}`);
    }

    return {
      system: prompt.system,
      user: typeof prompt.user === 'function' ? prompt.user(context) : prompt.user
    };
  }

  addPrompt(type, systemPrompt, userPrompt) {
    this.prompts[type] = {
      system: systemPrompt,
      user: userPrompt
    };
  }

  listPromptTypes() {
    return Object.keys(this.prompts);
  }
}

module.exports = new AIPromptsService(); 