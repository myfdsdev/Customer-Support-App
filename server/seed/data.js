'use strict';

/**
 * Seed content. VideoClawBot is filled out properly because it is the product
 * the Phase 1 acceptance flow walks through; the others get enough knowledge
 * to prove that retrieval stays product-scoped.
 */

const products = [
  {
    name: 'VideoClawBot',
    slug: 'videoclawbot',
    tagline: 'AI video generation agents',
    description: 'Build custom AI agents that generate, edit and publish video at scale.',
    websiteUrl: 'https://videoclawbot.example.com',
    loginUrl: 'https://app.videoclawbot.example.com/login',
    supportEmail: 'support@videoclawbot.example.com',
    brandColor: '#6366f1',
    aiWelcomeMessage:
      'Hi! I can help with agents, video generation, credits, exports and account setup. What would you like help with?',
    aiPersona: 'Practical and concise. Creators are usually mid-task, so lead with the fix.',
  },
  {
    name: 'ClipsField AI',
    slug: 'clipsfield-ai',
    tagline: 'Turn long videos into short clips',
    description: 'Automatically find the best moments in long-form video and cut them into shorts.',
    websiteUrl: 'https://clipsfield.example.com',
    loginUrl: 'https://app.clipsfield.example.com/login',
    supportEmail: 'support@clipsfield.example.com',
    brandColor: '#0ea5e9',
    aiWelcomeMessage: 'Hi! Ask me about clipping, captions, aspect ratios, exports or billing.',
  },
  {
    name: 'AIO Generation',
    slug: 'aio-generation',
    tagline: 'All-in-one AI content studio',
    description: 'Generate copy, images, audio and video from a single workspace.',
    websiteUrl: 'https://aiogeneration.example.com',
    loginUrl: 'https://app.aiogeneration.example.com/login',
    supportEmail: 'support@aiogeneration.example.com',
    brandColor: '#8b5cf6',
    aiWelcomeMessage: 'Hi! I can help with workspaces, generation credits, models and exports.',
  },
  {
    name: 'Thumb Generator',
    slug: 'thumb-generator',
    tagline: 'High-CTR thumbnails in seconds',
    description: 'Generate and A/B test video thumbnails designed for click-through.',
    websiteUrl: 'https://thumbgenerator.example.com',
    loginUrl: 'https://app.thumbgenerator.example.com/login',
    supportEmail: 'support@thumbgenerator.example.com',
    brandColor: '#f59e0b',
    aiWelcomeMessage: 'Hi! Ask me about thumbnail templates, brand kits, A/B tests or exports.',
  },
];

