# AI Image & Video Generator — Branded + Free-server Integration

This repo is a tailored (UI & branding) version of the AI Image + simple Video generator with a production-ready server integration focusing on **best ultra-realistic results** while using free services where possible.

Key features:
- Polished UI with brand colors, logo placeholder and UX improvements.
- Multi-provider generation: **Pollinations (free)** as fallback, **Hugging Face Inference (SDXL / SDXL-Turbo)** for ultra-realistic outputs (via server proxy).
- Server includes a Dockerfile + `fly.toml` to deploy on **Fly.io** (free tier) and instructions for Vercel/Netlify for the client.
- Rate-limit friendly: server caches small images and returns clear errors on quota issues; you can upgrade to paid tiers later for higher throughput.

---

See `client/` and `server/` folders for full code.

Sources & notes:
- Pollinations is free and open-source. citeturn0search6turn0search2
- Hugging Face provides Inference Providers with a free tier but limits can change; SDXL / SDXL-Turbo are excellent for photorealistic images. citeturn0search4turn1search0turn1search9
- Fly.io and Vercel are commonly used free hosting options for servers and static clients respectively. citeturn0search3turn0search19

