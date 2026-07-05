import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

// Set up server-side body parsers
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Initialize Gemini SDK lazily to avoid startup crashes if key is initially absent
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
      throw new Error("GEMINI_API_KEY is not configured or uses placeholder. Please add your key in Settings > Secrets.");
    }
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

// REST APIs
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "Manga Recap Studio API" });
});

// Endpoint to auto-analyze script or notes to create structured manga recap timings and subtitles
app.post("/api/gemini/analyze-script", async (req, res) => {
  try {
    const { scriptText, panelCount, provider } = req.body;
    if (!scriptText) {
      return res.status(400).json({ error: "Script text is required" });
    }

    const openApiKey = process.env.OPENAI_API_KEY;
    const isUsingOpenAI = provider === "openai" || (!process.env.GEMINI_API_KEY && openApiKey && openApiKey !== "");

    if (isUsingOpenAI) {
      if (!openApiKey || openApiKey === "MY_OPENAI_API_KEY" || openApiKey === "") {
        return res.status(400).json({ error: "OPENAI_API_KEY is not configured. Please add your key in Settings > Secrets." });
      }

      const prompt = `
        You are an expert Manga Recap Video Director. 
        Analyze the following recap script or storyboard outline and break it down into exactly ${panelCount || 5} structured visual scenes matching the storyboard sequence.
        
        For each scene, design:
        1. An engaging Indonesian subtitle caption (natural, dramatic shonen/seinen manga recap style).
        2. The perfect cinematic motion style: choice of 'pan-left-to-right', 'pan-right-to-left', 'pan-top-to-bottom', 'pan-bottom-to-top', 'zoom-in', 'zoom-out', or 'shaky-action'.
        3. An estimated duration (in seconds, e.g., 4 to 8 seconds depending on the dialogue length).
        4. A short focus prompt describing what visual element of the manga panel to pay attention to.

        Recap Script Outline:
        "${scriptText}"

        You MUST respond with a JSON object containing a "scenes" array. Each item in "scenes" MUST have these exact properties:
        - "panelIndex" (number, 0-based index of the manga panel)
        - "subtitle" (string, Indonesian subtitle)
        - "motionStyle" (string, one of: 'pan-left-to-right' | 'pan-right-to-left' | 'pan-top-to-bottom' | 'pan-bottom-to-top' | 'zoom-in' | 'zoom-out' | 'shaky-action')
        - "duration" (number, duration in seconds between 3.5 and 7.5)
        - "focusGuide" (string, focus guide prompt)

        And optionally an "overallPacing" (string) describing the pace.
      `;

      const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${openApiKey}`
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: "You are an expert director helping in returning formatted storyboard JSON in response." },
            { role: "user", content: prompt }
          ],
          temperature: 0.7
        })
      });

      if (!openaiResponse.ok) {
        const errText = await openaiResponse.text();
        throw new Error(`OpenAI API Error: ${openaiResponse.status} - ${errText}`);
      }

      const openaiData = (await openaiResponse.json()) as any;
      const content = openaiData.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error("Empty response from OpenAI");
      }
      return res.json(JSON.parse(content));
    }

    const ai = getGeminiClient();
    const prompt = `
      You are an expert Manga Recap Video Director. 
      Analyze the following recap script or storyboard outline and break it down into exactly ${panelCount || 5} structured visual scenes matching the storyboard sequence.
      For each scene, design:
      1. An engaging Indonesian subtitle caption (natural, dramatic shonen/seinen manga recap style).
      2. The perfect cinematic motion style: choice of 'pan-left-to-right', 'pan-right-to-left', 'pan-top-to-bottom', 'pan-bottom-to-top', 'zoom-in', 'zoom-out', or 'shaky-action'.
      3. An estimated duration (in seconds, e.g., 4 to 8 seconds depending on the dialogue length).
      4. A short focus prompt describing what visual element of the manga panel to pay attention to.

      Recap Script Outline:
      "${scriptText}"
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          required: ["scenes"],
          properties: {
            scenes: {
              type: Type.ARRAY,
              description: "Array of storyboard scene instructions mapping sequentially to panels",
              items: {
                type: Type.OBJECT,
                required: ["panelIndex", "subtitle", "motionStyle", "duration", "focusGuide"],
                properties: {
                  panelIndex: {
                    type: Type.INTEGER,
                    description: "0-based index of the manga panel image this scene corresponds to."
                  },
                  subtitle: {
                    type: Type.STRING,
                    description: "High-impact, engaging narrative subtitle in Indonesian for the scene."
                  },
                  motionStyle: {
                    type: Type.STRING,
                    description: "Cinematic movement: 'pan-left-to-right' | 'pan-right-to-left' | 'pan-top-to-bottom' | 'pan-bottom-to-top' | 'zoom-in' | 'zoom-out' | 'shaky-action'"
                  },
                  duration: {
                    type: Type.NUMBER,
                    description: "Ideal voiceover duration for this panel in seconds (typically between 3.5 and 7.5)."
                  },
                  focusGuide: {
                    type: Type.STRING,
                    description: "Description of what is happening or where focus shines on the panel."
                  }
                }
              }
            },
            overallPacing: {
              type: Type.STRING,
              description: "Brief summary profile: e.g. Fast-paced action, Suspensely slow, Epic hype."
            }
          }
        }
      }
    });

    const parsedData = JSON.parse(response.text || "{}");
    res.json(parsedData);
  } catch (err: any) {
    console.error("Script analysis error:", err?.message);
    res.status(500).json({ error: err?.message || "Failed to analyze script with AI" });
  }
});

