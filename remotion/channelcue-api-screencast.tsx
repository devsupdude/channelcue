import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Img,
  interpolate,
  Sequence,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig
} from 'remotion';

const colors = {
  bg: '#f5f3ee',
  ink: '#1b2321',
  muted: '#65706b',
  red: '#c9342f',
  teal: '#137a7f',
  gold: '#c58a1d',
  paper: '#fffdf8',
  line: '#dfe6e1',
  softTeal: '#e8f4f2',
  softGold: '#fff4d8'
};

const scenes = [
  { from: 0, label: 'Landing page', cue: 'Open ChannelCue landing page' },
  { from: 180, label: 'ChannelCue sign in', cue: 'Log in to ChannelCue' },
  { from: 360, label: 'Configuration', cue: 'Open Google OAuth setup' },
  { from: 540, label: 'Start OAuth', cue: 'Click Connect YouTube' },
  { from: 690, label: 'Google account', cue: 'Choose a Google account' },
  { from: 840, label: 'Verification notice', cue: 'Continue through app review notice' },
  { from: 990, label: 'OAuth consent', cue: 'Review YouTube read-only consent' },
  { from: 1170, label: 'Grant access', cue: 'Allow the requested read-only scope' },
  { from: 1320, label: 'Loading channels', cue: 'Subscribed channels load from YouTube' },
  { from: 1530, label: 'Channel view', cue: 'Select a channel and review recent videos' },
  { from: 1770, label: 'Refresh index', cue: 'Build the saved recent-upload index' },
  { from: 2010, label: 'Local search', cue: 'Search the saved ChannelCue index' },
  { from: 2250, label: 'YouTube links', cue: 'Open source videos and channels on YouTube' },
  { from: 2430, label: 'FAQ', cue: 'Explain quota-friendly API usage' },
  { from: 2700, label: 'User controls', cue: 'Disconnect or log out any time' }
];

const narration = [
  {
    from: 36,
    text: 'This is ChannelCue. The app helps users view and search recent uploads from YouTube channels they already subscribe to.'
  },
  {
    from: 360,
    text:
      'The user first signs in to ChannelCue, then connects their Google and YouTube account using OAuth. The app requests read-only YouTube access.'
  },
  {
    from: 990,
    text:
      'The OAuth consent flow shows the Google account, the ChannelCue app name, and the requested permission: View your YouTube account.'
  },
  {
    from: 1260,
    text:
      'It uses subscriptions.list to retrieve subscribed channels, channels.list to retrieve channel metadata and uploads playlist IDs, playlistItems.list to retrieve recent uploads, and videos.list to retrieve video metadata and statistics.'
  },
  {
    from: 1650,
    text:
      'ChannelCue displays the user subscribed channels, basic channel information, and recent videos. The app stores this metadata in a private user index.'
  },
  {
    from: 2040,
    text:
      'Searches are performed locally inside ChannelCue against the saved index, instead of repeatedly calling YouTube search APIs.'
  },
  {
    from: 2445,
    text:
      'The user can manually refresh the index when they want newer uploads, disconnect their YouTube account, or log out.'
  },
  {
    from: 2760,
    text: 'ChannelCue does not modify YouTube content or user account data.'
  }
];

const endpoints = ['subscriptions.list', 'channels.list', 'playlistItems.list', 'videos.list'];

function sceneIndex(frame: number) {
  let current = 0;
  for (let index = 0; index < scenes.length; index += 1) {
    if (frame >= scenes[index].from) current = index;
  }
  return current;
}

function phraseForFrame(frame: number) {
  let current = narration[0].text;
  for (const item of narration) {
    if (frame >= item.from) current = item.text;
  }
  return current;
}

