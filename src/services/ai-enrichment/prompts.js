const LEGAL_PROMPTS = {
    generatePredictionPrompt: (context) => `
      Analyze this legal case and provide predictions in JSON format:
      
      Case Type: ${context.caseType}
      Jurisdiction: ${context.jurisdiction}
      Description: ${context.description}
      Legal Issues: ${context.legalIssues?.join(', ')}
      Evidence Summary: ${context.evidence?.map(e => `${e.type}: ${e.description}`).join('; ')}
      
      Provide:
      - success_probability (0-100)
      - settlement_likelihood (0-100)
      - estimated_duration_months
      - key_factors (array of strings)
      - potential_outcomes (array of objects with outcome and probability)
      - analysis_summary (string)
    `,
    
    generateRiskAssessmentPrompt: (context) => `
      Assess legal risks for this case in JSON format:
      
      Case Details: ${JSON.stringify(context, null, 2)}
      
      Provide:
      - overall_risk_level (low/medium/high/critical)
      - risk_factors (array of objects with factor, severity, and mitigation)
      - mitigation_strategies (array of strings)
      - financial_exposure (object with min, max, likely amounts)
      - procedural_risks (array)
    `,
    
    generateRecommendationsPrompt: (context) => `
      Provide strategic legal recommendations in JSON format:
      
      Case Context: ${JSON.stringify(context, null, 2)}
      
      Include:
      - immediate_actions (array of prioritized actions)
      - discovery_strategy (array of discovery items)
      - settlement_considerations (array)
      - evidence_priorities (array)
      - expert_witnesses_needed (array of expertise areas)
    `,
    
    generatePrecedentSearchPrompt: (context) => `
      Find relevant legal precedents in JSON format:
      
      Case Type: ${context.caseType}
      Jurisdiction: ${context.jurisdiction}
      Key Legal Issues: ${context.legalIssues?.join(', ')}
      
      Provide:
      - relevant_cases (array with case_name, citation, relevance, key_holding)
      - key_principles (array of legal principles)
      - distinguishing_factors (array)
    `
  };
  
  module.exports = { LEGAL_PROMPTS };