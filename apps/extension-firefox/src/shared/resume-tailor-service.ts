/**
 * AI resume tailoring service using AIClient.
 * Takes the user's resume and a job description, produces a tailored version
 * with keyword gap analysis across configured online OpenAI-compatible or local AI providers.
 */

import { aiClient } from './ai-client';

export interface TailorResult {
  tailoredResume: string;
  keywordGap: KeywordAnalysis;
}

export interface KeywordAnalysis {
  present: string[];
  missing: string[];
  score: number; // 0-100
}

function buildTailorPrompt(resumeText: string, jobDescription: string): string {
  return `You are an expert resume writer. Given a candidate's resume and a target job description, produce a tailored version of the resume that:

1. Preserves ALL factual information (dates, companies, degrees, certifications)
2. Rewords bullet points to emphasize skills and achievements relevant to the job
3. Reorders sections/bullets so the most relevant experience appears first
4. Incorporates keywords from the job description naturally
5. Keeps the same overall structure and length

IMPORTANT: Do NOT fabricate experience, skills, or achievements. Only rephrase and reorganize existing content.

---

CANDIDATE'S RESUME:
${resumeText}

---

TARGET JOB DESCRIPTION:
${jobDescription}

---

Return ONLY the tailored resume text. No explanations, no headers like "Tailored Resume:", just the resume content itself.`;
}

function buildKeywordPrompt(resumeText: string, jobDescription: string): string {
  return `Analyze the keyword match between this resume and job description. 
Extract important technical skills, tools, and qualifications from the job description.
Check which are present in the resume and which are missing.

JOB DESCRIPTION:
${jobDescription}

RESUME:
${resumeText}

Return ONLY a JSON object with this exact format (no markdown, no explanation):
{"present": ["skill1", "skill2"], "missing": ["skill3", "skill4"], "score": 75}

Where "score" is the percentage of job keywords found in the resume (0-100).`;
}

export async function tailorResume(
  resumeText: string,
  jobDescription: string,
): Promise<string> {
  const prompt = buildTailorPrompt(resumeText, jobDescription);

  const response = await aiClient.chat(
    [
      { role: 'system', content: 'You are an expert resume writer. Return only the tailored resume text.' },
      { role: 'user', content: prompt },
    ],
    { temperature: 0.3 }
  );

  return response.trim();
}

export async function analyzeKeywordGap(
  resumeText: string,
  jobDescription: string,
): Promise<KeywordAnalysis> {
  const prompt = buildKeywordPrompt(resumeText, jobDescription);

  const response = await aiClient.chat(
    [
      { role: 'system', content: 'You are an ATS keyword match analyzer. Return only valid JSON.' },
      { role: 'user', content: prompt },
    ],
    { temperature: 0.1 }
  );

  const raw = response.trim();

  try {
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        present: Array.isArray(parsed.present) ? parsed.present : [],
        missing: Array.isArray(parsed.missing) ? parsed.missing : [],
        score: typeof parsed.score === 'number' ? parsed.score : 0,
      };
    }
  } catch { /* parsing failed */ }

  return { present: [], missing: [], score: 0 };
}