const fade = (frame: number, start: number, end: number) =>
  interpolate(frame, [start, end], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

const BrowserFrame: React.FC<{ children: React.ReactNode; url?: string }> = ({ children, url = 'channelcue.com' }) => (
  <div
    style={{
      position: 'absolute',
      left: 84,
      top: 116,
      width: 1268,
      height: 770,
      border: `2px solid ${colors.line}`,
      borderRadius: 18,
      background: '#ffffff',
      overflow: 'hidden',
      boxShadow: '0 36px 100px rgba(27, 35, 33, 0.18)'
    }}
  >
    <div
      style={{
        height: 58,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '0 20px',
        background: '#f8f8f5',
        borderBottom: `2px solid ${colors.line}`,
        color: colors.muted,
        fontSize: 20,
        fontFamily: 'Inter, Arial, sans-serif'
      }}
    >
      <span style={{ width: 14, height: 14, borderRadius: 99, background: '#ea5b4d' }} />
      <span style={{ width: 14, height: 14, borderRadius: 99, background: '#e4b24f' }} />
      <span style={{ width: 14, height: 14, borderRadius: 99, background: '#57b36c' }} />
      <div
        style={{
          marginLeft: 18,
          height: 32,
          minWidth: 430,
          borderRadius: 8,
          background: '#ffffff',
          border: `1px solid ${colors.line}`,
          display: 'flex',
          alignItems: 'center',
          paddingLeft: 18
        }}
      >
        https://{url}
      </div>
    </div>
    <div style={{ position: 'relative', height: 712 }}>{children}</div>
  </div>
);

const Button: React.FC<{ children: React.ReactNode; primary?: boolean; muted?: boolean }> = ({
  children,
  primary,
  muted
}) => (
  <div
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: 52,
      padding: '0 24px',
      borderRadius: 8,
      background: primary ? colors.red : muted ? '#eef3f1' : '#ffffff',
      color: primary ? '#ffffff' : colors.ink,
      border: primary ? 'none' : `2px solid ${colors.line}`,
      fontFamily: 'Inter, Arial, sans-serif',
      fontSize: 19,
      fontWeight: 800
    }}
  >
    {children}
  </div>
);

const Field: React.FC<{ label: string; value: string; secret?: boolean }> = ({ label, value, secret }) => (
  <div>
    <div style={{ color: colors.muted, fontSize: 16, fontWeight: 800, marginBottom: 8 }}>{label}</div>
    <div
      style={{
        height: 52,
        borderRadius: 8,
        border: `2px solid ${colors.line}`,
        background: '#ffffff',
        padding: '14px 16px',
        fontSize: 18,
        color: colors.ink
      }}
    >
      {secret ? '************************' : value}
    </div>
  </div>
);

