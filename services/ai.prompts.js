module.exports.AI_PROMPTS = {
  INTAKE_ANALYSIS: {
    model: 'gpt-4-turbo-preview',
    temperature: 0.3,
    prompt: (caseData, evidenceData, documentContent) => `You are an AI legal analyst. Based on the user's responses to a legal case intake form, analyze and extract the following structured information.

Instructions:
- Respond ONLY in the exact JSON format shown below.
- Date filed can be year, month, day, or only month and year or only year, use the dates from the case description.
- Use null if a field is unknown or not clearly specified. (including the response for date_filed)
- Keep text concise and objective.
- Always use arrays for list fields, even if empty.
- Analyze both the user-submitted narrative and uploaded document content.
-Summarize the document and extract key legal and factual details relevant to a civil case, be sure to add the conditions and agreements from the document, DON'T LEAVE ANY KEY DETAIL OUT. Keep it short and structured.
- Specific case type(s)
- What stage is the case
- when was the case filed
- Applicable law, statutes, ordinances, or rules, list in order of importance to the  case
- Specific legal issues
- a brief detailed description of evidence and the strength of each evidence. 
- a brief of the key points from the documents

The form responses are:

Location: ${caseData.jurisdiction}

Case Description (What happened): ${caseData.case_narrative}

Desired Outcome: ${caseData.expected_outcome}

Supporting Evidence Description: ${(evidenceData || []).map(e => `${e.evidence_type}, ${e.description}`).join('; ')}

Additional Notes: ${caseData.additional_notes || 'None'}

Uploaded Document Content: ${documentContent || 'None'}

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
    model: 'gpt-4-turbo-preview',
    temperature: 0.2,
    prompt: (caseData, intakeResults) => `You are an AI legal assistant trained in U.S. civil procedure.

Your task is to analyze the details of a potential legal case and determine the most appropriate court jurisdiction that satisfies all four conditions:

1. Personal jurisdiction over the parties involved  
2. Subject matter jurisdiction for the type of legal dispute  
3. Geographic proximity based on the provided state and city
4. Expected outcome. 

Your answer must return the exact jurisdiction name and abbreviation (NOT: citation_abbreviation) as it appears on CourtListener’s jurisdiction list (found at https://www.courtlistener.com/help/api/jurisdictions/).

Use the following case information:

State and city: ${caseData.jurisdiction}
Case Type: ${(intakeResults.case_metadata.case_type || []).join(', ')}
Case Issues: ${(intakeResults.case_metadata.issue || []).join(', ')}
Case expected outcome: ${caseData.expected_outcome}

---

Respond only with this exact JSON format:

{
  "jurisdiction_enriched": "...",
  "court_abbreviation": "..."
}`
  },

  CASE_ENHANCEMENT: {
    model: 'gpt-4-turbo-preview',
    temperature: 0.3,
    prompt: (caseData, intakeResults, jurisdiction, documentContent) => `You are an AI legal assistant. Analyze this case and return your output in the **exact JSON format** below.

- Use structured arrays for lists
- Use null for anything unknown or not applicable
- Keep text fields short and objective (max 2-3 sentences)
- DO NOT say “Not specified” or repeat the field label

- Enhance cause(s) of action (Return only the exact causes of action)
- Specific legal issues
- Related statutes, ordinances, or rules, list in order of importance to the case
- Any known similar case law

Here is the case:

Case Type: ${(intakeResults.case_metadata.case_type || []).join(', ')}
Case Stage: ${intakeResults.case_metadata.case_stage}
Jurisdiction: ${jurisdiction.jurisdiction_enriched}
Date Filed: ${intakeResults.case_metadata.date_filed}
Applicable Law: ${(intakeResults.case_metadata.applicable_law || []).join(', ')}
Case Issues: ${(intakeResults.case_metadata.issue || []).join(', ')}
Case Narrative: ${caseData.case_narrative}
Case Evidence: ${documentContent}
Requested financial outcome: ${caseData.expected_outcome}

Respond in this exact JSON format:
{
  "cause_of_action": ["..."],
  "applicable_statute": ["..."],
  "enhanced_case_type": "...",
  "applicable_case_law": ["..."]
}`
  },

  COURT_OPINION_ANALYSIS: {
    model: 'gpt-4-turbo-preview',
    temperature: 0.3,
    prompt: (opinionText) => `You are an expert legal analyst AI. Analyze the following court opinion and extract the following structured fields.

Court Opinion:
${opinionText}

Respond ONLY in this exact JSON format:
{
  "legal_issues": ["..."],
  "strategy_used": "...",
  "outcome": "...",
  "applicable_statutes": ["..."],
  "decision_summary": "...",
  "similarity_score": 0.0
}`
  },

  COMPLEXITY_SCORE: {
    model: 'gpt-4-turbo-preview',
    temperature: 0.1,
    prompt: (caseData, enhancement, precedentSummary) => `You are an expert legal analyst AI. Based on the following case data, assign a case complexity score from 0.0 to 1.0 (0.0 = simple case, 1.0 = highly complex). 
Analyze based on number of issues, applicable statutes, jurisdictions, legal precedents, and court level.

Respond ONLY in this exact JSON format:

{
  "case_complexity_score": 0.85
}

Case Data:
- Enhanced Case Type: ${enhancement.enhanced_case_type}
- Applicable Statutes: ${(enhancement.applicable_statute || []).join(', ')}
- Jurisdiction: ${enhancement.jurisdiction_enriched}
- Precedent Cases Summary: ${precedentSummary}
-Outcome of similar past cases (DO NOT invent or hallucinate similar cases, only cases that have actually been in trial from the CourtListener data)
-Case Narrative: ${caseData.case_narrative}
`
  },

  PREDICTION_ANALYSIS: {
    model: 'gpt-4-turbo-preview',
    temperature: 0.4,
    prompt: (data) => `You are a legal prediction AI. Based on the following case data and precedent analysis, return a prediction object with estimated values for each field in our legal prediction schema.

Use all available information to provide the most accurate and insightful values. Keep numeric fields as decimals (not strings), and use null if unknown.

Input Data:
- Enhanced Case Type: ${data.enhanced_case_type}
- Causes of Action: ${(data.cause_of_action || []).join(', ')}
- Jurisdiction: ${data.jurisdiction_enriched}
- Applicable Statutes: ${(data.applicable_statute || []).join(', ')}
- Applicable Case Law: ${(data.applicable_case_law || []).join(', ')}
- Precedent Case Comparison: ${data.precedent_case_comparison}
- Case Complexity Score: ${data.case_complexity_score}
- Case Narrative: ${data.case_narrative}
- History Narrative: ${data.history_narrative}
- Case Stage: ${data.case_stage}
- Date Filed: ${data.date_filed}
- Evidence Summary: ${data.evidence_summary}

---

Respond ONLY in this exact JSON format with the exact field names:

{
  "outcome_prediction_score": 0.0,
  "settlement_probability": 0.0,
  "case_strength_score": 0.0,
  "risk_level": "low|medium|high",
  "prediction_confidence": "low|medium|high",
  "estimated_timeline": 0,
  "estimated_financial_outcome": 0.0,
  "litigation_cost_estimate": 0.0,
  "jurisdiction_score": 0.0,
  "case_type_score": 0.0,
  "precedent_score": 0.0,
  "procedural_score": 0.0,
  "confidence_prediction_percentage": 0.0,
  "financial_outcome_range": {"min": 0.0, "max": 0.0},
  "litigation_cost_range": {"min": 0.0, "max": 0.0},
  "plaintiff_success": 0.0,
  "appeal_after_trial": 0.0,
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
  },

  // Case information fusion prompt
  CASE_INFORMATION_FUSION: {
    model: 'gpt-4o-mini',
    temperature: 0.1,
    prompt: (userProvided, documentExtracted) => `Fuse the following user-provided case information with document-extracted data to create a comprehensive case summary.

User-Provided Information:
${JSON.stringify(userProvided, null, 2)}

Document-Extracted Information:
${JSON.stringify(documentExtracted, null, 2)}

Create a fused result that combines and reconciles information from both sources. Return the result as a JSON object with:

- parties: Object with "plaintiffs" and "defendants" arrays (combine from both sources)
- legal_claims: Array of legal claims (prioritize document-extracted claims)
- damages_sought: Monetary damages or relief sought
- key_dates: Object with important dates (combine from both sources)
- jurisdiction: Court or jurisdiction (prioritize document-extracted)
- case_number: Case number if present
- confidence_score: Number between 0-1 indicating confidence in the fusion
- conflicts: Array of any conflicts found between sources
- additional_insights: Array of additional insights from the fusion

Return only valid JSON without any additional text.`
  },

  // Document structure extraction prompt
  DOCUMENT_STRUCTURE_EXTRACTION: {
    model: 'gpt-4o-mini',
    temperature: 0.1,
    prompt: (text, fileName) => `Analyze the following legal document and extract structured information. Return the result as a JSON object.

Document: ${fileName}
Content: ${text.substring(0, 8000)}${text.length > 8000 ? '...' : ''}

Extract the following information:
- document_type: Type of legal document (complaint, answer, motion, order, judgment, settlement, contract, agreement, notice, letter, etc.)
- parties: Object with "plaintiffs" and "defendants" arrays
- key_dates: Object with important dates (filing_date, incident_date, etc.)
- legal_claims: Array of legal claims or causes of action
- damages_sought: Monetary damages or relief sought
- key_terms: Array of important legal terms or concepts
- jurisdiction: Court or jurisdiction mentioned
- case_number: Case number if present

Return only valid JSON without any additional text.`
  }
};