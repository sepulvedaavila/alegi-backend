// services/ai-prompts.service.js
// Comprehensive AI prompts for all ALEGI features

const AI_PROMPTS = {
  // Existing prompts
  INTAKE_ANALYSIS: {
    model: 'gpt-4-turbo-preview',
    temperature: 0.3,
    prompt: (caseData, evidenceData, documentContent) => `
      Analyze this legal case comprehensively and provide structured insights.
      
      Case Information:
      - Case Name: ${caseData.case_name || 'N/A'}
      - Case Type: ${caseData.case_type || 'N/A'}
      - Jurisdiction: ${caseData.jurisdiction || 'N/A'}
      - Description: ${caseData.case_description || 'N/A'}
      
      Evidence Data: ${JSON.stringify(evidenceData || [])}
      
      Document Content: ${documentContent || 'No documents provided'}
      
      Provide a comprehensive analysis in JSON format with the following structure:
      {
        "case_metadata": {
          "case_type": ["array of case types"],
          "case_stage": "current stage",
          "date_filed": "filing date if available",
          "applicable_law": ["array of applicable laws"],
          "issue": ["array of legal issues"]
        },
        "case_evidence": {
          "ai_extracted_text": "summary of evidence",
          "key_evidence": ["list of key evidence"],
          "evidence_strength": "assessment of evidence strength"
        },
        "case_documents": {
          "ai_extracted_text": "summary of documents",
          "document_types": ["types of documents"],
          "key_findings": ["key findings from documents"]
        },
        "parties": {
          "plaintiffs": ["list of plaintiffs"],
          "defendants": ["list of defendants"],
          "other_parties": ["other involved parties"]
        },
        "claims": {
          "primary_claims": ["main legal claims"],
          "relief_sought": "relief being sought",
          "damages_claimed": "damages amount if specified"
        },
        "case_strength_indicators": ["factors indicating case strength"],
        "potential_challenges": ["potential challenges or weaknesses"]
      }
    `
  },

  JURISDICTION_ANALYSIS: {
    model: 'gpt-4-turbo-preview',
    temperature: 0.3,
    prompt: (caseData, intakeResults) => `
      Analyze the jurisdictional aspects of this case.
      
      Case Data: ${JSON.stringify(caseData)}
      Intake Analysis: ${JSON.stringify(intakeResults)}
      
      Provide jurisdictional analysis in JSON format:
      {
        "jurisdiction": {
          "primary_jurisdiction": "primary jurisdiction",
          "venue": "appropriate venue",
          "subject_matter_jurisdiction": "subject matter jurisdiction analysis",
          "personal_jurisdiction": "personal jurisdiction analysis"
        },
        "procedural_aspects": {
          "filing_requirements": ["filing requirements"],
          "statute_of_limitations": "limitations period",
          "procedural_rules": ["applicable procedural rules"]
        },
        "choice_of_law": {
          "applicable_law": "governing law",
          "conflict_resolution": "conflict of laws analysis"
        }
      }
    `
  },

  // New ALEGI Feature Prompts

  PRECEDENT_ANALYSIS: {
    model: 'gpt-4-turbo-preview',
    temperature: 0.3,
    prompt: (caseData, precedents, intakeAnalysis) => `
      Analyze relevant precedents for this legal case.
      
      Case Data: ${JSON.stringify(caseData)}
      Precedents: ${JSON.stringify(precedents)}
      Intake Analysis: ${JSON.stringify(intakeAnalysis)}
      
      Provide precedent analysis in JSON format:
      {
        "keyDecisions": [
          {
            "case_name": "case name",
            "citation": "legal citation",
            "relevance_score": 0-100,
            "influence_level": "high/medium/low",
            "key_holding": "key legal holding",
            "applicability": "how it applies to current case"
          }
        ],
        "influenceScore": 0-100,
        "relevanceScore": 0-100,
        "summary": "overall precedent analysis summary",
        "legal_principles": ["key legal principles identified"],
        "distinguishing_factors": ["factors that distinguish current case"],
        "strengthening_precedents": ["precedents that strengthen case"],
        "weakening_precedents": ["precedents that may weaken case"]
      }
    `
  },

  JUDICIAL_ANALYSIS: {
    model: 'gpt-4-turbo-preview',
    temperature: 0.3,
    prompt: (caseData, judgeTrends, intakeAnalysis) => `
      Analyze judicial behavior and court trends for this case.
      
      Case Data: ${JSON.stringify(caseData)}
      Judge Trends: ${JSON.stringify(judgeTrends)}
      Intake Analysis: ${JSON.stringify(intakeAnalysis)}
      
      Provide judicial analysis in JSON format:
      {
        "summaryJudgmentRate": 0-100,
        "averageTimeline": "average days to resolution",
        "successRate": 0-100,
        "rulingPatterns": [
          {
            "pattern_type": "type of pattern",
            "frequency": "how often this occurs",
            "description": "description of pattern"
          }
        ],
        "recommendations": [
          {
            "strategy": "recommended strategy",
            "reasoning": "why this strategy is recommended",
            "implementation": "how to implement"
          }
        ],
        "judicial_preferences": ["judge's known preferences"],
        "timing_recommendations": ["optimal timing recommendations"],
        "argument_strategies": ["recommended argument strategies"]
      }
    `
  },

  SIMILAR_CASE_ANALYSIS: {
    model: 'gpt-4-turbo-preview',
    temperature: 0.3,
    prompt: (caseData, similarCases, intakeAnalysis) => `
      Analyze similar cases to identify patterns and insights.
      
      Case Data: ${JSON.stringify(caseData)}
      Similar Cases: ${JSON.stringify(similarCases)}
      Intake Analysis: ${JSON.stringify(intakeAnalysis)}
      
      Provide similar case analysis in JSON format:
      {
        "closestMatches": [
          {
            "case_id": "case identifier",
            "similarity_score": 0-100,
            "key_similarities": ["what makes this case similar"],
            "outcome": "case outcome",
            "key_factors": ["factors that influenced outcome"]
          }
        ],
        "outcomePatterns": [
          {
            "pattern": "identified pattern",
            "frequency": "how often this pattern occurs",
            "success_rate": 0-100
          }
        ],
        "similarityScores": [
          {
            "case_id": "case identifier",
            "score": 0-100,
            "reasoning": "why this score was assigned"
          }
        ],
        "trends": ["identified trends in similar cases"],
        "risk_factors": ["risk factors identified from similar cases"],
        "opportunities": ["opportunities identified from similar cases"],
        "successfulCases": [
          {
            "case_id": "case identifier",
            "outcome": "successful outcome details",
            "key_factors": ["factors that led to success"]
          }
        ],
        "unsuccessfulCases": [
          {
            "case_id": "case identifier", 
            "outcome": "unsuccessful outcome details",
            "key_factors": ["factors that led to failure"]
          }
        ],
        "settlementCases": [
          {
            "case_id": "case identifier",
            "settlement_amount": 0,
            "settlement_factors": ["factors influencing settlement"]
          }
        ],
        "insights": ["key insights derived from case analysis"]
      }
    `
  },

  RISK_ASSESSMENT: {
    model: 'gpt-4-turbo-preview',
    temperature: 0.3,
    prompt: (data) => `
      Perform comprehensive risk assessment for this legal case.
      
      Data: ${JSON.stringify(data)}
      
      Provide risk assessment in JSON format:
      {
        "overallRiskScore": 0-100,
        "riskLevel": "low/medium/high",
        "weaknesses": [
          {
            "weakness": "identified weakness",
            "severity": "low/medium/high",
            "mitigation": "how to address this weakness"
          }
        ],
        "strengths": [
          {
            "strength": "identified strength",
            "impact": "how this strengthens the case",
            "leverage": "how to leverage this strength"
          }
        ],
        "recommendations": [
          {
            "recommendation": "specific recommendation",
            "priority": "high/medium/low",
            "implementation": "how to implement"
          }
        ],
        "riskFactors": [
          {
            "factor": "risk factor",
            "probability": 0-100,
            "impact": "high/medium/low",
            "mitigation": "mitigation strategy"
          }
        ],
        "evidence_gaps": ["gaps in evidence"],
        "legal_challenges": ["potential legal challenges"],
        "procedural_risks": ["procedural risks"]
      }
    `
  },

  COST_ESTIMATION: {
    model: 'gpt-4-turbo-preview',
    temperature: 0.3,
    prompt: (data) => `
      Estimate litigation costs for this case.
      
      Data: ${JSON.stringify(data)}
      
      Provide cost estimation in JSON format:
      {
        "totalEstimatedCost": 0,
        "breakdown": {
          "attorney_fees": 0,
          "court_costs": 0,
          "expert_witness_fees": 0,
          "discovery_costs": 0,
          "other_expenses": 0
        },
        "attorneyFees": 0,
        "courtCosts": 0,
        "expertWitnessFees": 0,
        "otherExpenses": 0,
        "costRange": {
          "low": 0,
          "high": 0,
          "likely": 0
        },
        "confidence": "low/medium/high",
        "cost_factors": [
          {
            "factor": "cost factor",
            "estimated_cost": 0,
            "uncertainty": "level of uncertainty"
          }
        ],
        "cost_optimization": ["ways to optimize costs"],
        "payment_schedule": ["recommended payment schedule"]
      }
    `
  },

  FINANCIAL_PREDICTION: {
    model: 'gpt-4-turbo-preview',
    temperature: 0.3,
    prompt: (data) => `
      Predict financial outcomes for this case.
      
      Data: ${JSON.stringify(data)}
      
      Provide financial prediction in JSON format:
      {
        "settlementRange": {
          "low": 0,
          "likely": 0,
          "high": 0,
          "confidence": "low/medium/high"
        },
        "verdictRange": {
          "low": 0,
          "likely": 0,
          "high": 0,
          "confidence": "low/medium/high"
        },
        "confidence": "low/medium/high",
        "estimatedOutcome": 0,
        "outcomeRange": {
          "low": 0,
          "likely": 0,
          "high": 0
        },
        "factors": [
          {
            "factor": "financial factor",
            "impact": "positive/negative",
            "magnitude": "high/medium/low"
          }
        ],
        "methodology": "explanation of prediction methodology",
        "comparableCases": [
          {
            "case_id": "case identifier",
            "outcome": "case outcome",
            "amount": 0,
            "relevance": "why this case is comparable"
          }
        ],
        "market_factors": ["market factors affecting prediction"],
        "economic_conditions": ["economic conditions impact"]
      }
    `
  },

  SETTLEMENT_ANALYSIS: {
    model: 'gpt-4-turbo-preview',
    temperature: 0.3,
    prompt: (data) => `
      Analyze settlement vs trial options for this case.
      
      Data: ${JSON.stringify(data)}
      
      Provide settlement analysis in JSON format:
      {
        "recommendation": "settle/trial/neutral",
        "settlementProbability": 0-100,
        "trialProbability": 0-100,
        "settlementSuccessRate": 0-100,
        "settlementAdvantages": [
          {
            "advantage": "advantage of settlement",
            "impact": "high/medium/low"
          }
        ],
        "trialAdvantages": [
          {
            "advantage": "advantage of trial",
            "impact": "high/medium/low"
          }
        ],
        "costComparison": {
          "settlement_cost": 0,
          "trial_cost": 0,
          "savings": 0
        },
        "timelineComparison": {
          "settlement_timeline": "estimated timeline",
          "trial_timeline": "estimated timeline",
          "time_savings": "time saved by settlement"
        },
        "riskComparison": {
          "settlement_risk": "risk assessment",
          "trial_risk": "risk assessment",
          "risk_difference": "difference in risk"
        },
        "negotiation_strategy": ["recommended negotiation strategies"],
        "settlement_range": {
          "minimum": 0,
          "target": 0,
          "maximum": 0
        }
      }
    `
  },

  OUTCOME_PROBABILITY: {
    model: 'gpt-4-turbo-preview',
    temperature: 0.3,
    prompt: (data) => `
      Calculate outcome probability scores for this case.
      
      Data: ${JSON.stringify(data)}
      
      Provide outcome probability in JSON format:
      {
        "successProbability": 0-100,
        "failureProbability": 0-100,
        "settlementProbability": 0-100,
        "probabilityScore": 0-100,
        "confidence": "low/medium/high",
        "factors": {
          "jurisdiction": {
            "score": 0-100,
            "reasoning": "jurisdictional factors"
          },
          "caseType": {
            "score": 0-100,
            "reasoning": "case type factors"
          },
          "precedent": {
            "score": 0-100,
            "reasoning": "precedent factors"
          },
          "proceduralPosture": {
            "score": 0-100,
            "reasoning": "procedural factors"
          },
          "evidence": {
            "score": 0-100,
            "reasoning": "evidence factors"
          }
        },
        "methodology": "explanation of probability calculation",
        "riskLevel": "low/medium/high",
        "caseStrengthScore": 0-100,
        "key_indicators": ["key indicators of outcome"],
        "confidence_factors": ["factors affecting confidence level"]
      }
    `
  },

  TIMELINE_ESTIMATION: {
    model: 'gpt-4-turbo-preview',
    temperature: 0.3,
    prompt: (data) => `
      Estimate resolution timeline for this case.
      
      Data: ${JSON.stringify(data)}
      
      Provide timeline estimation in JSON format:
      {
        "estimatedDuration": 0,
        "estimatedDays": 0,
        "durationRange": {
          "min": 0,
          "max": 0,
          "unit": "days/months/years"
        },
        "timelineRange": {
          "min": 0,
          "max": 0
        },
        "keyMilestones": [
          {
            "milestone": "key milestone",
            "estimated_date": "estimated date",
            "dependencies": ["dependencies for this milestone"]
          }
        ],
        "potentialDelays": [
          {
            "delay_type": "type of potential delay",
            "probability": 0-100,
            "impact": "days/months of delay",
            "mitigation": "how to mitigate this delay"
          }
        ],
        "confidence": "low/medium/high",
        "methodology": "explanation of timeline estimation",
        "jurisdiction_factors": ["jurisdictional timeline factors"],
        "case_complexity_factors": ["complexity factors affecting timeline"],
        "procedural_factors": ["procedural factors affecting timeline"]
      }
    `
  },

  COMPREHENSIVE_ANALYSIS: {
    model: 'gpt-4-turbo-preview',
    temperature: 0.3,
    prompt: (data) => `
      Provide comprehensive analysis integrating all ALEGI features.
      
      Data: ${JSON.stringify(data)}
      
      Provide comprehensive analysis in JSON format:
      {
        "summary": "comprehensive case summary",
        "recommendations": [
          {
            "category": "recommendation category",
            "recommendation": "specific recommendation",
            "priority": "high/medium/low",
            "rationale": "reasoning for recommendation"
          }
        ],
        "nextSteps": [
          {
            "step": "next step",
            "timeline": "when to take this step",
            "resources": "resources needed",
            "expected_outcome": "expected outcome"
          }
        ],
        "key_insights": ["key insights from analysis"],
        "risk_mitigation": ["risk mitigation strategies"],
        "opportunity_optimization": ["opportunity optimization strategies"],
        "strategic_recommendations": ["strategic recommendations"]
      }
    `
  }
};

module.exports = { AI_PROMPTS }; 