// services/ai-prompts.service.js
// Centralized AI prompts from the Make scenario

const AI_PROMPTS = {
    LEGAL_CASE_INTAKE: {
      model: 'gpt-4-0125-preview',
      temperature: 0.5,
      prompt: (caseData, evidence, documentContent) => `
  You are an AI legal analyst. Based on the user's responses to a legal case intake form, analyze and extract the following structured information.
  
  Instructions:
  - Respond ONLY in the exact JSON format shown below.
  - Date filed can be year, month, day, or only month and year or only year, use the dates from the case description.
  - Use \`null\` if a field is unknown or not clearly specified. (including the response for date_filed)
  - Keep text concise and objective.
  - Always use arrays for list fields, even if empty.
  - Analyze both the user-submitted narrative and uploaded document content.
  -Summarize the document and extract key legal and factual details relevant to a civil case, be sure to add the conditions and agreements from the document, DON'T LEAVE ANY KEY DETAIL OUT. Keep it short and structured.
  - Specific case type(s)
  - What stage is the case
  - when was the case filed
  - Applicable law, statutes, ordinances, or rules, list in order of importance to the  case
  - Specific legal issues
  - a brief detailed description of evidence and the strenght of each evidence. 
  - a brief of the key points from the documents
  
  The form responses are:
  
  Location: ${caseData.jurisdiction}
  
  Case Description (What happened): ${caseData.case_narrative}
  
  Desired Outcome: ${caseData.expected_outcome}
  
  Supporting Evidence Description: ${evidence.map(e => `${e.type}, ${e.description}`).join('\n')}
  
  Additional Notes:
  ${caseData.additional_notes || ''}
  
  Uploaded Document Content: ${documentContent || ''}
  
  ---
  
  Respond ONLY in this exact JSON format (with these 3 nested keys):
  
  {
    "case_metadata": {
      "case_type": ["..."],
      "case_stage": "...",
      "date_filed": "...",
      "applicable_law": ["..."],
      "issue": ["..."]
    },
    "case_evidence": {
      "ai_extracted_text": "..."
    },
    "case_documents": {
      "ai_extracted_text": "..."
    }
  }`
    },
  
    JURISDICTION_ANALYSIS: {
      model: 'gpt-4-0125-preview',
      temperature: 1.0,
      prompt: (caseData, caseMetadata) => `
  You are an AI legal assistant trained in U.S. civil procedure.
  
  Your task is to analyze the details of a potential legal case and determine the most appropriate court jurisdiction that satisfies all four conditions:
  
  1. Personal jurisdiction over the parties involved  
  2. Subject matter jurisdiction for the type of legal dispute  
  3. Geographic proximity based on the provided state and city
  4. Expected outcome. 
  
  Your answer must return the exact jurisdiction name and abbreviation (NOT: citation_abbreviation) as it appears on CourtListener's jurisdiction list (found at https://www.courtlistener.com/help/api/jurisdictions/).
  
  Use the following case information:
  
  State and city: ${caseData.jurisdiction}
  Case Type: ${caseMetadata.case_type?.join(', ') || ''}
  Case Issues: ${caseMetadata.issue?.join(', ') || ''} 
  Case expected outcome: ${caseData.expected_outcome}
  
  ---
  
  Respond only with this exact JSON format:
  
  {
    "jurisdiction_enriched": "...",
    "court_abbreviation": "..."
  }`
    },
  
    CASE_ENHANCEMENT: {
      model: 'gpt-4-0125-preview',
      temperature: 0.3,
      prompt: (caseData, caseMetadata, jurisdiction, evidence) => `
  You are an AI legal assistant. Analyze this case and return your output in the **exact JSON format** below.
  
  - Use structured arrays for lists
  - Use null for anything unknown or not applicable
  - Keep text fields short and objective (max 2-3 sentences)
  - DO NOT say "Not specified" or repeat the field label
  
  - Enhance cause(s) of action (Return only the exact causes of action)
  - Specific legal issues
  - Related statutes, ordinances, or rules, list in order of importance to the case
  - Any known similar case law
  
  Here is the case:
  
  Case Type: ${caseMetadata.case_type?.join(', ') || ''}
  Case Stage: ${caseMetadata.case_stage || ''}
  Jurisdiction: ${jurisdiction} 
  Date Filed: ${caseMetadata.date_filed || ''}
  Applicable Law: ${caseMetadata.applicable_law?.join(', ') || ''}
  Case Issues: ${caseMetadata.issue?.join(', ') || ''}
  Case Narrative: ${caseData.case_narrative}
  Case Evidence: ${evidence.ai_extracted_text || ''}
  Requested financial outcome: ${caseData.expected_outcome}
  
  Respond in this exact JSON format:
  {
    "cause_of_action": ["..."],
    "applicable_statute": ["..."],
    "enhanced_case_type": "...",
    "applicable_case_law": ["..."]
  }`
    },
  
    CASE_COMPLEXITY: {
      model: 'gpt-4-0125-preview',
      temperature: 0.6,
      prompt: (enrichedData, caseData) => `
  You are an expert legal analyst AI. Based on the following case data, assign a case complexity score from 0.0 to 1.0 (0.0 = simple case, 1.0 = highly complex). 
  Analyze based on number of issues, applicable statutes, jurisdictions, legal precedents, and court level.
  
  Respond ONLY in this exact JSON format:
  
  {
    "case_complexity_score": 0.85
  }
  
  Case Data:
  - Enhanced Case Type: ${enrichedData.enhanced_case_type}
  - Applicable Statutes: ${enrichedData.applicable_statute?.join(', ') || ''}
  - Jurisdiction: ${enrichedData.jurisdiction_enriched}
  - Case Narrative: ${caseData.case_narrative}`
    },
  
    LEGAL_PREDICTION: {
      model: 'gpt-4-1106-preview',
      temperature: 0.5,
      prompt: (enrichedData, caseData, complexityScore, evidenceSummary) => `
  You are a legal prediction AI. Based on the following case data and precedent analysis, return a prediction object with estimated values for each field in our legal prediction schema.
  
  Use all available information to provide the most accurate and insightful values. Keep numeric fields as decimals (not strings), and use \`null\` if unknown.
  
  Input Data:
  - Enhanced Case Type: ${enrichedData.enhanced_case_type}
  - Causes of Action: ${enrichedData.cause_of_action?.join(', ') || ''}
  - Jurisdiction: ${enrichedData.jurisdiction_enriched}
  - Applicable Statutes: ${enrichedData.applicable_statute?.join(', ') || ''}
  - Applicable Case Law: ${enrichedData.applicable_case_law?.join(', ') || ''}
  - Case Complexity Score: ${complexityScore}
  - Case Narrative: ${caseData.case_narrative}
  - History Narrative: ${caseData.history_narrative || ''}
  - Case Stage: ${caseData.case_stage}
  - Date Filed: ${caseData.date_filed || ''}
  - Evidence Summary: ${evidenceSummary}
  
  ---
  
  Respond ONLY in this exact JSON format:
  
  {
    "outcome_prediction_score": 0.0,
    "confidence_prediction_percentage": 0.0,
    "estimated_financial_outcome": 0.0,
    "financial_outcome_range": {"min": 0.0, "max": 0.0},
    "litigation_cost_estimate": 0.0,
    "litigation_cost_range": {"min": 0.0, "max": 0.0},
    "settlement_success_rate": 0.0,
    "plaintiff_success": 0.0,
    "appeal_after_trial": 0.0,
    "case_complexity_score": 0.0,
    "risk_score": 0.0,
    "prior_similar_rulings": [],
    "precedent_cases": [],
    "witness_score": 0.0,
    "primary_fact_strength_analysis": 0.0,
    "fact_strength_analysis": [],
    "average_time_resolution": 0.0,
    "resolution_time_range": {"min": 0.0, "max": 0.0},
    "real_time_law_changes": [],
    "analyzed_cases": [],
    "similar_cases": [],
    "average_time_resolution_type": "...",
    "judge_analysis": "...",
    "lawyer_analysis": "...",
    "settlement_trial_analysis": "...",
    "recommended_settlement_window": "...",
    "primary_strategy": "...",
    "alternative_approach": "...",
    "additional_facts_recommendations": "..."
  }`
    }
  };
  
  module.exports = AI_PROMPTS;