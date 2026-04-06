import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function analyzeImage(images: { base64: string; mimeType: string }[]) {
  const model = "gemini-3-flash-preview";
  
  const prompt = `
    Analyze these ${images.length} reference images and provide a single, detailed, and cohesive scene description for a storyboard.
    Focus on finding common elements across all images:
    1. Environment/Setting (lighting, mood, location)
    2. Characters (appearance, clothing, expression)
    3. Artistic style (cinematography, color palette)
    
    Return a single paragraph that summarizes the core scene, ensuring consistency as if all images belong to the same sequence.
  `;

  const imageParts = images.map(img => ({
    inlineData: { data: img.base64, mimeType: img.mimeType }
  }));

  const result = await ai.models.generateContent({
    model,
    contents: [
      {
        parts: [
          { text: prompt },
          ...imageParts
        ]
      }
    ]
  });

  return result.text || "一个具有专业光影效果的电影感场景。";
}

export async function inferSceneFromBoth(images: { base64: string; mimeType: string }[], shotPrompts: string) {
  const model = "gemini-3.1-pro-preview";
  
  const prompt = `
    Analyze the following ${images.length} high-definition reference images AND the storyboard shot descriptions (up to 10 shots) provided below:
    
    Shot Descriptions:
    "${shotPrompts}"
    
    Your task is to conduct a deep, comprehensive analysis to reverse-engineer a single, highly detailed "Master Scene" description.
    
    Analysis Requirements:
    1. Visual Synthesis: Extract and unify visual cues from all ${images.length} images (environment, lighting, character features, color palette).
    2. Narrative Integration: Incorporate all narrative details and specific actions from the provided shot descriptions.
    3. Consistency Protocol: Ensure the inferred scene description is robust enough to maintain absolute consistency across a 9-frame storyboard grid.
    
    Focus on:
    - Environment/Setting: Precise lighting (e.g., golden hour, neon noir), specific location details, and key props.
    - Characters: Detailed physical appearance, specific attire, consistent facial features, and emotional state.
    - Artistic Direction: Cinematography style, specific color grading, and overall visual mood.
    
    Return a single, professional, and dense paragraph that summarizes the entire scene. This description will be the foundation for generating consistent AI image prompts.
  `;

  const imageParts = images.map(img => ({
    inlineData: { data: img.base64, mimeType: img.mimeType }
  }));

  const result = await ai.models.generateContent({
    model,
    contents: [
      {
        parts: [
          { text: prompt },
          ...imageParts
        ]
      }
    ]
  });

  return result.text || "一个结合了图片参考和分镜描述的深度电影感场景。";
}

export async function generateStoryboardPrompt(description: string, category: string) {
  const model = "gemini-3-flash-preview";
  
  const prompt = `
    Based on the following description: "${description}"
    And the shot category: "${category}"
    
    Generate a professional storyboard prompt in the following format:
    
    For English (en):
    "Based on [description], generate a professional [3x3] storyboard grid (3 rows and 3 columns). The grid must contain exactly [9] distinct camera shots in a single environment. Each shot must be a separate frame within the grid. Maintain absolute consistency in character appearance, attire, and lighting across all 9 frames. All frames must have identical dimensions. Style: Cinematic film contact sheet, 8K resolution, 16:9 aspect ratio.
    
    Shot 01: [Description]
    Shot 02: [Description]
    ...
    Shot 09: [Description]"
    
    For Chinese (zh):
    "根据 [description]，生成一张专业的 [3x3] 分镜网格图（3 行 3 列）。该网格必须包含且仅包含 [9] 个在同一环境下的不同摄像机镜头。每个镜头必须是网格中的独立画框。严格保持所有 9 个画框中人物形象、服装和光线的高度一致。所有画框必须具有完全相同的尺寸。风格：电影胶片接触表 (film contact sheet)，8K 分辨率，16:9 画幅。
    
    镜头 01: [描述]
    镜头 02: [描述]
    ...
    镜头 09: [描述]"
    
    Make the shots diverse (e.g., wide, medium, close-up, extreme close-up, over-the-shoulder, low angle, etc.) while keeping the scene consistent.
    
    Provide the output as a JSON object:
    {
      "en": "Full English prompt text...",
      "zh": "Full Chinese prompt text..."
    }
  `;

  const result = await ai.models.generateContent({
    model,
    contents: [{ parts: [{ text: prompt }] }],
    config: {
      responseMimeType: "application/json"
    }
  });

  try {
    return JSON.parse(result.text || "{}");
  } catch (e) {
    console.error("Failed to parse Gemini response", e);
    return { en: "Error generating prompt", zh: "生成提示词出错" };
  }
}
