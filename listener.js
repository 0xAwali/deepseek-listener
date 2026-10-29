const $ = (id) => document.getElementById(id);
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

let rec = null;
let running = false;
let buffer = "";
let timer = null;
let captureStream = null; // stream from getDisplayMedia (meeting tab)
let audioTrack = null;
let keepAlive = null;     // audio element that keeps captured audio flowing
let restartCount = 0;

function log(text) {
  const d = document.createElement("div");
  d.textContent = text;
  $("log").appendChild(d);
  $("log").scrollTop = $("log").scrollHeight;
}

// ---------- settings ----------
chrome.storage.local.get(
  { source: "tab", lang: "en-US", prefix: $("prefix").value, silence: 2, autoSend: true },
  (s) => {
    $("source").value = s.source;
    $("lang").value = s.lang;
    $("prefix").value = s.prefix;
    $("silence").value = s.silence;
    $("autoSend").checked = s.autoSend;
    updateHint();
  }
);

function saveSettings() {
  chrome.storage.local.set({
    source: $("source").value,
    lang: $("lang").value,
    prefix: $("prefix").value,
    silence: Number($("silence").value) || 2,
    autoSend: $("autoSend").checked
  });
}
["source", "lang", "prefix", "silence", "autoSend"].forEach((id) => {
  $(id).addEventListener("change", saveSettings);
  $(id).addEventListener("input", saveSettings); // save text edits immediately
});
$("source").addEventListener("change", updateHint);

function updateHint() {
  $("sourceHint").style.display = $("source").value === "tab" ? "block" : "none";
}

// ---------- sending ----------
function flush() {
  const text = buffer.trim();
  buffer = "";
  if (!text) return;
  log("➡️ Heard: " + text);
  chrome.runtime.sendMessage({ type: "ask", text: $("prefix").value + text }, (res) => {
    if (chrome.runtime.lastError) {
      log("⚠️ " + chrome.runtime.lastError.message);
      return;
    }
    if (res && !res.ok) log("⚠️ " + res.error);
  });
}

// ---------- capture ----------
async function getMeetingAudioTrack() {
  // User picks the meeting tab and ticks "Also share tab audio".
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: true, // Chrome requires video to be requested
    audio: true
  });
  const track = stream.getAudioTracks()[0];
  if (!track) {
    stream.getTracks().forEach((t) => t.stop());
    throw new Error('No audio was shared. Choose the meeting TAB and tick "Also share tab audio".');
  }
  // We only need audio; drop the video track to save resources.
  stream.getVideoTracks().forEach((t) => t.stop());
  captureStream = stream;

  // The share ends if the user clicks "Stop sharing" in Chrome's bar.
  track.addEventListener("ended", () => {
    log("Tab sharing ended.");
    if (running) stop();
  });

  // Recognition only works while the track's audio is actually being consumed.
  keepAlive = new Audio();
  keepAlive.srcObject = new MediaStream([track]);
  keepAlive.muted = true; // the meeting tab itself still plays sound normally
  keepAlive.play().catch(() => {});
  return track;
}

async function ensureMicPermission() {
  // Extension pages need an explicit permission grant before SpeechRecognition can use the mic.
  const s = await navigator.mediaDevices.getUserMedia({ audio: true });
  s.getTracks().forEach((t) => t.stop());
}

function beginRecognition() {
  if (audioTrack) rec.start(audioTrack);
  else rec.start();
}

function startRecognition() {
  rec = new SR();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = $("lang").value;

  rec.onresult = (e) => {
    restartCount = 0;
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) buffer += r[0].transcript + " ";
      else interim += r[0].transcript;
    }
    $("status").textContent = "Listening… " + interim;
    clearTimeout(timer);
    timer = setTimeout(flush, (Number($("silence").value) || 2) * 1000);
  };

  rec.onerror = (e) => {
    if (e.error === "not-allowed" || e.error === "service-not-allowed") {
      log("Permission denied for speech recognition.");
      stop();
    } else if (e.error === "language-not-supported") {
      log("This language is not supported for this audio source.");
      stop();
    } else if (e.error === "network") {
      log("Network error: Chrome's speech service is unreachable.");
      stop();
    } else if (e.error !== "no-speech" && e.error !== "aborted") {
      log("Error: " + e.error);
    }
  };

  // Chrome ends recognition now and then; restart while we're still running
  rec.onend = () => {
    if (!running) return;
    if (++restartCount > 50) {
      log("Recognition keeps stopping; giving up.");
      stop();
      return;
    }
    setTimeout(() => {
      if (!running) return;
      try {
        beginRecognition();
      } catch (err) {
        log("Could not restart: " + err.message);
        stop();
      }
    }, 300);
  };

  beginRecognition();
}

async function start() {
  if (!SR) {
    $("status").textContent = "Speech recognition is not supported in this browser.";
    return;
  }
  try {
    audioTrack = null;
    restartCount = 0;
    if ($("source").value === "tab") {
      audioTrack = await getMeetingAudioTrack();
    } else {
      await ensureMicPermission();
    }
    running = true;
    startRecognition();
    $("toggle").textContent = "Stop listening";
    $("toggle").classList.add("stop");
    $("status").textContent = audioTrack ? "Listening to meeting audio…" : "Listening to microphone…";
  } catch (err) {
    running = false;
    cleanupCapture();
    $("status").textContent = "Could not start.";
    log("⚠️ " + (err && err.message ? err.message : err));
  }
}

function cleanupCapture() {
  if (keepAlive) {
    keepAlive.pause();
    keepAlive.srcObject = null;
    keepAlive = null;
  }
  if (captureStream) {
    captureStream.getTracks().forEach((t) => t.stop());
    captureStream = null;
  }
  audioTrack = null;
}

function stop() {
  running = false;
  clearTimeout(timer);
  flush();
  if (rec) {
    try { rec.stop(); } catch (_) {}
  }
  cleanupCapture();
  $("toggle").textContent = "Start listening";
  $("toggle").classList.remove("stop");
  $("status").textContent = "Idle";
}

$("toggle").addEventListener("click", () => (running ? stop() : start()));
