import OpenAI from 'openai';
import { logger } from '../../utils/logger.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function generatePredictions(documents, caseData) {
  try {
    logger.info('Generating AI predictions', { 
      caseId: caseData.id,
      documentsCount: documents.length 
    });

    // Combine all document content
    const combinedContent = documents
      .map(doc => doc.content || doc.analysis_results?.text || '')
      .join('\n\n');

    if (!combinedContent.trim()) {
      return {
        predictions: [],
        message: 'No content available for analysis'
      };
    }

    // Generate predictions using OpenAI
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: `You are a legal AI assistant analyzing litigation documents. 
          Provide predictions and insights based on the document content. 
          Focus on case strength, key issues, potential outcomes, and recommendations.`
        },
        {
          role: "user",
          content: `Analyze the following legal documents for case "${caseData.title}" and provide predictions:
          
          ${combinedContent}
          
          Please provide:
          1. Case strength assessment (1-10 scale)
          2. Key legal issues identified
          3. Potential outcomes and probabilities
          4. Strategic recommendations
          5. Risk factors
          6. Timeline estimates`
        }
      ],
      temperature: 0.3,
      max_tokens: 2000
    });

    const predictions = {
      caseStrength: extractCaseStrength(completion.choices[0].message.content),
      keyIssues: extractKeyIssues(completion.choices[0].message.content),
      outcomes: extractOutcomes(completion.choices[0].message.content),
      recommendations: extractRecommendations(completion.choices[0].message.content),
      riskFactors: extractRiskFactors(completion.choices[0].message.content),
      timeline: extractTimeline(completion.choices[0].message.content),
      rawAnalysis: completion.choices[0].message.content,
      generatedAt: new Date().toISOString()
    };

    logger.info('AI predictions generated successfully', { 
      caseId: caseData.id 
    });

    return predictions;
  } catch (error) {
    logger.error('Error generating AI predictions', { 
      error: error.message,
      caseId: caseData.id 
    });
    throw error;
  }
}

function extractCaseStrength(content) {
  const strengthMatch = content.match(/case strength.*?(\d+)/i);
  return strengthMatch ? parseInt(strengthMatch[1]) : null;
}

function extractKeyIssues(content) {
  const issuesMatch = content.match(/key.*?issues?.*?:\s*(.*?)(?=\n|$)/is);
  return issuesMatch ? issuesMatch[1].split(',').map(issue => issue.trim()) : [];
}

function extractOutcomes(content) {
  const outcomesMatch = content.match(/outcomes?.*?:\s*(.*?)(?=\n|$)/is);
  return outcomesMatch ? outcomesMatch[1].split(',').map(outcome => outcome.trim()) : [];
}

function extractRecommendations(content) {
  const recsMatch = content.match(/recommendations?.*?:\s*(.*?)(?=\n|$)/is);
  return recsMatch ? recsMatch[1].split(',').map(rec => rec.trim()) : [];
}

function extractRiskFactors(content) {
  const risksMatch = content.match(/risk.*?factors?.*?:\s*(.*?)(?=\n|$)/is);
  return risksMatch ? risksMatch[1].split(',').map(risk => risk.trim()) : [];
}

function extractTimeline(content) {
  const timelineMatch = content.match(/timeline.*?:\s*(.*?)(?=\n|$)/is);
  return timelineMatch ? timelineMatch[1].trim() : null;
} 