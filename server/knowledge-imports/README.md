# Knowledge JSON imports

Drop `.json` files here and run:

```bash
npm run import:kb --prefix server
```

Every article (and optional video) is imported into the **product-scoped**
knowledge base and immediately chunked + embedded, so the AI answers from it
right away — no need to add anything through the admin UI.

Re-running the same file **updates** items in place (matched by title); it does
not create duplicates.

## Format

Name the file `<product-slug>.json` (e.g. `videoclawbot.json`) or add a
`"product"` field. All fields except `title` and `content` are optional.

```json
{
  "product": "videoclawbot",
  "knowledge": [
    {
      "title": "How do I reset my password?",
      "category": "Login",
      "content": "Open Settings → Security → Reset password. A link is emailed to you.",
      "keywords": ["password", "reset", "login"],
      "summary": "Reset your password from Settings → Security."
    },
    {
      "title": "What video formats are supported?",
      "category": "Features",
      "content": "MP4, MOV and WebM up to 4GB per file."
    }
  ],
  "videos": [
    {
      "title": "Getting started in 3 minutes",
      "videoUrl": "https://www.youtube.com/watch?v=xxxx",
      "category": "Tutorial",
      "description": "A quick tour of the main features.",
      "keywords": ["intro", "tour"]
    }
  ]
}
```

- A bare array of articles is also accepted — then name the file `<slug>.json`
  or pass `--product <slug>`.
- `category` accepts any of: Getting Started, Features, FAQs, Troubleshooting,
  Billing, Payment, Credits, Login, Account, API, Export, Upload, Policies,
  Refund, Subscription. Unknown values fall back to **FAQs**.
- Set `GEMINI_API_KEY` for semantic answers; without it, keyword retrieval
  still works.

You can also import from the admin UI: **Knowledge Base → Import JSON**.