const knowledge = {
  videoclawbot: [
    {
      category: 'Features',
      title: 'How to create a custom agent',
      keywords: ['custom agent', 'create agent', 'new agent', 'agent setup', 'build agent', 'agent builder'],
      tags: ['agents', 'getting-started'],
      summary: 'Create a custom agent from the Agents screen in under two minutes.',
      content: `A custom agent is a reusable video generation worker. You define its role, script style, voice and output format once, then run it as often as you need.

To create a custom agent:

1. Open the VideoClawBot dashboard and select Agents in the left sidebar.
2. Click New Agent in the top right.
3. Give the agent a name. This is only used internally, so pick something descriptive like "Weekly product demo".
4. Choose a base template. Blank Agent gives you full control; the Explainer, Shorts and Demo templates prefill the script structure.
5. Under Instructions, describe what the agent should produce. Be specific about tone, length and audience. This field is what most strongly shapes the output.
6. Pick a voice under Voice & Narration, and set the output resolution and aspect ratio under Output.
7. Optionally attach a brand kit so the agent applies your fonts, colours and logo automatically.
8. Click Save Agent. The agent appears in your Agents list immediately.
9. Click Run to generate your first video with it.

Editing an agent later does not change videos you have already generated. Each run stores the agent configuration it used, so your history stays reproducible.

Custom agents are available on all paid plans. Free trial accounts can create one custom agent.`,
    },
    {
      category: 'Troubleshooting',
      title: 'Video generation stuck at 99%',
      keywords: ['stuck at 99', 'generation stuck', 'not finishing', 'frozen', 'stuck rendering', 'render stuck'],
      tags: ['generation', 'troubleshooting'],
      summary: 'What to do when a render sits at 99% and does not complete.',
      content: `A render that sits at 99% is almost always finishing the final encode and upload step. The progress bar reaches 99% before the file is written to storage.

Try these steps in order:

1. Wait three to five minutes. Long or high-resolution videos can spend several minutes on the final encode.
2. Refresh the page. The progress bar sometimes loses its connection while the render itself completes normally. Check the Library, the finished video often appears there.
3. Open the run from History and check the Status field. Completed means the video is ready even if the progress bar disagrees.
4. If the status still shows Processing after fifteen minutes, click Retry Render on the run. Retrying a stuck render does not consume additional credits.
5. If the retry also stalls, the job needs to be inspected by our technical team.

Renders that fail after the retry are automatically credited back within 24 hours.`,
    },
    {
      category: 'Getting Started',
      title: 'Getting started with VideoClawBot',
      keywords: ['getting started', 'first video', 'setup', 'onboarding', 'begin'],
      tags: ['getting-started'],
      summary: 'Generate your first video in five steps.',
      content: `Welcome to VideoClawBot. Here is the shortest path to your first finished video.

1. Sign in and complete the workspace setup prompt. You will be asked for a workspace name and a default output resolution.
2. Go to Agents and either pick a starter template or create a custom agent.
3. Click Run on the agent and enter your topic or paste a script.
4. Review the generated storyboard. You can edit any scene's text before rendering.
5. Click Render. Your finished video appears in the Library and can be downloaded or published directly.

Your first render usually takes two to four minutes depending on length and resolution.`,
    },
    {
      category: 'Credits',
      title: 'How credits work',
      keywords: ['credits', 'credit cost', 'how many credits', 'credit usage', 'consumption'],
      tags: ['billing', 'credits'],
      summary: 'How credits are consumed and when they reset.',
      content: `Credits are consumed when you render a video. Building or editing an agent is free.

Cost per render:
- 720p: 1 credit per 30 seconds of finished video
- 1080p: 2 credits per 30 seconds
- 4K: 5 credits per 30 seconds

Storyboard previews and script generation do not consume credits.

Credits reset on your billing renewal date and do not roll over between periods. Additional credit packs can be purchased from Billing and never expire.

Failed renders are automatically refunded to your credit balance within 24 hours. If you want to know your current balance, open Billing in the dashboard, which shows the live figure for your account.`,
    },
    {
      category: 'Export',
      title: 'Exporting and downloading videos',
      keywords: ['export', 'download', 'save video', 'mp4', 'resolution'],
      tags: ['export'],
      summary: 'Download finished videos or publish them to a connected channel.',
      content: `Finished videos live in the Library.

To export:
1. Open the Library and select the video.
2. Click Download and choose a format. MP4 (H.264) is the default and works everywhere. MOV (ProRes) is available on Pro and above for editing workflows.
3. Choose a resolution. You can export at or below the resolution the video was rendered at, never above it.

To publish directly, connect a channel under Settings, then use Publish instead of Download. Connected channels currently include YouTube and TikTok.

Download links stay valid for 7 days. After that, open the video again from the Library to generate a fresh link.`,
    },
    {
      category: 'Login',
      title: 'Cannot sign in to your account',
      keywords: ['cant login', 'cannot sign in', 'password reset', 'locked out', 'forgot password', '2fa'],
      tags: ['account', 'login'],
      summary: 'Recover access to your VideoClawBot account.',
      content: `If you cannot sign in:

1. Use Forgot password on the sign-in screen. The reset link is valid for 60 minutes.
2. Check your spam folder for the reset email. It is sent from no-reply@videoclawbot.example.com.
3. If you signed up with Google, use Continue with Google rather than a password. Accounts created through Google do not have a password set until you add one in Settings.
4. If two-factor authentication is enabled and you have lost your device, use one of the recovery codes issued when you turned 2FA on.

If none of these work, our team can verify your identity and restore access manually.`,
    },
    {
      category: 'API',
      title: 'Using the VideoClawBot API',
      keywords: ['api', 'api key', 'endpoint', 'webhook', 'integration', 'rest'],
      tags: ['api', 'developers'],
      summary: 'Generate an API key and trigger renders programmatically.',
      content: `The VideoClawBot API lets you trigger agent runs from your own systems.

To get started:
1. Open Settings, then Developer, then API Keys.
2. Click Create Key and copy the value. The key is shown once and cannot be retrieved later.
3. Authenticate by sending the header: Authorization: Bearer YOUR_API_KEY

Core endpoints:
- POST /v1/agents/{agentId}/runs starts a render. The response includes a runId.
- GET /v1/runs/{runId} returns the status and, once complete, the download URL.
- POST /v1/webhooks registers a callback so you do not have to poll.

Rate limits are 60 requests per minute per key on Pro, 300 per minute on Business. API access is not available on the free trial.`,
    },
    {
      category: 'Billing',
      title: 'Plans, invoices and payment methods',
      keywords: ['billing', 'invoice', 'receipt', 'payment method', 'change plan', 'upgrade'],
      tags: ['billing'],
      summary: 'Where to find invoices and how to change plan or card.',
      content: `Everything billing related lives under Billing in the dashboard.

- Invoices: Billing then Invoices. Every invoice can be downloaded as a PDF and includes your VAT or tax ID if you have added one under Billing Details.
- Payment method: Billing then Payment Method then Update Card. The change applies to your next renewal.
- Change plan: Billing then Change Plan. Upgrades take effect immediately and are prorated. Downgrades take effect at the end of the current period.
- Cancel: Billing then Cancel Subscription. Your account stays active until the end of the paid period, and your Library remains accessible on the free tier afterwards.

For questions about a specific charge on your account, our billing team can look up the transaction directly.`,
    },
    {
      category: 'Refund',
      title: 'Refund policy',
      keywords: ['refund', 'money back', 'cancel and refund', 'refund policy'],
      tags: ['billing', 'refund'],
      summary: 'The 14-day refund window and what qualifies.',
      content: `New subscriptions can be refunded in full within 14 days of the first payment, provided fewer than 20 credits have been used.

Credit pack purchases are refundable within 14 days if the pack is entirely unused.

Renewals are not automatically refundable, but if a renewal was unexpected our billing team reviews these case by case.

Refunds are issued to the original payment method and typically take 5 to 10 business days to appear, depending on your bank.

To request a refund, contact support with your order ID. Our billing team verifies the purchase before processing.`,
    },
    {
      category: 'FAQs',
      title: 'Frequently asked questions',
      keywords: ['faq', 'commercial use', 'team seats', 'watermark', 'languages'],
      tags: ['faq'],
      summary: 'Common questions about usage rights, teams and limits.',
      content: `Can I use generated videos commercially?
Yes. Videos you generate on any paid plan can be used commercially, including in ads.

Do videos have a watermark?
Free trial renders include a small watermark. All paid plans render without one.

Can I add team members?
Team seats are available on Business. Invite members under Settings then Team.

What languages are supported?
Narration is available in 29 languages. On-screen text supports any language your chosen font covers.

Is there a maximum video length?
Single renders are capped at 10 minutes of finished video.`,
    },
  ],

  'clipsfield-ai': [
    {
      category: 'Getting Started',
      title: 'Creating your first clips',
      keywords: ['getting started', 'first clip', 'upload', 'import video'],
      tags: ['getting-started'],
      summary: 'Upload a long video and get shorts back.',
      content: `1. Click New Project and upload a video file, or paste a YouTube URL.
2. ClipsField analyses the video and proposes clip candidates ranked by predicted engagement.
3. Review the candidates. Each one shows a transcript excerpt and a score.
4. Select the clips you want and choose an aspect ratio (9:16, 1:1 or 16:9).
5. Click Generate. Finished clips appear in the project with burned-in captions.

Analysis takes roughly one minute per ten minutes of source video.`,
    },
    {
      category: 'Features',
      title: 'Captions and subtitle styling',
      keywords: ['captions', 'subtitles', 'caption style', 'srt', 'burn in'],
      tags: ['captions'],
      summary: 'Style burned-in captions or export an SRT.',
      content: `Captions are generated automatically for every clip.

To change how they look, open a clip and select Caption Style. You can set font, size, colour, highlight colour and position. Styles can be saved as a preset and applied across a project.

To edit the text, click any caption line in the editor. Corrections apply to the burned-in captions and to exported subtitle files.

Exports: Download then Subtitles gives you an SRT or VTT file if you would rather add captions in your own editor.`,
    },
    {
      category: 'Credits',
      title: 'ClipsField credits and limits',
      keywords: ['credits', 'minutes', 'limits', 'usage'],
      tags: ['billing'],
      summary: 'Credits are consumed per minute of source video analysed.',
      content: `ClipsField charges by source video length, not by the number of clips produced.

- 1 credit per minute of source video analysed
- Re-generating a clip from an already-analysed video is free
- Exporting is free

Credits reset monthly on your renewal date and do not roll over. Unused analysis of a failed upload is refunded automatically.`,
    },
  ],

  'aio-generation': [
    {
      category: 'Getting Started',
      title: 'Setting up your workspace',
      keywords: ['workspace', 'getting started', 'setup', 'first project'],
      tags: ['getting-started'],
      summary: 'Create a workspace and invite your team.',
      content: `1. After signing in, name your workspace. Workspaces keep projects, brand assets and billing separate.
2. Choose your default models under Settings then Models. You can override the model per generation later.
3. Upload brand assets under Brand Kit so generated copy and images stay on-brand.
4. Create your first project from the dashboard and pick a content type: copy, image, audio or video.

Each workspace has its own credit pool.`,
    },
    {
      category: 'Features',
      title: 'Switching between generation models',
      keywords: ['models', 'switch model', 'model quality', 'change model'],
      tags: ['models'],
      summary: 'Pick a model per generation or set a workspace default.',
      content: `AIO Generation exposes several models per content type. Faster models cost fewer credits; higher-quality models cost more.

To change the model for a single generation, use the model selector above the prompt box.
To change the default for everything in a workspace, go to Settings then Models.

Switching models does not affect anything you have already generated. Each output records the model that produced it, visible under Details.`,
    },
  ],

  'thumb-generator': [
    {
      category: 'Getting Started',
      title: 'Making your first thumbnail',
      keywords: ['thumbnail', 'create thumbnail', 'getting started', 'first thumbnail'],
      tags: ['getting-started'],
      summary: 'Generate a thumbnail from a title or a video frame.',
      content: `1. Click New Thumbnail.
2. Enter your video title, or upload a frame from your video to use as the base.
3. Pick a style. Bold Text, Face Focus and Minimal are the highest performing starting points.
4. Generate. You get four variations.
5. Refine any variation by editing the text, swapping the background or adjusting the crop.
6. Download at 1280x720, or push directly to YouTube if your channel is connected.`,
    },
    {
      category: 'Features',
      title: 'A/B testing thumbnails',
      keywords: ['ab test', 'a/b test', 'split test', 'ctr', 'compare thumbnails'],
      tags: ['testing'],
      summary: 'Run a split test between two thumbnails on a connected channel.',
      content: `A/B testing requires a connected YouTube channel.

1. Open a video in Tests and select two or three thumbnails.
2. Set a test duration. Seven days is the default and gives the most reliable result.
3. Start the test. Thumb Generator rotates the thumbnails and records impressions and click-through rate.
4. When the test finishes, the winner can be applied with one click.

Tests need roughly 5,000 impressions per variant before the result is meaningful.`,
    },
  ],
};

