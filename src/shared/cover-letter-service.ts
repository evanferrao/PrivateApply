/**
 * Cover letter generation service — uses AIClient to produce a tailored cover
 * letter from the user's profile/resume and the scraped job description.
 * Works with online OpenAI-compatible providers and local Ollama.
 */

import type { UserProfile } from './profile';
import type { JobDescription } from './job-description-scraper';
import { aiClient } from './ai-client';

export interface CoverLetterResult {
  text: string;          // the generated letter
  jobTitle: string;
  company: string;
  generatedAt: number;   // epoch ms
}

// ── Public API ──────────────────────────────────────────────────────────────

export async function generateCoverLetter(
  profile: UserProfile,
  job: JobDescription,
  onChunk?: (partialText: string) => void,
): Promise<CoverLetterResult> {
  const prompt = buildPrompt(profile, job);

  onChunk?.('Generating cover letter…');

  let accumulated = '';
  const fullText = await aiClient.chatStream(
    [
      {
        role: 'system',
        content: 'You are an expert career counselor and professional resume writer. Write tailored, compelling cover letters.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    {
      temperature: 0.7,
      onChunk: (delta) => {
        accumulated += delta;
        onChunk?.(cleanCoverLetter(accumulated));
      },
    }
  );

  const cleaned = cleanCoverLetter(fullText || accumulated);

  return {
    text: cleaned,
    jobTitle: job.title,
    company: job.company,
    generatedAt: Date.now(),
  };
}

/**
 * Refine an existing cover letter: shorten, lengthen, or make more impactful.
 * Streams token-by-token via `onChunk`.
 */
export async function refineCoverLetter(
  currentText: string,
  action: 'shorten' | 'lengthen' | 'impactful',
  onChunk?: (partialText: string) => void,
): Promise<string> {
  const instructions: Record<string, string> = {
    shorten:
      'Rewrite this cover letter to be shorter and more concise. ' +
      'Cut it down to 2-3 tight paragraphs (~150-200 words). Remove filler and keep only the strongest points. ' +
      'Maintain the same tone and key selling points.',
    lengthen:
      'Expand this cover letter with more detail and depth. ' +
      'Add 1-2 additional paragraphs (~350-450 words total). Elaborate on specific achievements with metrics where possible. ' +
      'Add a stronger closing paragraph. Maintain the same professional tone.',
    impactful:
      'Rewrite this cover letter to be significantly more compelling and impactful. ' +
      'Use stronger action verbs, quantify achievements, and make the opening hook more attention-grabbing. ' +
      'Add confident language that demonstrates clear value to the employer. Same length, just more powerful.',
  };

  const prompt = `You are refining an existing cover letter.

CURRENT COVER LETTER:
${currentText}

TASK:
${instructions[action]}

Rules:
1. Output ONLY the revised cover letter text. Nothing else.
2. Do NOT include any preamble like "Here is..." or "Sure, here's the revised version...".
3. Do NOT include date, addresses, "Dear Hiring Manager", or signature — just the body.
4. Keep the same factual content about the applicant — do NOT invent new experiences.
5. Write in first person.`;

  onChunk?.('Refining cover letter…');

  let accumulated = '';
  const fullText = await aiClient.chatStream(
    [
      { role: 'system', content: 'You are an expert career counselor. Refine the cover letter precisely as instructed.' },
      { role: 'user', content: prompt },
    ],
    {
      temperature: 0.7,
      onChunk: (delta) => {
        accumulated += delta;
        onChunk?.(cleanCoverLetter(accumulated));
      },
    }
  );

  return cleanCoverLetter(fullText || accumulated);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildPrompt(profile: UserProfile, job: JobDescription): string {
  const candidateName =
    `${profile.personal.firstName} ${profile.personal.lastName}`.trim() || 'the applicant';

  const workExperience = (profile.work ?? [])
    .slice(0, 3)
    .map(
      (w) =>
        `- ${w.title} at ${w.company} (${w.startDate}–${w.endDate || 'Present'}): ${w.description || ''}`,
    )
    .join('\n');

  const skillsList = (profile.skills ?? []).slice(0, 15).join(', ');

  const education = (profile.education ?? [])
    .slice(0, 2)
    .map((e) => `- ${e.degree} in ${e.field} from ${e.school} (${e.graduationYear || ''})`)
    .join('\n');

  return `Write a professional, tailored cover letter for ${candidateName} applying for the following role.

JOB DETAILS:
Title: ${job.title}
Company: ${job.company}
Location: ${job.location || 'Not specified'}
Job Description:
${job.description.slice(0, 2500)}

APPLICANT PROFILE:
Summary: ${profile.summary || 'Experienced professional.'}
Key Skills: ${skillsList || 'Not specified'}
Recent Experience:
${workExperience || 'Not specified'}
Education:
${education || 'Not specified'}

GUIDELINES:
1. Write 3-4 concise paragraphs (under 350 words).
2. Paragraph 1: Hook the reader — express enthusiasm for the specific role at ${job.company} and state why you are a strong fit.
3. Paragraph 2: Highlight 1-2 relevant achievements from your experience that directly match the job requirements. Use concrete details.
4. Paragraph 3: Explain why ${job.company}'s mission or work appeals to you, and how your skills contribute to their goals.
5. Paragraph 4: Confident, professional closing with a call to action (look forward to discussing).
6. Do NOT invent qualifications, companies, or metrics not in the applicant's profile.
7. Tone: Confident, professional, warm — not overly stiff or generic.
8. Output ONLY the letter text (start directly with "Dear Hiring Team," or "Dear [Company] Team," and end with "Sincerely,\n${candidateName}").
9. Do not include placeholder brackets like [Your Name] — use actual values from the profile.`;
}

function cleanCoverLetter(raw: string): string {
  return raw
    .replace(/^here(?:'s| is) (?:a |the |your )?cover letter.*?:?\s*/i, '')
    .replace(/^certainly!.*?\n/i, '')
    .replace(/^sure!.*?\n/i, '')
    .replace(/```(?:markdown)?\s*/g, '')
    .replace(/```\s*$/g, '')
    .trim();
}