const LandingScreen: React.FC<{ frame: number }> = ({ frame }) => {
  const intro = spring({ frame, fps: 30, config: { damping: 18 } });
  return (
    <>
      <div style={{ position: 'absolute', left: 48, top: 34, display: 'flex', alignItems: 'center', gap: 12 }}>
        <Img src={staticFile('assets/channelcue-icon.svg')} style={{ width: 40, height: 40 }} />
        <div style={{ fontSize: 28, fontWeight: 900 }}>ChannelCue</div>
      </div>
      <div style={{ position: 'absolute', right: 38, top: 28, display: 'flex', gap: 12 }}>
        <Button>Configuration</Button>
        <Button primary>Get Started</Button>
      </div>
      <div
        style={{
          position: 'absolute',
          left: 58,
          top: 165,
          width: 575,
          opacity: intro,
          transform: `translateY(${interpolate(intro, [0, 1], [28, 0])}px)`
        }}
      >
        <div style={{ color: colors.red, fontSize: 17, fontWeight: 900 }}>CHANNELCUE PRO</div>
        <h1 style={{ margin: '16px 0 0', fontSize: 72, lineHeight: 0.95, color: colors.ink, fontWeight: 950 }}>
          Watch your subscriptions without wandering.
        </h1>
        <p style={{ color: colors.muted, fontSize: 28, lineHeight: 1.26 }}>
          Organize the channels you already subscribe to, search across recent uploads, and stay out of YouTube land.
        </p>
        <Button primary>Start 7-day trial</Button>
      </div>
      <div style={{ position: 'absolute', right: 48, top: 142, width: 500 }}>
        {['Design Notes', 'AI Frontiers', 'Camera Lab', 'History Hour', 'Code Review'].map((channel, index) => (
          <div
            key={channel}
            style={{
              height: 88,
              marginBottom: 18,
              borderRadius: 12,
              border: `2px solid ${colors.line}`,
              background: colors.paper,
              display: 'flex',
              alignItems: 'center',
              gap: 20,
              padding: '0 24px',
              transform: `translateX(${Math.sin((frame + index * 12) / 28) * 8}px)`
            }}
          >
            <span
              style={{
                width: 54,
                height: 54,
                borderRadius: 10,
                background: index % 3 === 0 ? colors.red : index % 3 === 1 ? colors.teal : colors.gold
              }}
            />
            <div>
              <div style={{ fontSize: 26, fontWeight: 900 }}>{channel}</div>
              <div style={{ color: colors.muted, fontSize: 18 }}>New upload, comments, more recommended videos...</div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
};

const SignInScreen: React.FC = () => (
  <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
    <div
      style={{
        width: 520,
        padding: 42,
        borderRadius: 14,
        border: `2px solid ${colors.line}`,
        background: colors.paper,
        boxShadow: '0 24px 70px rgba(27,35,33,0.12)',
        textAlign: 'center'
      }}
    >
      <Img src={staticFile('assets/channelcue-logo.svg')} style={{ width: 220 }} />
      <h2 style={{ margin: '34px 0 12px', fontSize: 36 }}>Sign in to ChannelCue</h2>
      <p style={{ color: colors.muted, fontSize: 20, lineHeight: 1.35 }}>
        ChannelCue account access is separate from YouTube OAuth.
      </p>
      <div style={{ marginTop: 30 }}>
        <Button primary>Continue</Button>
      </div>
    </div>
  </div>
);

const ConfigScreen: React.FC = () => (
  <div style={{ padding: 36 }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <h2 style={{ margin: 0, fontSize: 34 }}>Configuration</h2>
      <Button muted>Click Configuration again to close</Button>
    </div>
    <div
      style={{
        marginTop: 28,
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 22,
        fontFamily: 'Inter, Arial, sans-serif'
      }}
    >
      <Field label="Google Client ID" value="1234567890-abc.apps.googleusercontent.com" />
      <Field label="Google Client Secret" value="secret" secret />
      <Field label="Authorized JavaScript origin" value="https://channelcue.com" />
      <Field label="Authorized redirect URI" value="https://channelcue.com/oauth2callback" />
    </div>
    <div style={{ marginTop: 30, display: 'flex', gap: 14 }}>
      <Button primary>Save configuration</Button>
      <Button>Start 7-day trial</Button>
    </div>
    <div
      style={{
        marginTop: 30,
        padding: 22,
        borderRadius: 12,
        background: colors.softGold,
        color: colors.ink,
        fontSize: 21,
        lineHeight: 1.35
      }}
    >
      Google credentials are stored privately. The app requests read-only YouTube access for subscription and video metadata.
    </div>
  </div>
);

const ConnectYouTubeScreen: React.FC = () => (
  <div style={{ padding: 36 }}>
    <HeaderBar />
    <div style={{ marginTop: 48, padding: 32, borderRadius: 12, border: `2px solid ${colors.line}`, background: colors.paper }}>
      <h2 style={{ margin: 0, fontSize: 38 }}>Connect YouTube</h2>
      <p style={{ color: colors.muted, fontSize: 23, lineHeight: 1.35, maxWidth: 760 }}>
        ChannelCue is signed in. The next step opens Google OAuth so the user can grant read-only YouTube access.
      </p>
      <div style={{ display: 'flex', gap: 16, marginTop: 26 }}>
        <Button primary>Connect YouTube</Button>
        <Button>Configuration</Button>
      </div>
    </div>
  </div>
);

const GoogleShell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ height: '100%', background: '#f8fafd', padding: 52, fontFamily: 'Arial, sans-serif' }}>
    <div style={{ position: 'absolute', left: 52, top: 34, display: 'flex', alignItems: 'center', gap: 12 }}>
      <span style={{ color: '#4285f4', fontSize: 30, fontWeight: 800 }}>G</span>
      <span style={{ color: '#5f6368', fontSize: 20 }}>Google Accounts</span>
    </div>
    {children}
  </div>
);

const GoogleCard: React.FC<{ children: React.ReactNode; wide?: boolean }> = ({ children, wide }) => (
  <div
    style={{
      width: wide ? 760 : 600,
      minHeight: wide ? 470 : 430,
      margin: '58px auto 0',
      borderRadius: 24,
      border: '1px solid #dadce0',
      background: '#ffffff',
      padding: 40,
      color: '#202124'
    }}
  >
    {children}
  </div>
);

const AccountChooserScreen: React.FC = () => (
  <GoogleShell>
    <GoogleCard>
      <div style={{ fontSize: 36, lineHeight: 1.15 }}>Choose an account</div>
      <div style={{ marginTop: 8, color: '#5f6368', fontSize: 19 }}>to continue to ChannelCue</div>
      <div style={{ marginTop: 34, borderTop: '1px solid #e0e0e0' }}>
        {[
          ['Demo Reviewer', 'reviewer@example.com'],
          ['Use another account', 'Sign in with a different Google account']
        ].map(([name, email], index) => (
          <div
            key={name}
            style={{
              display: 'grid',
              gridTemplateColumns: '54px 1fr',
              gap: 16,
              alignItems: 'center',
              padding: '18px 0',
              borderBottom: '1px solid #e0e0e0'
            }}
          >
            <div
              style={{
                width: 46,
                height: 46,
                borderRadius: 99,
                background: index === 0 ? '#1a73e8' : '#f1f3f4',
                color: index === 0 ? '#fff' : '#5f6368',
                display: 'grid',
                placeItems: 'center',
                fontSize: 21,
                fontWeight: 700
              }}
            >
              {index === 0 ? 'D' : '+'}
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{name}</div>
              <div style={{ marginTop: 3, fontSize: 17, color: '#5f6368' }}>{email}</div>
            </div>
          </div>
        ))}
      </div>
    </GoogleCard>
  </GoogleShell>
);

const VerificationNoticeScreen: React.FC = () => (
  <GoogleShell>
    <GoogleCard wide>
      <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr', gap: 22 }}>
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: 99,
            border: '3px solid #fbbc04',
            color: '#fbbc04',
            display: 'grid',
            placeItems: 'center',
            fontSize: 28,
            fontWeight: 900
          }}
        >
          !
        </div>
        <div>
          <div style={{ fontSize: 35, lineHeight: 1.14 }}>Google has not verified this app</div>
          <p style={{ color: '#5f6368', fontSize: 19, lineHeight: 1.45 }}>
            The app is requesting access to sensitive info in your Google Account. Until the developer verifies this app
            with Google, you should not use it.
          </p>
          <div style={{ marginTop: 24, fontSize: 18, color: '#1a73e8', fontWeight: 700 }}>
            Advanced
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 18, marginTop: 34 }}>
            <div style={{ color: '#1a73e8', fontSize: 18, fontWeight: 700, padding: '12px 14px' }}>Back to safety</div>
            <div
              style={{
                background: '#1a73e8',
                color: '#ffffff',
                borderRadius: 20,
                padding: '12px 22px',
                fontSize: 18,
                fontWeight: 700
              }}
            >
              Continue
            </div>
          </div>
        </div>
      </div>
    </GoogleCard>
  </GoogleShell>
);

