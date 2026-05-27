# ChannelCue

ChannelCue helps people watch the YouTube channels they subscribe to without getting swept away into YouTube land. It loads subscribed channels, shows compact briefings, indexes recent uploads, and searches across subscriptions from a cached local index.

## Run it

```powershell
npm install
npm run dev
```

Open <http://localhost:3000>.

## Vercel Deployment

This repo includes `vercel.json` so Vercel routes requests through the Express serverless function.

Important production note: Vercel serverless file storage is temporary. This app supports Convex as durable storage for production data:

- per-user Google OAuth client ID/secret
- trial start dates
- cached video indexes

To use Convex:

```powershell
npx convex dev
npx convex deploy
```

Then add the Convex deployment URL to Vercel:

```text
CONVEX_URL=
```

If `CONVEX_URL` is not set, the app falls back to JSON files locally and `/tmp` on Vercel. That fallback can prevent crashes, but it is not durable enough for a paid production app.

## Launch video

The hero video is generated with Remotion:

```powershell
npm run video:render
```

That renders `public/assets/channelcue-launch.mp4`.

## Connect YouTube

1. Create a Google Cloud OAuth client for a web app.
2. Enable **YouTube Data API v3**.
3. Add these OAuth client values:

Authorized JavaScript origin:

```text
http://localhost:3000
```

Authorized redirect URI:

```text
http://localhost:3000/oauth2callback
```

4. Open the app and choose **Configuration**.
5. Paste the client ID and client secret. The app saves them to Convex when `CONVEX_URL` is configured, or to local JSON files during development.

## Customer Google Setup Instructions

Send this after someone pays for ChannelCue Pro:

1. Open <https://console.cloud.google.com/apis/credentials>.
2. Create a new Google Cloud project, or select an existing project.
3. Go to **APIs & Services -> Library**.
4. Search for **YouTube Data API v3** and click **Enable**.
5. Go to **APIs & Services -> Credentials**.
6. Click **Create credentials -> OAuth client ID**.
7. If prompted, configure the OAuth consent screen first. Use **External** for normal customer accounts, add your email, and save.
8. Choose **Web application** as the application type.
9. Under **Authorized JavaScript origins**, add:

```text
http://localhost:3000
```

10. Under **Authorized redirect URIs**, add:

```text
http://localhost:3000/oauth2callback
```

11. Click **Create**.
12. Copy the **Client ID** and **Client secret**.
13. In ChannelCue, open **Configuration -> Google setup**, paste both values, and save.

If they ever rotate keys or create a new OAuth client, they can reopen **Configuration** and save the new values.

## Clerk login

Create a Clerk app and add these values to `.env`:

```text
CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
```

Without Clerk keys, the prototype runs in local development mode. With Clerk keys, Google OAuth configuration is saved per signed-in Clerk user.

The app requests the read-only YouTube scope and stores OAuth tokens only in the local development session.

## Shared-key trial

You can let signed-in users try the app with your shared Google OAuth client:

```text
DEFAULT_GOOGLE_CLIENT_ID=
DEFAULT_GOOGLE_CLIENT_SECRET=
DEFAULT_GOOGLE_TRIAL_DAYS=7
PAYMENT_LINK_URL=https://link.fastpaydirect.com/payment-link/6a174c92c3ea3a19f0bd8c84
```

After the trial expires, users must save their own Google client ID and client secret in **Configuration**. The UI explains the $36/year price point as $3 per month; payment processing is not implemented yet.

## Notes

- Latest videos come from each channel's uploads playlist.
- Topic search uses a local cached index in `data/indexes/`, scoped by signed-in user.
- In production with `CONVEX_URL`, configuration and cached indexes are stored in Convex.
- The index is built from each subscribed channel's uploads playlist, which avoids expensive `search.list` calls.
- Use `INDEX_UPLOADS_PER_CHANNEL` to control how many recent uploads are cached per channel.
- Use `INDEX_REFRESH_MINUTES` to control when the background refresh considers the index stale.
- Use `INDEX_REQUEST_DELAY_MS` to slow refresh requests for large subscription lists.
- Summaries are generated from YouTube video metadata for now, so the prototype works without a separate AI service.
