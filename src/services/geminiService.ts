import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface TweetRequest {
  role: string;
  topic: string;
  tone: 'friendly' | 'like a story' | 'emotional';
}

export interface TweetIdea {
  type: 'Hook' | 'Story' | 'Lesson' | 'Thread-start';
  content: string;
}

export interface GenerationResult {
  header: string;
  ideas: TweetIdea[];
}

export async function generateTweetIdeas(request: TweetRequest): Promise<GenerationResult> {
  const { role, topic, tone } = request;

  const toneInstructions = {
    friendly: "Warm, approachable, and encouraging. Use more conversational flow.",
    'like a story': "Narrative-driven, cinematic, and descriptive. Build suspense and resolution.",
    emotional: "Deeply human, vulnerable, and passionate. Focus on the 'why' and the feeling."
  };

  const systemInstruction = `You are a professional X (Twitter) ghostwriter for Silicon Valley startup founders. 
Your goal is to help founders turn ideas into viral-potential tweets and threads. 
Avoid buzzword spam, generic "hustle culture" tropes, and excessive emojis.

TASK:
1. Generate exactly 10-15 short tweet ideas.
2. Label each tweet: Hook, Story, or Lesson.
3. Generate exactly 3 short "thread-start" options.

OUTPUT FORMAT:
You MUST return a JSON object with the following structure:
{
  "header": "Here are X-tweet ideas for a [Role] who [Topic]",
  "ideas": [
    { "type": "Hook", "content": "..." },
    { "type": "Story", "content": "..." },
    { "type": "Lesson", "content": "..." },
    { "type": "Thread-start", "content": "..." }
  ]
}

Tone Guidance: ${toneInstructions[tone]}
Role: ${role}
Topic: ${topic}`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Generate ideas for: ${role} exploring ${topic}`,
      config: {
        systemInstruction,
        temperature: 0.7,
        responseMimeType: "application/json"
      },
    });

    const text = response.text;
    return JSON.parse(text);
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
}