const ConsentScreen: React.FC<{ allowed?: boolean }> = ({ allowed }) => (
  <GoogleShell>
    <GoogleCard wide>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 270px', gap: 32 }}>
        <div>
          <div style={{ fontSize: 34, lineHeight: 1.16 }}>ChannelCue wants access to your Google Account</div>
          <div style={{ marginTop: 14, color: '#5f6368', fontSize: 19 }}>reviewer@example.com</div>
          <p style={{ color: '#3c4043', fontSize: 19, lineHeight: 1.42, marginTop: 28 }}>
            This lets ChannelCue use YouTube API Services to build your private subscribed-channel index.
          </p>
          <div style={{ marginTop: 24, border: '1px solid #dadce0', borderRadius: 12, padding: 18 }}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 14 }}>ChannelCue will be able to:</div>
            <div style={{ display: 'grid', gridTemplateColumns: '34px 1fr', gap: 12, alignItems: 'center' }}>
              <div style={{ color: '#d93025', fontSize: 25 }}>▶</div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>View your YouTube account</div>
                <div style={{ color: '#5f6368', fontSize: 16, marginTop: 4 }}>
                  Read-only access. ChannelCue cannot upload, edit, delete, comment, or subscribe.
                </div>
              </div>
            </div>
          </div>
          {allowed && (
            <div style={{ marginTop: 18, color: '#137333', fontSize: 19, fontWeight: 700 }}>
              Access granted. Returning to ChannelCue...
            </div>
          )}
        </div>
        <div style={{ borderLeft: '1px solid #e0e0e0', paddingLeft: 26 }}>
          <Img src={staticFile('assets/channelcue-icon.svg')} style={{ width: 74, height: 74 }} />
          <div style={{ marginTop: 14, fontSize: 22, fontWeight: 700 }}>ChannelCue</div>
          <div style={{ marginTop: 8, color: '#5f6368', fontSize: 16 }}>channelcue.com</div>
          <div style={{ marginTop: 34, display: 'flex', justifyContent: 'flex-end', gap: 14 }}>
            <div style={{ color: '#1a73e8', fontSize: 17, fontWeight: 700, padding: '11px 12px' }}>Cancel</div>
            <div
              style={{
                background: allowed ? '#137333' : '#1a73e8',
                color: '#ffffff',
                borderRadius: 20,
                padding: '11px 22px',
                fontSize: 17,
                fontWeight: 700
              }}
            >
              {allowed ? 'Allowed' : 'Allow'}
            </div>
          </div>
        </div>
      </div>
    </GoogleCard>
  </GoogleShell>
);

