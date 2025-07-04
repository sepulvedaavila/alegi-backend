module.exports.AI_PROMPTS = {
  INTAKE_ANALYSIS: {
    model: 'gpt-4-turbo-preview',
    temperature: 0.3,
    prompt: (caseData, evidence, documentContent) => `
      Analyze this legal case and extract key information:
      
      Case Information:
      ${JSON.stringify(caseData, null, 2)}
      
      Evidence:
      ${JSON.stringify(evidence, null, 2)}
      
      Document Content:
      ${documentContent}
      
      Please provide a JSON response with:
      {
        "case_summary": "Brief summary of the case",
        "key_facts": ["fact1", "fact2"],
        "legal_issues": ["issue1", "issue2"],
        "parties": {
          "plaintiffs": ["name1"],
          "defendants": ["name1"]
        },
        "claims": ["claim1", "claim2"],
        "relief_sought": "Description of relief",
        "case_strength_indicators": ["indicator1"],
        "potential_challenges": ["challenge1"]
      }
    `
  },
  
  JURISDICTION_ANALYSIS: {
    model: 'gpt-4-turbo-preview',
    temperature: 0.2,
    prompt: (caseData, intakeAnalysis) => `
      Determine the appropriate jurisdiction and court for this case:
      
      Case Data: ${JSON.stringify(caseData)}
      Initial Analysis: ${JSON.stringify(intakeAnalysis)}
      
      Return JSON with:
      {
        "recommended_jurisdiction": "Federal/State",
        "recommended_court": "Court name",
        "court_abbreviation": "Court abbreviation",
        "jurisdiction_basis": "Explanation",
        "venue_considerations": ["consideration1"],
        "alternative_jurisdictions": ["jurisdiction1"]
      }
    `
  },
  
  CASE_ENHANCEMENT: {
    model: 'gpt-4-turbo-preview',
    temperature: 0.3,
    prompt: (caseData, intakeAnalysis, jurisdiction, similarCases) => `
      Enhance this case with legal analysis and similar case insights:
      
      Case: ${JSON.stringify(caseData)}
      Initial Analysis: ${JSON.stringify(intakeAnalysis)}
      Jurisdiction: ${JSON.stringify(jurisdiction)}
      Similar Cases from CourtListener: ${JSON.stringify(similarCases?.slice(0, 5))}
      
      Provide comprehensive legal enhancement:
      {
        "cause_of_action": ["Primary cause", "Secondary cause"],
        "applicable_statute": ["Statute 1", "Statute 2"],
        "applicable_case_law": ["Case 1", "Case 2"],
        "enhanced_case_type": "Specific case type",
        "jurisdiction_enriched": "Detailed jurisdiction",
        "court_abbreviation": "Court code",
        "legal_strategy_recommendations": ["Strategy 1"],
        "precedent_analysis": "Analysis of similar cases",
        "statutory_interpretation": "Relevant statutory analysis"
      }
    `
  },
  
  COMPLEXITY_CALCULATION: {
    model: 'gpt-4-turbo-preview',
    temperature: 0.1,
    prompt: (caseData, enhancement, evidence) => `
      Calculate case complexity score (0-100):
      
      Case: ${JSON.stringify(caseData)}
      Enhancement: ${JSON.stringify(enhancement)}
      Evidence Count: ${evidence.length}
      
      Consider:
      - Number of parties
      - Legal issues complexity
      - Evidence volume
      - Jurisdictional challenges
      - Precedent clarity
      
      Return a single number between 0-100.
    `
  },
  
  LEGAL_PREDICTION: {
    model: 'gpt-4-turbo-preview',
    temperature: 0.4,
    prompt: (enrichedData, caseData, complexityScore, similarCases) => `
      Generate legal predictions for this case:
      
      Case Data: ${JSON.stringify(caseData)}
      Enriched Analysis: ${JSON.stringify(enrichedData)}
      Complexity Score: ${complexityScore}
      Similar Case Outcomes: ${JSON.stringify(similarCases?.slice(0, 3))}
      
      Provide predictions:
      {
        "outcome_prediction_score": 0.75,
        "settlement_likelihood": 0.60,
        "estimated_duration_months": [12, 18],
        "estimated_costs": {
          "low": 50000,
          "high": 150000,
          "most_likely": 85000
        },
        "risk_score": 0.45,
        "key_risk_factors": ["Risk 1", "Risk 2"],
        "success_factors": ["Factor 1", "Factor 2"],
        "recommended_strategies": ["Strategy 1"],
        "settlement_range": {
          "low": 100000,
          "high": 500000,
          "most_likely": 250000
        },
        "confidence_level": "High/Medium/Low",
        "prediction_rationale": "Detailed explanation"
      }
    `
  }
};