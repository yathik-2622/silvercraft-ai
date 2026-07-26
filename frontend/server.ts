import express from "express";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import { createServer as createViteServer } from "vite";
import httpProxy from "http-proxy";

dotenv.config({ path: ".env.local" });

const app = express();
const PORT = 3002;
const FASTAPI_URL = process.env.FASTAPI_URL || "http://localhost:8080";

app.use(express.json({ limit: "10mb" }));

// ─── Proxy /api/v1/* → FastAPI backend ───────────────────────
const proxy = httpProxy.createProxyServer({ target: FASTAPI_URL, changeOrigin: true });

proxy.on("error", (err, _req, res: any) => {
  console.warn("[Proxy] FastAPI unreachable:", err.message);
  if (!res.headersSent) {
    res.status(503).json({ error: "Backend (FastAPI) is unavailable. Run: uvicorn backend.main:app --reload" });
  }
});

app.use("/api/v1", (req, res) => {
  proxy.web(req, res);
});

// ─── Gemini AI lazy init ─────────────────────────────────────
function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { "User-Agent": "aistudio-build" } },
  });
}

// ─── Health check ────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    hasApiKey: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "MY_GEMINI_API_KEY"),
    fastapiProxy: FASTAPI_URL,
  });
});

// ─── Gemini AI Chat ─────────
app.post("/api/ai/chat", async (req, res) => {
  try {
    const { prompt, currentStage, domain, modelingStyle, implementationMode, constraints, schemaContext, globalContext, skillFiles } = req.body;
    const ai = getGeminiClient();

    if (!ai) {
      return res.status(503).json({ error: "Gemini API key is not configured. Set GEMINI_API_KEY or use the FastAPI orchestrator route." });
    }

    const skillFilesSummary = Array.isArray(skillFiles) && skillFiles.length > 0
      ? skillFiles.map((s: any) => `=== SKILL FILE: ${s.name} ===\n${(s.content || "").slice(0, 1500)}`).join("\n\n")
      : "No skill files uploaded.";

    const systemInstruction = `You are SilverCraft AI, an enterprise data modeling assistant specializing in Medallion Architecture (Bronze→Silver→Gold), 3NF normalization, Data Vault 2.0, and Kimball dimensional modeling.
Current Stage: ${currentStage || "Source Analysis"} | Domain: ${domain || "E-Commerce"} | Style: ${modelingStyle || "3NF"}
Schema: ${JSON.stringify(schemaContext || {}).slice(0, 1500)}
Skills:\n${skillFilesSummary}
Respond concisely with structured, actionable advice. Use markdown.`;

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
      config: { systemInstruction, temperature: 0.7 },
    });

    return res.json({ reply: response.text || "Canvas updated. Review and proceed.", source: "gemini" });
  } catch (error: any) {
    console.error("AI Chat Error:", error);
    res.status(500).json({ error: "Failed to generate AI response", details: error.message });
  }
});

// ─── Dev / Prod server start ─────────────────────────────────
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => res.sendFile(path.join(distPath, "index.html")));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`\n🚀 SilverCraft AI running on http://localhost:${PORT}`);
    console.log(`   FastAPI proxy: ${FASTAPI_URL}/api/v1/*`);
    console.log(`   Gemini AI: ${process.env.GEMINI_API_KEY ? "✅ Configured" : "not configured"}\n`);
  });
}

startServer();