const LoadingScreen: React.FC<{ frame: number }> = ({ frame }) => {
  const count = Math.floor(interpolate(frame, [1320, 1500], [0, 966], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
  return (
    <div style={{ padding: 36 }}>
      <HeaderBar />
      <div style={{ marginTop: 34, padding: 28, borderRadius: 12, background: colors.softTeal, border: '2px solid #b8dcd8' }}>
        <h2 style={{ margin: 0, fontSize: 30 }}>Loading subscribed channels</h2>
        <p style={{ margin: '10px 0 0', color: colors.muted, fontSize: 22 }}>
          Found {count.toLocaleString()} subscribed channels using subscriptions.list.
        </p>
        <Progress amount={interpolate(frame, [1340, 1500], [0.12, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })} />
      </div>
      <EndpointFlow active={0} />
    </div>
  );
};

const AppScreen: React.FC<{ frame: number; mode: 'channel' | 'refresh' | 'search' | 'links' | 'faq' | 'controls' }> = ({
  frame,
  mode
}) => (
  <div style={{ padding: 28 }}>
    <HeaderBar />
    <div style={{ display: 'grid', gridTemplateColumns: '430px 1fr', gap: 24, marginTop: 24 }}>
      <div>
        <label style={{ fontSize: 16, fontWeight: 900, color: colors.muted }}>Subscribed channel</label>
        <div
          style={{
            height: 54,
            marginTop: 8,
            borderRadius: 8,
            border: `2px solid ${colors.line}`,
            display: 'flex',
            alignItems: 'center',
            padding: '0 18px',
            fontSize: 19,
            fontWeight: 850
          }}
        >
          Camera Lab
        </div>
        <ChannelCard />
      </div>
      <div>
        {mode === 'faq' ? <FaqPanel /> : <VideosPanel mode={mode} frame={frame} />}
      </div>
    </div>
  </div>
);

const HeaderBar: React.FC = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 26, fontWeight: 950 }}>
      <Img src={staticFile('assets/channelcue-icon.svg')} style={{ width: 38, height: 38 }} />
      ChannelCue
    </div>
    <div style={{ display: 'flex', gap: 12 }}>
      <Button>Frequently Asked Questions</Button>
      <Button>Configuration</Button>
      <Button>Disconnect</Button>
      <Button>Log out</Button>
    </div>
  </div>
);

