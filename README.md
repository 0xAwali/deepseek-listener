# DeepSeek Voice Listener (Chrome extension)

Hears the **other people in your meeting** (tab audio) or your mic → transcribes → types into https://chat.deepseek.com (web, no API) → optionally presses Send.

## Install
1. Open `chrome://extensions`, turn on **Developer mode**
2. **Load unpacked** → select this folder (if updating, click the reload icon on the extension)
3. Log in to https://chat.deepseek.com in a tab
4. Open your meeting in another Chrome tab (Google Meet, Zoom/Teams web, YouTube...)
5. Click the extension icon → listener window opens → source = **Meeting audio** → **Start listening**
6. In Chrome's share dialog pick the **meeting tab** and tick **"Also share tab audio"**

## Notes
- Works only for meetings running in a **Chrome tab**. For desktop apps (Zoom/Teams app), share the **entire screen** and tick "Also share system audio" (Windows/ChromeOS), or use a virtual audio cable.
- Transcribing a tab's audio uses `SpeechRecognition.start(audioTrack)`, which needs a recent Chrome. On older versions the argument is ignored and the **microphone** is used instead, so update Chrome if tab mode only picks up your own voice.
- Mic mode asks for microphone permission the first time; click Allow.
- Set "Speech language" to the language the speakers use.
- If typing/sending breaks after a DeepSeek update, edit `findInput()` / `clickSendButton()` in `content.js`.
