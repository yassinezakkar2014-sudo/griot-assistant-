import express from "express";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();
const app = express();
app.use(express.json({ limit: "12mb" }));
app.use(express.static("."));
const port = process.env.PORT || 3000;

app.post("/api/chat", async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({ error: "OPENAI_API_KEY manquante" });
    }
    const { message, image } = req.body || {};
    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Message manquant" });
    }
    const content = [{ type: "text", text: message }];
    if (typeof image === "string" && image.startsWith("data:image/")) {
      content.push({ type: "image_url", image_url: { url: image } });
    }
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Tu es Griot, une assistante IA originale inspirée de l'esthétique futuriste wakandaise, sans prétendre être un personnage officiel. Tu réponds en français, avec chaleur, intelligence, concision et élégance. Si une image est fournie, décris seulement ce que tu peux réellement observer et signale les incertitudes."
        },
        { role: "user", content }
      ],
      max_tokens: 700
    });
    res.json({ reply: completion.choices?.[0]?.message?.content || "Je n'ai pas pu formuler de réponse." });
  } catch (error) {
    console.error("Erreur API:", error?.message || error);
    res.status(500).json({ error: "Erreur du moteur IA" });
  }
});

app.listen(port, () => console.log(`GRIOT prêt sur http://localhost:${port}`));
