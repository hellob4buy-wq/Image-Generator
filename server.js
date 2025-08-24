import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import multer from "multer";
import dotenv from "dotenv";
import LRU from "lru-cache";
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "15mb" }));
const upload = multer({ storage: multer.memoryStorage() });

const PORT = process.env.PORT || 8787;
const HF_KEY = process.env.HUGGINGFACE_API_KEY || "";
const HF_MODEL = process.env.HF_MODEL || "stabilityai/sdxl-turbo"; // recommended for photorealism

// small in-memory cache to reduce repeat calls (memory-light)
const cache = new LRU({ max: 200, ttl: 1000 * 60 * 5 }); // 5 minutes

function bufferFromArrayBuffer(ab){ return Buffer.from(ab); }

async function callHf(model, payload, isBuffer=false){
  if (!HF_KEY) return { error: "Missing HUGGINGFACE_API_KEY in environment" };
  const url = `https://api-inference.huggingface.co/models/${model}`;
  const headers = { Authorization: `Bearer ${HF_KEY}` };
  if (!isBuffer) headers["Content-Type"] = "application/json";
  const res = await fetch(url, { method: "POST", headers, body: isBuffer ? payload : JSON.stringify(payload) });
  if (!res.ok){
    const t = await res.text();
    return { error: `HF ${res.status}: ${t}` };
  }
  const arr = await res.arrayBuffer();
  return { buffer: bufferFromArrayBuffer(arr) };
}

// Pollinations fallback (no key)
function pollinationsUrl(prompt, width=768, height=768){
  const seed = Math.abs([...prompt].reduce((a,c)=>a+ c.charCodeAt(0),0));
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&seed=${seed}`;
}

app.get("/", (_req,res)=> res.send("ArtForge server up"));

app.post("/api/generate", async (req,res)=>{
  try{
    const { prompt, width=768, height=768, steps=20, provider="hf" } = req.body || {};
    if (!prompt) return res.status(400).send("Missing prompt");
    const key = `g:${provider}:${prompt}:${width}:${height}:${steps}`;
    if (cache.has(key)) return res.setHeader("Content-Type","image/png") & res.send(cache.get(key));

    if (provider === "pollinations"){
      const url = pollinationsUrl(prompt,width,height);
      const out = await fetch(url);
      if (!out.ok) return res.status(502).send("Pollinations fetch failed");
      const buf = Buffer.from(await out.arrayBuffer());
      cache.set(key, buf);
      res.setHeader("Content-Type","image/png"); return res.send(buf);
    }

    // Default: Hugging Face
    const payload = { inputs: prompt, parameters: { width: Number(width), height: Number(height), steps: Number(steps) } };
    const { buffer, error } = await callHf(process.env.HF_MODEL || HF_MODEL, payload);
    if (error){
      // fallback to pollinations if HF fails
      console.error("HF error:", error);
      const url = pollinationsUrl(prompt,width,height);
      const out = await fetch(url);
      if (!out.ok) return res.status(502).send("HF failed and Pollinations fallback failed");
      const buf = Buffer.from(await out.arrayBuffer());
      cache.set(key, buf);
      return res.setHeader("Content-Type","image/png"), res.send(buf);
    }
    cache.set(key, buffer);
    res.setHeader("Content-Type","image/png"); res.send(buffer);
  }catch(e){ console.error(e); res.status(500).send("Server error"); }
});

app.post("/api/img2img", upload.single("image"), async (req,res)=>{
  try{
    const { prompt, width=768, height=768, steps=20 } = req.body || {};
    if (!prompt) return res.status(400).send("Missing prompt");
    if (!req.file) return res.status(400).send("Missing image file");
    const key = `i:${prompt}:${req.file.size}`;
    if (cache.has(key)) return res.setHeader("Content-Type","image/png") & res.send(cache.get(key));

    // Build multipart payload for HF (image + inputs)
    const boundary = "----ArtForgeBoundary" + Math.random().toString(16).slice(2);
    const CRLF = "\r\n";
    const parts = [];
    parts.push(Buffer.from(`--${boundary}${CRLF}Content-Disposition: form-data; name="image"; filename="img.png"${CRLF}Content-Type: ${req.file.mimetype}${CRLF}${CRLF}`));
    parts.push(req.file.buffer); parts.push(Buffer.from(CRLF));
    const inputs = { inputs: prompt, parameters: { width: Number(width), height: Number(height), steps: Number(steps) } };
    parts.push(Buffer.from(`--${boundary}${CRLF}Content-Disposition: form-data; name="inputs"${CRLF}${CRLF}${JSON.stringify(inputs)}${CRLF}`));
    parts.push(Buffer.from(`--${boundary}--${CRLF}`));
    const body = Buffer.concat(parts);

    const url = `https://api-inference.huggingface.co/models/${process.env.HF_MODEL || HF_MODEL}`;
    if (!HF_KEY) return res.status(500).send("Missing HUGGINGFACE_API_KEY");

    const r = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}`, "Content-Type": `multipart/form-data; boundary=${boundary}` }, body });
    if (!r.ok){
      const t = await r.text();
      console.error("HF img2img error", t);
      return res.status(500).send("HF img2img failed: " + t);
    }
    const arr = await r.arrayBuffer(); const buf = Buffer.from(arr);
    cache.set(key, buf); res.setHeader("Content-Type","image/png"); res.send(buf);
  }catch(e){ console.error(e); res.status(500).send("Server error"); }
});

app.listen(PORT, ()=> console.log("Server listening on", PORT));