// Endpoint for AI Auto-Editing: detects scenes, adds transitions, and synchronizes voiceover audio with panels
app.post("/api/gemini/auto-edit", async (req, res) => {
  try {
    const { scriptText, panelCount, audioBase64, audioMimeType } = req.body;
    
    if (!panelCount || panelCount <= 0) {
      return res.status(400).json({ error: "Panel count must be greater than 0" });
    }

    const ai = getGeminiClient();
    let responseText = "";

    if (audioBase64 && audioMimeType) {
      // MULTIMODAL MODE: Analyze actual user narration audio along with text script
      const audioPart = {
        inlineData: {
          mimeType: audioMimeType,
          data: audioBase64,
        },
      };

      const prompt = `
        You are an expert AI Video Editor and Director specializing in shonen and seinen manga recap videos.
        I am giving you an audio recording of a person narrating a story, along with the text script: "${scriptText || ''}".
        There are exactly ${panelCount} visual panels in our storyboard.
        
        Your task is to automatically edit and sync this audio to our ${panelCount} storyboard slides:
        1. Parse the voiceover audio and match the spoken sentences or passages under each of the ${panelCount} panels sequentially.
        2. Detect key scenes/transitions: determine exactly how long (in seconds) each of the ${panelCount} slides should be shown to align with the spoken vocal parts.
        3. For each of the ${panelCount} scenes, auto-select a suitable camera transition or Ken Burns movement based on the emotional pace: 'zoom-in' | 'zoom-out' | 'pan-left-to-right' | 'pan-right-to-left' | 'pan-top-to-bottom' | 'pan-bottom-to-top' | 'shaky-action' | 'manga-multi-focus'.
        4. Recommend a focus point/guide (for example "Aura pedang", "Ekspresi wajah terkejut", "Gelembung dialog", "Latar belakang kuil") to center interest.

        You MUST respond with a JSON object containing a "scenes" array. Each item in "scenes" MUST map to index 0 to ${panelCount - 1} and contain:
        - "panelIndex" (integer)
        - "duration" (number of seconds, matching the exact timing of the voiceover part)
        - "motionStyle" (string, transition name: 'zoom-in' | 'zoom-out' | 'pan-left-to-right' | 'pan-right-to-left' | 'pan-top-to-bottom' | 'pan-bottom-to-top' | 'shaky-action' | 'manga-multi-focus')
        - "subtitle" (string, Indonesian transcribed text from the corresponding audio segment)
        - "focusGuide" (string, focus guide prompt)

        Additionally provide a summary "overallPacing" (string) and "aiNarratorInsight" (string, Indonesian feedback comment highlighting the sync quality and detected tone).
      `;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [audioPart, { text: prompt }],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            required: ["scenes"],
            properties: {
              scenes: {
                type: Type.ARRAY,
                description: "Sequential list of audio segments perfectly mapped to panels",
                items: {
                  type: Type.OBJECT,
                  required: ["panelIndex", "duration", "motionStyle", "subtitle", "focusGuide"],
                  properties: {
                    panelIndex: { type: Type.INTEGER },
                    duration: { type: Type.NUMBER, description: "Audio duration of spoken vocal in seconds" },
                    motionStyle: { type: Type.STRING },
                    subtitle: { type: Type.STRING, description: "Transcribed spoken caption text" },
                    focusGuide: { type: Type.STRING }
                  }
                }
              },
              overallPacing: { type: Type.STRING },
              aiNarratorInsight: { type: Type.STRING, description: "Brief Indonesian review of sync results" }
            }
          }
        }
      });

      responseText = response.text || "{}";
    } else {
      // TEXT-BASED PREDICTION MODE: Predict voice speed if no vocal recording is provided
      const prompt = `
        You are an expert AI Video Editor and Manga Recap Director.
        Analyze the following global narrative script and automatically edit a recap flow for exactly ${panelCount} storyboard panels:
        Script: "${scriptText || 'Kael membuka pedang pusaka!'}"
        
        Since we do not have an active voiceover recording file, you must predict natural human timing (around 150 words-per-minute or 2.5 words/sec) to sync the narration sentences to each individual slide:
        1. Segment the script into exactly ${panelCount} distinct dramatic blocks.
        2. Assign each block its calculated duration in seconds.
        3. Detect the scene's emotional context and designate an optimal transition: 'zoom-in', 'zoom-out', 'pan-left-to-right', 'pan-right-to-left', 'pan-top-to-bottom', 'pan-bottom-to-top', 'shaky-action', or 'manga-multi-focus'.
        4. Detail a unique focus point/action spotlight for manga frame zoom focus.

        You MUST respond with a JSON object containing a "scenes" array. Each item in "scenes" MUST map to index 0 to ${panelCount - 1} and contain:
        - "panelIndex" (integer)
        - "duration" (number)
        - "motionStyle" (string, transition name: 'zoom-in' | 'zoom-out' | 'pan-left-to-right' | 'pan-right-to-left' | 'pan-top-to-bottom' | 'pan-bottom-to-top' | 'shaky-action' | 'manga-multi-focus')
        - "subtitle" (string, Indonesian sentence mapping sequentially)
        - "focusGuide" (string)

        Provide global "overallPacing" (string) and "aiNarratorInsight" (string, a cool Indonesian directing advice from the AI editor).
      `;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            required: ["scenes"],
            properties: {
              scenes: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  required: ["panelIndex", "duration", "motionStyle", "subtitle", "focusGuide"],
                  properties: {
                    panelIndex: { type: Type.INTEGER },
                    duration: { type: Type.NUMBER },
                    motionStyle: { type: Type.STRING },
                    subtitle: { type: Type.STRING },
                    focusGuide: { type: Type.STRING }
                  }
                }
              },
              overallPacing: { type: Type.STRING },
              aiNarratorInsight: { type: Type.STRING }
            }
          }
        }
      });

      responseText = response.text || "{}";
    }

    const parsedData = JSON.parse(responseText);
    res.json(parsedData);
  } catch (err: any) {
    console.error("AI Auto-Edit logic error:", err?.message);
    res.status(500).json({ error: err?.message || "Failed to edit video with Gemini Auto-Editor" });
  }
});

