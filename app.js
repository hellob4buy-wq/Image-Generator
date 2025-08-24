const $ = (s) => document.querySelector(s);
const serverUrlInput = $("#serverUrl");
const providerSel = $("#provider");
const modeSel = $("#mode");
const promptEl = $("#prompt");
const sizeSel = $("#size");
const stepsEl = $("#steps");
const imageUpload = $("#imageUpload");
const imgUploadField = $("#imgUploadField");
const statusEl = $("#status");
const resultImg = $("#resultImg");
const downloadBtn = $("#downloadBtn");
const makeVideoBtn = $("#makeVideoBtn");
const videoCanvas = $("#videoCanvas");
const videoDownloadLink = $("#videoDownloadLink");

serverUrlInput.value = "https://your-server.fly.dev";

modeSel.addEventListener("change", () => {
  imgUploadField.style.display = modeSel.value === "img2img" ? "block" : "none";
  if (modeSel.value === "img2img" && providerSel.value !== "hf") providerSel.value = "hf";
});

$("#clearBtn").addEventListener("click", () => {
  promptEl.value = "";
  resultImg.src = "";
  resultImg.style.display = "none";
  downloadBtn.disabled = true;
  makeVideoBtn.disabled = true;
  status("Idle");
});

function status(msg){ statusEl.textContent = msg; }

async function generateWithPollinations(prompt){ 
  const [w,h] = sizeSel.value.split("x").map(Number);
  const seed = Math.abs(hashCode(prompt + Date.now()));
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${w}&height=${h}&seed=${seed}`;
  resultImg.crossOrigin = "anonymous";
  resultImg.src = url;
  await new Promise((res,rej)=>{ resultImg.onload=res; resultImg.onerror=rej; });
  return url;
}

async function generateWithHF(prompt, mode){
  const base = (serverUrlInput.value || "").replace(/\/$/,"");
  const [w,h] = sizeSel.value.split("x").map(Number);
  if (!base) throw new Error("Set Server URL to use Hugging Face");
  if (mode === "text2img"){
    const body = { prompt, width: w, height: h, steps: Number(stepsEl.value || 20) };
    const res = await fetch(`${base}/api/generate`, { method: "POST", headers: { "Content-Type":"application/json" }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(await res.text());
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  } else {
    const file = imageUpload.files[0];
    if (!file) throw new Error("Select reference image for img2img");
    const form = new FormData();
    form.append("prompt", prompt);
    form.append("width", w);
    form.append("height", h);
    form.append("image", file);
    form.append("steps", stepsEl.value || 20);
    const res = await fetch(`${base}/api/img2img`, { method: "POST", body: form });
    if (!res.ok) throw new Error(await res.text());
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  }
}

$("#generateBtn").addEventListener("click", async () => {
  const prompt = (promptEl.value || "").trim();
  if (!prompt) { status("Enter a prompt"); return; }
  status("Generating...");
  resultImg.style.display="none";
  downloadBtn.disabled = true; makeVideoBtn.disabled = true; videoDownloadLink.style.display="none";
  try {
    let url;
    if (providerSel.value === "pollinations") {
      url = await generateWithPollinations(prompt);
    } else {
      url = await generateWithHF(prompt, modeSel.value);
    }
    resultImg.src = url; resultImg.style.display="block";
    downloadBtn.disabled = false; makeVideoBtn.disabled = false;
    status("Done — refine prompt for variations");
  } catch (e) {
    console.error(e); status("Error: " + (e.message||e));
  }
});

downloadBtn.addEventListener("click", ()=>{
  if (!resultImg.src) return;
  const a=document.createElement("a"); a.href=resultImg.src; a.download="artforge.png"; document.body.appendChild(a); a.click(); a.remove();
});

makeVideoBtn.addEventListener("click", async ()=>{
  if (!resultImg.src) return; status("Rendering video...");
  const [w,h] = sizeSel.value.split("x").map(Number);
  videoCanvas.width = w; videoCanvas.height = h;
  const ctx = videoCanvas.getContext("2d");
  const fps = 30; const duration = 3; const frames = fps * duration;
  const img = new Image(); img.crossOrigin="anonymous"; img.src = resultImg.src; await img.decode();
  const stream = videoCanvas.captureStream(fps); const recorder = new MediaRecorder(stream,{mimeType:"video/webm"}); const chunks=[];
  recorder.ondataavailable = e=>chunks.push(e.data); recorder.start();
  for (let i=0;i<frames;i++){
    const p = i/frames;
    const scale = 1 + p*0.08;
    const drawW = w*scale, drawH = h*scale;
    const dx = -(drawW-w)/2 + (p-0.5)*0.1*w;
    const dy = -(drawH-h)/2 + (0.5-p)*0.08*h;
    ctx.clearRect(0,0,w,h); ctx.drawImage(img, dx, dy, drawW, drawH);
    await new Promise(r=>setTimeout(r,1000/fps));
  }
  recorder.stop();
  const blob = await new Promise(res=>recorder.onstop=()=>res(new Blob(chunks,{type:"video/webm"})));
  const url = URL.createObjectURL(blob); videoDownloadLink.href=url; videoDownloadLink.style.display="inline-block"; status("Video ready");
});

function hashCode(s){let h=0; for(let i=0;i<s.length;i++){h=(h<<5)-h+s.charCodeAt(i)|0;} return h;}
