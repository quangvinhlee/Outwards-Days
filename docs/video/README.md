# Outwards Days demo

outwards-days-demo.mp4 is a 39.72-second portrait H.264 video (720 × 1920), recorded from the running Android emulator on 11 October 2026. The original capture is outwards-days-demo-raw.mp4.

The walkthrough opens the saved 12–18 October week labelled Personalized with Gemma, opens its photography suggestion, scrolls its time budget and optional missions, and explores nearby places. No outing is accepted or marked completed. This is existing saved data, not fresh inference or an actual outdoor test. Captions sit outside the app recording.

Suggested narration (record separately if desired):

“Outwards Days makes a little room for outside. Start with the week you actually have, then choose an outdoor idea that fits. This saved week was personalized with Gemma running locally. Open an outing to see where you're going and the whole time budget, including getting ready and coming home. Optional mini missions give you something to notice or try. Browse nearby places, pick a small adventure, and put the phone away. This is an emulator prototype; real-phone and outdoor testing are next.”

Upload the finished MP4 to YouTube, Vimeo, or Loom, then add that link to the submission draft. This is a challenge walkthrough, not an Apple App Store preview.


## Narrated versions

- **outwards-days-full-narrated.mp4** — full landscape walkthrough, approximately 3 minutes 38 seconds, 1920 × 1080, H.264 video and AAC speech. Nine chapters: introduction, preferences, schedule, AI planning and validation, week view, outing budget, mini missions, nearby places, and progress/offline completion.
- **outwards-days-demo-voiced.mp4** — short portrait version, approximately 40 seconds, 720 × 1920, with Australian English narration and an optional embedded English subtitle track.
- **outwards-days-full-narrated.srt** and **outwards-days-demo-voiced.srt** — separate subtitles for upload.
- **narration.md** — editable transcript and YouTube chapter markers.

The full video's AI section explains the actual code path while showing a saved Gemma-labelled plan; it does not show a fresh inference request. The footage views existing preferences and schedules without accepting or completing outings. Camera-to-verdict, real-phone offline completion and actual outdoor use remain unverified, and the narration states those limits.

Raw captures, individual voice tracks, subtitle timing and chapter data live under `narrated/`. Regenerate voice tracks with `narrated/tools/voices.py` (requires network access to the speech service), and render with `narrated/tools/render.py` (requires ffmpeg, ffprobe and Pillow). Dependencies are listed in `narrated/tools/requirements.txt`. Narration text is in `narrated/chapters.json`; layout bullets are in the renderer.

Playback verification: both voiced MP4s decode without errors; audio and video start at zero. The full video has burned-in captions; the portrait video has a selectable subtitle track.


## Stereo playback alternatives

If the IDE preview does not play speech, open these in a standalone media player or browser:

- outwards-days-full-stereo.mp4
- outwards-days-demo-stereo.mp4
- outwards-days-full-narration.wav
- outwards-days-short-narration.wav

The stereo MP4s have a default AAC audio track at 44.1 kHz with the same narration in both channels. WAV files contain standard 16-bit PCM stereo audio. Original narrated videos also contain non-silent speech; these exports help rule out playback compatibility problems.