const Progress: React.FC<{ amount: number }> = ({ amount }) => (
  <div style={{ marginTop: 22, height: 18, borderRadius: 99, background: '#dce8e5', overflow: 'hidden' }}>
    <div style={{ width: `${amount * 100}%`, height: '100%', background: colors.teal }} />
  </div>
);

const EndpointFlow: React.FC<{ active: number }> = ({ active }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginTop: 34 }}>
    {endpoints.map((endpoint, index) => (
      <div
        key={endpoint}
        style={{
          padding: 20,
          borderRadius: 10,
          background: index <= active ? colors.softTeal : colors.paper,
          border: `2px solid ${index <= active ? '#9bd0ca' : colors.line}`,
          fontSize: 20,
          fontWeight: 900,
          textAlign: 'center'
        }}
      >
        {endpoint}
      </div>
    ))}
  </div>
);

const ChannelCard: React.FC = () => (
  <div
    style={{
      marginTop: 20,
      padding: 24,
      borderRadius: 12,
      border: `2px solid ${colors.line}`,
      background: colors.paper
    }}
  >
    <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
      <div style={{ width: 76, height: 76, borderRadius: 14, background: colors.teal }} />
      <div>
        <div style={{ fontSize: 25, fontWeight: 950 }}>Camera Lab</div>
        <div style={{ marginTop: 8, fontSize: 19, textDecoration: 'underline' }}>Open channel</div>
      </div>
    </div>
    <p style={{ color: colors.muted, fontSize: 20, lineHeight: 1.32 }}>
      Practical camera tests, lens reviews, and field notes from working creators.
    </p>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
      {['488K subscribers', '812 videos', '72.4M views'].map((stat) => (
        <div key={stat} style={{ border: `2px solid ${colors.line}`, borderRadius: 8, padding: 13, fontSize: 16, fontWeight: 850 }}>
          {stat}
        </div>
      ))}
    </div>
  </div>
);

const VideosPanel: React.FC<{ frame: number; mode: string }> = ({ frame, mode }) => {
  const refreshing = mode === 'refresh';
  const searching = mode === 'search';
  return (
    <>
      <div style={{ display: 'flex', gap: 14, marginBottom: 16 }}>
        <div
          style={{
            flex: 1,
            height: 54,
            borderRadius: 8,
            border: `2px solid ${colors.line}`,
            padding: '14px 18px',
            color: searching ? colors.ink : colors.muted,
            fontSize: 19,
            fontWeight: 800
          }}
        >
          {searching ? 'camera tests low light' : 'Search subscribed channels'}
        </div>
        <Button primary>{searching ? 'Searching...' : 'Search'}</Button>
      </div>
      {refreshing && (
        <div style={{ padding: 20, marginBottom: 16, borderRadius: 10, background: colors.softTeal, border: '2px solid #b8dcd8' }}>
          <div style={{ fontSize: 20, fontWeight: 900 }}>Refreshing saved index</div>
          <Progress amount={interpolate(frame, [1770, 1980], [0.08, 0.92], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })} />
        </div>
      )}
      <div style={{ padding: 22, borderRadius: 12, border: `2px solid ${colors.line}`, background: colors.paper }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 18 }}>
          <h2 style={{ margin: 0, fontSize: 28 }}>{searching ? 'Search results' : 'Latest videos'}</h2>
          <div style={{ color: colors.muted, fontSize: 20 }}>Saved index</div>
        </div>
        {['Testing the best travel cameras in low light', 'What creators should know about new lenses', 'A field guide to smoother video'].map(
          (title, index) => (
            <div
              key={title}
              style={{
                display: 'grid',
                gridTemplateColumns: '190px 1fr',
                gap: 18,
                padding: 14,
                marginBottom: 14,
                borderRadius: 10,
                border: `2px solid ${mode === 'links' && index === 0 ? colors.red : colors.line}`,
                background: '#ffffff'
              }}
            >
              <div style={{ height: 104, borderRadius: 8, background: index % 2 ? colors.gold : colors.teal }} />
              <div>
                <div style={{ fontSize: 22, fontWeight: 950, textDecoration: mode === 'links' && index === 0 ? 'underline' : 'none' }}>
                  {title}
                </div>
                <p style={{ margin: '8px 0', color: colors.muted, fontSize: 18, lineHeight: 1.28 }}>
                  A recent upload from Camera Lab focused on practical camera testing.
                </p>
                <div style={{ color: colors.muted, fontSize: 16 }}>Camera Lab · May 2026 · 12:44 · 82K views</div>
              </div>
            </div>
          )
        )}
      </div>
    </>
  );
};