// Endpoint to auto-generate Indonesian narration script from sequential manga panels
app.post("/api/gemini/generate-script", async (req, res) => {
  try {
    const { panels } = req.body;
    if (!panels || !Array.isArray(panels) || panels.length === 0) {
      return res.status(400).json({ error: "Manga panels are required for generation" });
    }

    const ai = getGeminiClient();

    const parsedPanels = panels.map((p: any, i: number) => {
      let mimeType = "image/png";
      let data = "";
      if (p.url && p.url.startsWith("data:")) {
        const match = p.url.match(/^data:(image\/[a-zA-Z+.-]+);base64,(.+)$/);
        if (match) {
          mimeType = match[1];
          data = match[2];
        }
      }
      return { mimeType, data, index: i };
    });

    const contents: any[] = [];
    contents.push({
      text: `Tugas Anda adalah menjadi narator ulung manga (recap video narrator) berbahasa Indonesia.
Kami memiliki beberapa gambar halaman manga berurutan dari storyboard kami.
Silakan analisis setiap gambar halaman manga yang dilampirkan secara berurutan sesuai nomor indeksnya (0 hingga ${parsedPanels.length - 1}) untuk menghasilkan alur cerita/narasi yang bersambung dan koheren.

PENTING - STRUKTUR GAMBAR (MULTI SUB-PANEL):
Setiap satu gambar/halaman yang dikirimkan seringkali terdiri dari beberapa kotak adegan kecil (sub-scenes/sub-panels) di dalamnya. Jangan meringkas seluruh halaman manga tersebut menjadi satu kalimat pendek saja yang membuat banyak kejadian penting terlewatkan!

SANGAT PENTING - CARA BACA & MENYUSUN ADEGAN (SCENE BY SCENE):
1. Anda wajib mencermati dan menceritakan seluruh adegan demi adegan (scene-per-scene) yang ada di dalam gambar halaman tersebut secara runut.
2. Cara membacanya adalah dari kanan ke kiri, lalu dari atas ke bawah (sesuai tata cara membaca manga Jepang asli).
3. Terangkan aksi, reaksi wajah, konflik, serta dialog dari masing-masing kotak adegan secara to-the-point dan sambungkan menjadi satu paragraf narasi halaman yang utuh dan komplit tanpa ada detail cerita yang terlewat.

ATURAN NASKAH NARASI:
1. Buat narasi dalam bahasa Indonesia sepenuhnya dari sudut pandang narator atau orang ketiga (narrator view). JANGAN gunakan sudut pandang orang pertama ("saya", "aku") atau sapaan langsung ke penonton ("kamu", "kalian").
2. Tulis naskah dengan gaya bahasa shonen/seinen recap yang menarik, dramatis, namun langsung membahas inti cerita (to the point).
3. Sangat dilarang keras untuk berbelit-belit, bertele-tele, basa-basi (seperti "Halo semuanya", "Selamat datang kembali", "Pada video kali ini kita akan membahas"), atau membuat asumsi palsu/halusinasi di luar informasi aksi visual panel manga tersebut (JANGAN halu atau berspekulasi berlebihan).
4. Pastikan teks narasi halaman tersebut merangkum seluruh jalinan rangkaian peristiwa kotak demi kotak yang ada secara dinamis dan padat.`
    });

    parsedPanels.forEach((panel: any) => {
      contents.push({
        text: `--- GAMBAR PANEL INDEKS ${panel.index} ---`
      });
      if (panel.data) {
        contents.push({
          inlineData: {
            mimeType: panel.mimeType,
            data: panel.data
          }
        });
      }
    });

    contents.push({
      text: `Berikan respons Anda dalam format JSON dengan format terstruktur sebagai berikut:
{
  "scenes": [
    {
      "panelIndex": 0,
      "narration": "Teks narasi panel 0 sesuai gambar panel indeks 0. To the point, dramatis, sudut pandang orang ketiga."
    }
  ]
}`
    });

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: contents,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          required: ["scenes"],
          properties: {
            scenes: {
              type: Type.ARRAY,
              description: "Sequential list of generated narration strings matched to panels",
              items: {
                type: Type.OBJECT,
                required: ["panelIndex", "narration"],
                properties: {
                  panelIndex: { type: Type.INTEGER },
                  narration: { type: Type.STRING, description: "To the point narrator text in Indonesian matching that panel page content" }
                }
              }
            }
          }
        }
      }
    });

    const parsedData = JSON.parse(response.text || "{}");
    res.json(parsedData);
  } catch (err: any) {
    console.error("AI Generate Script logic error:", err?.message);
    res.status(500).json({ error: err?.message || "Failed to generate script with Gemini" });
  }
});

// Setup Vite Dev Server / Static Assets
async function initializeServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Manga Recap Studio server running on http://localhost:${PORT}`);
  });
}

initializeServer();
