/** Voice I/O via Web Speech API (Domain Q) — speech-to-text in, optional TTS out. */
export function startVoice(onResult: (text: string) => void): void {
  const SR = (window as unknown as { SpeechRecognition?: { new (): unknown } }).SpeechRecognition;
  if (!SR) return;
  const rec = new (SR as unknown as { new (): { start: () => void; onresult: (e: { results: { 0: { transcript: string } }[] }) => void } })();
  rec.onresult = (e) => onResult(e.results[0][0].transcript);
  rec.start();
}