const FaqPanel: React.FC = () => (
  <div style={{ padding: 28, borderRadius: 12, border: `2px solid ${colors.line}`, background: colors.paper }}>
    <h2 style={{ margin: '0 0 22px', fontSize: 32 }}>Frequently Asked Questions</h2>
    {[
      ['How does ChannelCue use the YouTube API?', 'Read-only API calls fetch subscriptions, channel metadata, uploads playlists, and video details.'],
      ['Why do I need my own Google credentials?', 'Your own credentials keep usage tied to your own Google project and quota.'],
      ['Does search call YouTube every time?', 'No. ChannelCue searches the private saved index stored for the user.']
    ].map(([question, answer]) => (
      <div key={question} style={{ padding: '18px 0', borderTop: `2px solid ${colors.line}` }}>
        <div style={{ fontSize: 23, fontWeight: 950 }}>{question}</div>
        <div style={{ marginTop: 8, color: colors.muted, fontSize: 20, lineHeight: 1.32 }}>{answer}</div>
      </div>
    ))}
    <EndpointFlow active={3} />
  </div>
);

const Cursor: React.FC<{ frame: number }> = ({ frame }) => {
  const points = [
    [820, 810],
    [1180, 725],
    [1030, 210],
    [1160, 230],
    [575, 360],
    [1035, 560],
    [1025, 735],
    [1038, 735],
    [960, 702],
    [1120, 736],
    [935, 294],
    [1160, 468],
    [1110, 237],
    [708, 235],
    [1170, 520],
    [1160, 160]
  ];
  const index = sceneIndex(frame);
  const [x, y] = points[index] || points[0];
  const pulse = Math.sin(frame / 8) * 0.08 + 1;
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: 34,
        height: 34,
        transform: `scale(${pulse}) rotate(-18deg)`,
        filter: 'drop-shadow(0 8px 12px rgba(0,0,0,0.22))'
      }}
    >
      <div
        style={{
          width: 0,
          height: 0,
          borderTop: '28px solid #ffffff',
          borderRight: '16px solid transparent',
          borderLeft: '8px solid transparent'
        }}
      />
    </div>
  );
};

