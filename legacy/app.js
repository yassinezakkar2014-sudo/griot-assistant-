const $ = (id) => document.getElementById(id);
const messages = $('messages');
let mediaStream = null;
let recognition = null;
let listening = false;
let busy = false;
const statusMap = {
  ready: ['SYSTÈME PRÊT', 'EN ATTENTE'],
  listening: ['ÉCOUTE ACTIVE', 'JE VOUS ÉCOUTE'],
  thinking: ['TRAITEMENT', 'ANALYSE EN COURS'],
  speaking: ['RÉPONSE VOCALE', 'JE VOUS RÉPONDS'],
  error: ['ACTION REQUISE', 'VÉRIFIER LE MICRO']
};
function setStatus(state) {
  const pair = statusMap[state] || statusMap.ready;
  $('statusText').textContent = pair[0];
  $('orbLabel').textContent = pair[1];
  document.body.classList.toggle('listening', state === 'listening');
  document.body.classList.toggle('thinking', state === 'thinking');
  $('statusLight').style.background = state === 'error' ? '#ff718b' : state === 'listening' ? '#8be9f0' : '#8be9b2';
}
function now() { return new Date().toLocaleTimeString('fr-FR', {hour:'2-digit', minute:'2-digit'}).toUpperCase(); }
function addMessage(text, who='assistant') {
  const row = document.createElement('div'); row.className = `message ${who}`;
  const avatar = document.createElement('div'); avatar.className='avatar'; avatar.textContent = who==='assistant'?'G':'Y';
  const wrap = document.createElement('div'); wrap.className='bubble-wrap';
  const speaker = document.createElement('div'); speaker.className='speaker'; speaker.innerHTML = who==='assistant' ? 'GRIOT <span>• ASSISTANTE</span>' : 'VOUS';
  const bubble = document.createElement('div'); bubble.className='bubble'; bubble.textContent=text;
  const time = document.createElement('div'); time.className='time'; time.textContent=now();
  wrap.append(speaker,bubble,time); row.append(avatar,wrap); messages.append(row); messages.scrollTop=messages.scrollHeight; return bubble;
}
function speak(text) {
  if (!$('voiceToggle').checked || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang='fr-FR'; utterance.rate=0.94; utterance.pitch=1.08;
  const voices = window.speechSynthesis.getVoices();
  const preferred = voices.find(v => /fr[-_]FR/i.test(v.lang) && /female|femme|audrey|am[eé]lie|julie|hortense|marie/i.test(v.name))
    || voices.find(v => /fr[-_]FR/i.test(v.lang) && /Google français|Microsoft Denise|French/i.test(v.name))
    || voices.find(v => /fr/i.test(v.lang));
  if (preferred) utterance.voice=preferred;
  utterance.onstart=()=>setStatus('speaking');
  utterance.onend=()=>setStatus('ready');
  window.speechSynthesis.speak(utterance);
}
async function askServer(text, imageData) {
  try {
    const response = await fetch('/api/chat', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({message:text, image:imageData || null})
    });
    if (!response.ok) throw new Error('Serveur IA indisponible');
    const data = await response.json();
    if (!data.reply) throw new Error('Réponse vide');
    return data.reply;
  } catch (e) {
    if (location.protocol === 'file:') return null;
    throw e;
  }
}
async function sendMessage(text, imageData=null) {
  text = text.trim(); if (!text || busy) return;
  addMessage(text,'user'); $('userInput').value=''; busy=true; setStatus('thinking');
  const placeholder = addMessage('Je réfléchis…');
  try {
    const reply = await askServer(text, imageData);
    if (reply) { placeholder.textContent=reply; speak(reply); }
    else {
      placeholder.textContent = 'Je suis bien présente dans cette interface, mais mon moteur IA n’est pas connecté. Lance le serveur local et ajoute ta clé API dans le fichier .env pour activer les vraies réponses. Je peux déjà lire les réponses à voix haute et utiliser les fonctions micro/caméra de ton navigateur.';
      speak('Mon interface fonctionne, mais mon moteur d’intelligence artificielle doit encore être connecté.');
    }
  } catch (e) {
    placeholder.textContent = 'Je ne parviens pas à joindre le moteur IA. Vérifie que le serveur est lancé et que la clé API est configurée.';
    setStatus('error');
  } finally { busy=false; if (!listening) setTimeout(()=>setStatus('ready'), 500); }
}
$('chatForm').addEventListener('submit', e=>{e.preventDefault();sendMessage($('userInput').value);});
$('userInput').addEventListener('keydown', e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();$('chatForm').requestSubmit();}});
$('clearBtn').addEventListener('click',()=>{messages.innerHTML='';addMessage('Conversation effacée. Je suis prête pour une nouvelle session.');});
$('voiceToggle').addEventListener('change',e=>{if(!e.target.checked&&'speechSynthesis'in window)window.speechSynthesis.cancel();});
function stopListening() {
  listening=false; $('micLabel').textContent='Parler à Griot'; $('audioState').textContent='Inactif'; $('audioLed').classList.remove('on');
  if (recognition) { try { recognition.stop(); } catch {} }
  recognition=null; setStatus('ready');
}
$('micBtn').addEventListener('click',()=>{
  if(listening){stopListening();return;}
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){addMessage('La reconnaissance vocale n’est pas prise en charge par ce navigateur. Essaie la dernière version de Chrome ou Edge, ou écris ton message.');return;}
  recognition=new SR(); recognition.lang='fr-FR'; recognition.interimResults=false; recognition.continuous=false;
  recognition.onstart=()=>{listening=true;$('micLabel').textContent='Arrêter l’écoute';$('audioState').textContent='Écoute active';$('audioLed').classList.add('on');setStatus('listening');};
  recognition.onresult=e=>{const transcript=e.results[0][0].transcript;stopListening();sendMessage(transcript);};
  recognition.onerror=e=>{stopListening();if(e.error!=='no-speech')addMessage('Le microphone n’a pas pu démarrer ('+e.error+'). Vérifie les autorisations du navigateur.');};
  recognition.onend=()=>{if(listening)stopListening();};
  try{recognition.start();}catch{addMessage('Impossible de démarrer le microphone. Réessaie et vérifie les autorisations du navigateur.');}
});
$('cameraBtn').addEventListener('click',async()=>{
  if(mediaStream){stopCamera();return;}
  if(!navigator.mediaDevices?.getUserMedia){addMessage('La caméra nécessite un navigateur compatible et une page HTTPS ou localhost.');return;}
  try{
    mediaStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user'},audio:false});
    $('cameraVideo').srcObject=mediaStream;$('cameraVideo').hidden=false;document.querySelector('.camera-placeholder').hidden=true;
    $('cameraBtn').querySelector('.btn-icon').textContent='×';$('cameraLabel').textContent='Désactiver la caméra';
    $('visionState').textContent='Activée';$('visionLed').classList.add('on');$('stopCameraBtn').disabled=false;
    addMessage('Caméra activée avec votre autorisation. L’image reste dans l’aperçu local. Pour me demander d’analyser ce que vous montrez, écrivez « Que vois-tu ? » : une capture sera envoyée au serveur IA configuré.');
  }catch(e){addMessage('Accès à la caméra refusé ou impossible. Autorise la caméra dans les réglages du navigateur.');}
});
function stopCamera(){
  if(mediaStream)mediaStream.getTracks().forEach(t=>t.stop());mediaStream=null;
  $('cameraVideo').srcObject=null;$('cameraVideo').hidden=true;document.querySelector('.camera-placeholder').hidden=false;
  $('cameraBtn').querySelector('.btn-icon').textContent='⌗';$('cameraLabel').textContent='Activer la caméra';
  $('visionState').textContent='Désactivée';$('visionLed').classList.remove('on');$('stopCameraBtn').disabled=true;
}
$('stopCameraBtn').addEventListener('click',stopCamera);
async function captureFrame(){
  if(!mediaStream) return null;
  const video=$('cameraVideo'); if(!video.videoWidth)return null;
  const canvas=document.createElement('canvas');canvas.width=video.videoWidth;canvas.height=video.videoHeight;
  canvas.getContext('2d').drawImage(video,0,0);return canvas.toDataURL('image/jpeg',0.75);
}
// If user asks what the camera sees, capture only after the user explicitly sends that message.
const originalSend=sendMessage;
sendMessage = async function(text){
  let imageData=null;
  if(mediaStream && /que vois[- ]tu|qu['’]est-ce que tu vois|analyse (la|ce que|cette) (cam[eé]ra|image|sc[eè]ne)|décris ce que tu vois/i.test(text)) imageData=await captureFrame();
  return originalSend(text,imageData);
};
if('speechSynthesis' in window)window.speechSynthesis.getVoices();