const videos = {
  videoclawbot: [
    {
      title: 'How to Create a Custom Agent',
      description: 'A three-minute walkthrough of building a custom agent from a blank template, including instructions, voice and brand kit.',
      feature: 'Custom Agent',
      category: 'Tutorial',
      keywords: ['custom agent', 'create agent', 'new agent', 'agent setup', 'agent builder'],
      questionVariations: [
        'How do I create a custom agent?',
        'How to create a custom agent',
        'How do I make a new agent?',
        'Can you show me how to set up an agent?',
        'Where do I create an agent?',
      ],
      videoUrl: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
      thumbnailUrl: 'https://placehold.co/640x360/6366f1/ffffff?text=Create+a+Custom+Agent',
      duration: 194,
      sortOrder: 1,
    },
    {
      title: 'Fixing a Stuck Render',
      description: 'What the 99% progress state means and how to retry a render safely without spending extra credits.',
      feature: 'Rendering',
      category: 'Troubleshooting',
      keywords: ['stuck', 'render', '99%', 'retry render', 'frozen generation'],
      questionVariations: [
        'My video is stuck at 99%',
        'Why is my render not finishing?',
        'Generation is frozen',
      ],
      videoUrl: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
      thumbnailUrl: 'https://placehold.co/640x360/ef4444/ffffff?text=Fixing+a+Stuck+Render',
      duration: 142,
      sortOrder: 2,
    },
    {
      title: 'Exporting and Publishing Your Video',
      description: 'Download formats, resolution options and publishing straight to a connected channel.',
      feature: 'Export',
      category: 'Export',
      keywords: ['export', 'download', 'publish', 'mp4', 'youtube'],
      questionVariations: ['How do I download my video?', 'How do I export in 4K?', 'How do I publish to YouTube?'],
      videoUrl: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
      thumbnailUrl: 'https://placehold.co/640x360/10b981/ffffff?text=Exporting+Your+Video',
      duration: 168,
      sortOrder: 3,
    },
    {
      title: 'Understanding Credits and Billing',
      description: 'How credits are consumed per resolution, when they reset, and where to find invoices.',
      feature: 'Credits',
      category: 'Credits',
      keywords: ['credits', 'billing', 'invoice', 'cost'],
      questionVariations: ['How do credits work?', 'How much does a render cost?', 'Where are my invoices?'],
      videoUrl: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
      thumbnailUrl: 'https://placehold.co/640x360/f59e0b/ffffff?text=Credits+and+Billing',
      duration: 121,
      sortOrder: 4,
    },
  ],
  'clipsfield-ai': [
    {
      title: 'Creating Your First Clips',
      description: 'Upload a long video and turn the best moments into shorts.',
      feature: 'Clipping',
      category: 'Tutorial',
      keywords: ['first clip', 'upload', 'shorts'],
      questionVariations: ['How do I make clips?', 'How do I upload a video?'],
      videoUrl: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
      thumbnailUrl: 'https://placehold.co/640x360/0ea5e9/ffffff?text=Creating+Your+First+Clips',
      duration: 155,
      sortOrder: 1,
    },
    {
      title: 'Styling Captions',
      description: 'Change caption fonts, colours and position, and save a preset.',
      feature: 'Captions',
      category: 'Features',
      keywords: ['captions', 'subtitles', 'style'],
      questionVariations: ['How do I change caption style?', 'Can I edit subtitles?'],
      videoUrl: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
      thumbnailUrl: 'https://placehold.co/640x360/0284c7/ffffff?text=Styling+Captions',
      duration: 133,
      sortOrder: 2,
    },
  ],
  'aio-generation': [
    {
      title: 'Workspace Setup Walkthrough',
      description: 'Create a workspace, add a brand kit and set default models.',
      feature: 'Workspace',
      category: 'Tutorial',
      keywords: ['workspace', 'setup', 'brand kit'],
      questionVariations: ['How do I set up my workspace?'],
      videoUrl: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
      thumbnailUrl: 'https://placehold.co/640x360/8b5cf6/ffffff?text=Workspace+Setup',
      duration: 176,
      sortOrder: 1,
    },
  ],
  'thumb-generator': [
    {
      title: 'Making Your First Thumbnail',
      description: 'Generate four thumbnail variations from a title and refine the best one.',
      feature: 'Thumbnails',
      category: 'Tutorial',
      keywords: ['thumbnail', 'create', 'variations'],
      questionVariations: ['How do I make a thumbnail?', 'How can I make thumbnails?'],
      videoUrl: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
      thumbnailUrl: 'https://placehold.co/640x360/f59e0b/ffffff?text=First+Thumbnail',
      duration: 148,
      sortOrder: 1,
    },
  ],
};