const Sidebar: React.FC<{ frame: number }> = ({ frame }) => {
  const active = sceneIndex(frame);
  return (
    <div
      style={{
        position: 'absolute',
        right: 84,
        top: 116,
        width: 396,
        height: 770,
        borderRadius: 18,
        border: `2px solid ${colors.line}`,
        background: colors.paper,
        padding: 28,
        fontFamily: 'Inter, Arial, sans-serif',
        boxShadow: '0 26px 70px rgba(27,35,33,0.12)'
      }}
    >
      <div style={{ fontSize: 24, color: colors.red, fontWeight: 950 }}>YouTube API review</div>
      <h2 style={{ margin: '14px 0 20px', fontSize: 38, lineHeight: 1.05 }}>ChannelCue walkthrough</h2>
      <div style={{ display: 'grid', gap: 10 }}>
        {scenes.map((scene, index) => (
          <div
            key={scene.label}
            style={{
              padding: '12px 14px',
              borderRadius: 8,
              background: index === active ? colors.softTeal : 'transparent',
              color: index === active ? colors.ink : colors.muted,
              fontSize: 17,
              fontWeight: index === active ? 900 : 700
            }}
          >
            {index + 1}. {scene.cue}
          </div>
        ))}
      </div>
    </div>
  );
};

const Caption: React.FC<{ frame: number }> = ({ frame }) => (
  <div
    style={{
      position: 'absolute',
      left: 84,
      right: 84,
      bottom: 48,
      minHeight: 86,
      padding: '20px 30px',
      borderRadius: 16,
      background: 'rgba(27,35,33,0.92)',
      color: '#ffffff',
      fontFamily: 'Inter, Arial, sans-serif',
      fontSize: 27,
      lineHeight: 1.25,
      boxShadow: '0 18px 48px rgba(27,35,33,0.2)'
    }}
  >
    {phraseForFrame(frame)}
  </div>
);

const MainScreen: React.FC<{ frame: number }> = ({ frame }) => {
  const active = sceneIndex(frame);
  const opacity = fade(frame - scenes[active].from, 0, 18);
  return (
    <div style={{ opacity }}>
      {active === 0 && <LandingScreen frame={frame} />}
      {active === 1 && <SignInScreen />}
      {active === 2 && <ConfigScreen />}
      {active === 3 && <ConnectYouTubeScreen />}
      {active === 4 && <AccountChooserScreen />}
      {active === 5 && <VerificationNoticeScreen />}
      {active === 6 && <ConsentScreen />}
      {active === 7 && <ConsentScreen allowed />}
      {active === 8 && <LoadingScreen frame={frame} />}
      {active === 9 && <AppScreen frame={frame} mode="channel" />}
      {active === 10 && <AppScreen frame={frame} mode="refresh" />}
      {active === 11 && <AppScreen frame={frame} mode="search" />}
      {active === 12 && <AppScreen frame={frame} mode="links" />}
      {active === 13 && <AppScreen frame={frame} mode="faq" />}
      {active === 14 && <AppScreen frame={frame} mode="controls" />}
    </div>
  );
};

export const ChannelCueApiScreencast: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ background: colors.bg, fontFamily: 'Inter, Arial, sans-serif', color: colors.ink }}>
      <Sequence>
        <Audio src={staticFile('assets/channelcue-api-screencast.wav')} volume={0.95} />
      </Sequence>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(circle at 15% 15%, rgba(19,122,127,0.13), transparent 34%), radial-gradient(circle at 78% 78%, rgba(197,138,29,0.14), transparent 36%)'
        }}
      />
      <BrowserFrame url={frame < 690 ? 'channelcue.com' : frame < 1320 ? 'accounts.google.com/o/oauth2/v2/auth' : 'channelcue.com'}>
        <MainScreen frame={frame} />
      </BrowserFrame>
      <Sidebar frame={frame} />
      <Cursor frame={frame} />
      <Caption frame={frame} />
      <div
        style={{
          position: 'absolute',
          left: 84,
          top: 44,
          color: colors.muted,
          fontSize: 22,
          fontWeight: 800
        }}
      >
        ChannelCue YouTube API Services functionality screencast
      </div>
      <div
        style={{
          position: 'absolute',
          right: 84,
          top: 44,
          color: colors.muted,
          fontSize: 22,
          fontWeight: 800
        }}
      >
        {Math.floor(frame / fps)}s / {Math.floor(2940 / fps)}s
      </div>
    </AbsoluteFill>
  );
};
