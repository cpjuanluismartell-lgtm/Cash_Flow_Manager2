import { GoogleGenAI, Type } from "@google/genai";

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  console.warn("Gemini API key not found. Concept extraction will be disabled.");
}

const ai = API_KEY ? new GoogleGenAI({ apiKey: API_KEY }) : null;

export const extractConceptFromDescription = async (description: string): Promise<string> => {
  if (!ai) {
    return 'API Key no configurada';
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `From the following bank transaction description, extract a concise concept or summary in Spanish. The concept should be no more than 3 words. Description: "${description}". Respond with only the concept.`,
    });
    
    return response.text.trim();
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    return "Error al generar concepto";
  }
};


export const extractConceptsFromDescriptionsBatch = async (descriptions: string[]): Promise<string[]> => {
  if (!ai || descriptions.length === 0) {
    return descriptions.map(() => 'API Key no configurada');
  }

  const prompt = `For each of the following bank transaction descriptions, provide a concise summary or concept in Spanish, no more than 3 words each.

  Input Descriptions:
  ${descriptions.map(d => `- ${d}`).join('\n')}
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            concepts: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'An array of concise concepts, one for each input description, in the same order.'
            }
          },
          required: ['concepts']
        },
      },
    });

    const jsonResponse = JSON.parse(response.text);
    const concepts = jsonResponse.concepts;

    if (Array.isArray(concepts) && concepts.length === descriptions.length) {
      return concepts.map(c => String(c));
    } else {
      console.error("Mismatched concept count from Gemini API batch call.", { expected: descriptions.length, received: concepts?.length });
      return descriptions.map(() => "Error en respuesta de IA");
    }
  } catch (error) {
    console.error("Error calling Gemini API in batch:", error);
    return descriptions.map(() => "Error al generar concepto");
  }
};