const announcements = [
  {
    slug: 'videoclawbot',
    type: 'New Feature',
    title: 'Brand kits are now available on all paid plans',
    content:
      'Attach a brand kit to any agent and your fonts, colours and logo are applied automatically on every render. Set one up under Settings then Brand Kit.',
    priority: 'normal',
  },
  {
    slug: 'videoclawbot',
    type: 'Service Notice',
    title: 'Scheduled maintenance on Sunday 02:00-04:00 UTC',
    content: 'Rendering will be paused for up to two hours. Queued renders resume automatically afterwards.',
    priority: 'high',
  },
  {
    slug: 'clipsfield-ai',
    type: 'Product Update',
    title: 'Faster analysis for videos over an hour',
    content: 'Long-form analysis is now roughly 40% faster. No action needed on your side.',
    priority: 'normal',
  },
];

/**
 * Cross-product suggestions. `triggerKeywords` are what make the
 * recommendation contextual rather than an ad — a VideoClawBot customer
 * asking about thumbnails is genuinely a Thumb Generator lead.
 */
const recommendations = [
  {
    name: 'Thumb Generator for video creators',
    promotedSlug: 'thumb-generator',
    sourceSlugs: ['videoclawbot', 'clipsfield-ai'],
    title: 'Need thumbnails to match?',
    description:
      'Thumb Generator creates high-CTR thumbnails from your video title in seconds, and can A/B test them on your channel.',
    ctaText: 'Learn more',
    placement: 'support_homepage',
    triggerKeywords: ['thumbnail', 'thumbnails', 'cover image', 'ctr', 'click through'],
  },
  {
    name: 'ClipsField for long-form creators',
    promotedSlug: 'clipsfield-ai',
    sourceSlugs: ['videoclawbot'],
    title: 'Turning long videos into shorts?',
    description: 'ClipsField AI finds the best moments in a long video and cuts them into captioned shorts automatically.',
    ctaText: 'Learn more',
    placement: 'after_resolution',
    triggerKeywords: ['shorts', 'short clips', 'clip', 'repurpose'],
  },
];

module.exports = { products, knowledge, videos, announcements, recommendations };
