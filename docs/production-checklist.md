# ChannelCue Production Checklist

Use this checklist before submitting ChannelCue for Google OAuth production access.

## Required Vercel Environment Variables

```text
NODE_ENV=production
APP_BASE_URL=https://www.channelcue.com
SESSION_SECRET=<long random secret>
CLERK_PUBLISHABLE_KEY=<production Clerk publishable key>
CLERK_SECRET_KEY=<production Clerk secret key>
CONVEX_URL=<production Convex URL>
DEFAULT_GOOGLE_CLIENT_ID=<production Google OAuth client ID>
DEFAULT_GOOGLE_CLIENT_SECRET=<production Google OAuth client secret>
DEFAULT_GOOGLE_TRIAL_DAYS=7
PAYMENT_LINK_URL=https://link.fastpaydirect.com/payment-link/6a174c92c3ea3a19f0bd8c84
INDEX_UPLOADS_PER_CHANNEL=25
INDEX_REFRESH_MINUTES=60
INDEX_REQUEST_DELAY_MS=100
```

## Public Pages

These pages must stay publicly reachable without login:

```text
https://www.channelcue.com/
https://www.channelcue.com/privacy.html
https://www.channelcue.com/terms.html
https://www.channelcue.com/support.html
```

Before submission, replace the draft legal text with your final business name, support email, legal entity, refund language, and data deletion process.

## Google OAuth Consent Screen

Use these values in Google Cloud Console:

```text
App name: ChannelCue
User support email: support@channelcue.com
Application home page: https://www.channelcue.com/
Privacy policy: https://www.channelcue.com/privacy.html
Terms of service: https://www.channelcue.com/terms.html
Authorized domain: channelcue.com
Scope: https://www.googleapis.com/auth/youtube.readonly
```

Authorized JavaScript origins:

```text
https://www.channelcue.com
https://channelcue.com
```

Authorized redirect URIs:

```text
https://www.channelcue.com/oauth2callback
https://channelcue.com/oauth2callback
```

## Google Verification Submission Notes

Prepare a short demo video showing:

- The ChannelCue homepage and privacy policy links.
- Signing in to ChannelCue.
- Connecting YouTube through the OAuth consent screen.
- Loading subscribed channels.
- Refreshing the cached index.
- Searching recent uploads.
- Disconnecting or requesting deletion.

Scope justification:

```text
ChannelCue requests https://www.googleapis.com/auth/youtube.readonly only to read a user's YouTube subscriptions and recent uploads from subscribed channels. The app uses this data to build a private searchable index of channels the user already follows. ChannelCue does not upload, modify, delete, sell, advertise against, or transfer YouTube user data.
```

## Before Broad Launch

- Use production Clerk keys, not development keys.
- Use production Convex deployment URL.
- Verify `https://www.channelcue.com/healthz` returns `{ "ok": true }`.
- Verify the OAuth consent screen is in production and approved if Google requires verification.
- Verify payment link points to the live annual plan.
- Replace draft privacy and terms pages with attorney-reviewed text.
