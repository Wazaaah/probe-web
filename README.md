# Probe — web

The same product as the Android build, in a browser: an AI examiner asks you about a
document you have to defend, you answer out loud, and **what it asks next depends on what
you just said**. A second person — the reviewer — chooses which angle you get attacked
from, and reads the transcript afterwards. You never see the angles they rejected.

Two browsers, two roles, one pairing code. No server of ours anywhere in it.

## Running it

```bash
cd web
npm install
npm run dev        # http://localhost:5173
```

Open it twice, sign in as **Learner** on one and **Reviewer** on the other, with the same
pairing code. To try both sides on one machine, use two different ports (`npm run dev --
--port 5174`) or one normal window and one private window — the role is stored per origin,
so two tabs on the same port share it.

```bash
npm run test       # the branching rules
npm run typecheck
npm run build      # typecheck, test, then dist/
npm run preview    # serve dist/ locally
```

## What it needs from the outside world

Nothing you have to run. Three things at most, all called straight from the browser:

| What | Where | Needed? |
|---|---|---|
| Pairing between the two devices | `ntfy.sh` — public pub/sub over HTTPS, no account | always |
| Judging answers, writing question paths | Groq / Gemini / Claude, key pasted in **Profile → Examiner** | optional |
| Reading the document | `pdf.js`, in the tab | for PDFs |

There is no backend, no build-time key and no database. **The API key is pasted at runtime
and kept in that browser's `localStorage` — it is never compiled into the bundle**, because
the bundle is a URL anyone can open and read.

Without a key the app still runs end to end: the examiner falls back to matching the terms
each question expects, and an upload gets the four seeded angles instead of generated ones.
It is enough to demonstrate the flow and not enough to examine anyone.

## Serving it

`npm run build` produces `dist/` — plain static files with relative paths, so it drops onto
any static host, including a subdirectory.

**It must be served over HTTPS.** `SpeechRecognition` and the microphone only work in a
secure context, so `http://192.168.x.x` on a phone will load the app and then refuse to
listen. `localhost` is exempt; nothing else is.

## One app, two shapes

It is not a phone layout parked in the middle of a desktop window. Past 900px the same
markup lays itself out as a web app: the bar of tabs becomes a rail down the side and
stays put while you open a report, the pane fills the window with the text held to a
column you can read, the four angles become a grid, the question tree becomes a centred
dialog that closes on Escape, and alerts arrive as a toast in the corner. Below 900px it
is the phone app — bottom tabs, full-bleed detail views. The examination is the exception
at either size: it takes the whole window, because it is the only thing you should be
looking at.

## How it is put together

```
src/
  lib/examiner.ts   the branching itself — position, transcript, one probe per question
  lib/brain.ts      whoever judges an answer: Groq, Gemini, Claude, or nothing
  lib/voice.ts      the browser's own mouth and ears
  lib/pairing.ts    the wire between the two devices
  lib/doc.ts        upload → text
  lib/store.ts      what this browser is, and the one piece of state both sides share
  screens/          onboarding, the session, and one folder per role
```

`Examiner` is the product in one class. It owns where you are in the script, what you have
said, and the rule that a question may only be pressed on once. **Who judges an answer is
swappable** — `Examiner.localVerdict()` matches terms, a `Brain` asks a model, and both
produce the same `Verdict`, so a dropped API call degrades the session instead of ending it.

`src/lib/examiner.test.ts` holds that contract to the same rules as the Android suite.

## Known edges

- **The pairing topic is public.** Anyone who guesses the code can read the session. That is
  the trade for needing no account; a real build puts this behind your own backend.
- **`ntfy` turns anything past ~4 KB into a file attachment**, which would break every
  subscriber, so state is published in pieces and reassembled — see `lib/pairing.ts`.
- **Speech recognition is Chrome and Edge.** Firefox and Safari have no `SpeechRecognition`;
  the session falls back to typing, and there is a "type instead" control regardless.
- **A scanned PDF has no text layer** to extract. The Android build OCRs it; here you paste
  the text in instead.
