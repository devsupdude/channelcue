import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Img,
  interpolate,
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
  { from: 0, label: 'Signed-in app', cue: 'User is signed in and connected to YouTube' },
  { from: 180, label: 'Load channels', cue: 'subscriptions.list fetches subscribed channels' },
  { from: 390, label: 'Channel metadata', cue: 'channels.list fetches stats and uploads playlists' },
  { from: 600, label: 'Recent uploads', cue: 'playlistItems.list fetches recent uploads' },
  { from: 810, label: 'Video metadata', cue: 'videos.list fetches details and statistics' },
  { from: 1020, label: 'Private index', cue: 'ChannelCue saves a private local index' },
  { from: 1230, label: 'Search locally', cue: 'Search runs against the saved index' },
  { from: 1440, label: 'Sort and review', cue: 'User sorts and reviews indexed results' },
  { from: 1650, label: 'No live search', cue: 'ChannelCue avoids search.list for normal search' }
];

const narration = [
  {
    from: 0,
    text:
      'This addendum shows how ChannelCue fetches and reads subscribed channels and recent video metadata to build a private index.'
  },
  {
    from: 180,
    text:
      'After the user connects YouTube with read-only OAuth, ChannelCue calls subscriptions.list to load the channels the user already subscribes to.'
  },
  {
    from: 390,
    text:
      'ChannelCue batches channel IDs through channels.list to read channel titles, thumbnails, statistics, and each channel uploads playlist ID.'
  },
  {
    from: 600,
    text:
      'For each uploads playlist, ChannelCue uses playlistItems.list to fetch a limited number of recent uploads.'
  },
  {
    from: 810,
    text:
      'Then ChannelCue batches the video IDs through videos.list to read video metadata, duration, publish date, thumbnails, and statistics.'
  },
  {
    from: 1020,
    text:
      'The channel and video metadata is stored in a private saved index for that authenticated ChannelCue user.'
  },
  {
    from: 1230,
    text:
      'When the user searches, ChannelCue searches this saved index locally. It does not repeatedly call YouTube search APIs.'
  },
  {
    from: 1440,
    text:
      'The user can sort and review indexed videos by channel, topic, publish date, and relevance inside ChannelCue.'
  },
  {
    from: 1650,
    text:
      'This quota-friendly flow avoids search.list for normal use and refreshes YouTube data only when the user requests it.'
  }
];

const endpoints = [
  {
    name: 'subscriptions.list',
    cost: 'reads subscribed channels',
    data: 'channel IDs, names, thumbnails'
  },
  {
    name: 'channels.list',
    cost: 'batched by channel ID',
    data: 'stats, descriptions, uploads playlist IDs'
  },
  {
    name: 'playlistItems.list',
    cost: 'recent uploads playlist',
    data: 'recent video IDs and snippets'
  },
  {
    name: 'videos.list',
    cost: 'batched by video ID',
    data: 'duration, publish date, views, thumbnails'
  }
];

const sampleChannels = [
  ['Camera Lab', '488K subscribers', '812 videos'],
  ['AI Frontiers', '221K subscribers', '534 videos'],
  ['Design Notes', '96K subscribers', '291 videos'],
  ['History Hour', '1.2M subscribers', '1.8K videos']
];

const sampleVideos = [
  ['Camera Lab', 'Testing travel cameras in low light', 'May 2026', '82K views'],
  ['AI Frontiers', 'New AI hardware benchmark explained', 'May 2026', '131K views'],
  ['Design Notes', 'Design systems that age well', 'Apr 2026', '44K views'],
  ['History Hour', 'The forgotten story behind a famous photo', 'Apr 2026', '203K views']
];

function activeScene(frame: number) {
  let current = 0;
  for (let index = 0; index < scenes.length; index += 1) {
    if (frame >= scenes[index].from) current = index;
  }
  return current;
}

function captionForFrame(frame: number) {
  let current = narration[0].text;
  for (const item of narration) {
    if (frame >= item.from) current = item.text;
  }
  return current;
}

const Button: React.FC<{ children: React.ReactNode; primary?: boolean }> = ({ children, primary }) => (
  <div
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: 48,
      padding: '0 22px',
      borderRadius: 8,
      background: primary ? colors.red : '#ffffff',
      color: primary ? '#ffffff' : colors.ink,
      border: primary ? 'none' : `2px solid ${colors.line}`,
      fontSize: 18,
      fontWeight: 850
    }}
  >
    {children}
  </div>
);

const Browser: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      position: 'absolute',
      left: 70,
      top: 105,
      width: 1280,
      height: 790,
      borderRadius: 18,
      overflow: 'hidden',
      background: '#ffffff',
      border: `2px solid ${colors.line}`,
      boxShadow: '0 34px 90px rgba(27,35,33,0.16)'
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
        fontSize: 18
      }}
    >
      <span style={{ width: 14, height: 14, borderRadius: 99, background: '#ea5b4d' }} />
      <span style={{ width: 14, height: 14, borderRadius: 99, background: '#e4b24f' }} />
      <span style={{ width: 14, height: 14, borderRadius: 99, background: '#57b36c' }} />
      <div
        style={{
          marginLeft: 18,
          height: 32,
          width: 520,
          borderRadius: 8,
          background: '#ffffff',
          border: `1px solid ${colors.line}`,
          display: 'flex',
          alignItems: 'center',
          paddingLeft: 18
        }}
      >
        https://www.channelcue.com
      </div>
    </div>
    <div style={{ height: 732, position: 'relative' }}>{children}</div>
  </div>
);

const Header: React.FC = () => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 28 }}>
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 26, fontWeight: 950 }}>
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

const SignedInScreen: React.FC = () => (
  <div>
    <Header />
    <div style={{ padding: '0 32px' }}>
      <div style={{ padding: 24, borderRadius: 12, background: colors.softTeal, border: '2px solid #b8dcd8' }}>
        <div style={{ fontSize: 24, fontWeight: 950 }}>YouTube connected</div>
        <div style={{ marginTop: 8, color: colors.muted, fontSize: 20 }}>
          Read-only OAuth access is active. ChannelCue can load subscribed channels and recent uploads.
        </div>
      </div>
      <div style={{ marginTop: 24 }}>
        <Button primary>Load subscribed channels</Button>
      </div>
    </div>
  </div>
);

const ChannelsScreen: React.FC<{ frame: number }> = ({ frame }) => {
  const count = Math.floor(interpolate(frame, [180, 340], [0, 966], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
  return (
    <div>
      <Header />
      <div style={{ padding: '0 32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 28, fontWeight: 950 }}>Subscribed channels loaded</div>
            <div style={{ color: colors.muted, fontSize: 20 }}>
              {count.toLocaleString()} channels fetched using subscriptions.list
            </div>
          </div>
          <Button primary>Refresh index</Button>
        </div>
        <ChannelTable highlight="subscriptions.list" />
      </div>
    </div>
  );
};

const MetadataScreen: React.FC<{ endpoint: string }> = ({ endpoint }) => (
  <div>
    <Header />
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 420px', gap: 24, padding: '0 32px' }}>
      <ChannelTable highlight={endpoint} />
      <EndpointPanel active={endpoint} />
    </div>
  </div>
);

const IndexScreen: React.FC = () => (
  <div>
    <Header />
    <div style={{ padding: '0 32px' }}>
      <div style={{ padding: 22, borderRadius: 12, background: colors.softGold, border: '2px solid #ead49c' }}>
        <div style={{ fontSize: 25, fontWeight: 950 }}>Private index saved</div>
        <div style={{ marginTop: 8, color: colors.muted, fontSize: 20 }}>
          ChannelCue stores channel and video metadata for this signed-in user only.
        </div>
      </div>
      <VideoTable mode="index" />
    </div>
  </div>
);

const SearchScreen: React.FC<{ sort?: boolean }> = ({ sort }) => (
  <div>
    <Header />
    <div style={{ padding: '0 32px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 190px 150px', gap: 14 }}>
        <div
          style={{
            height: 54,
            borderRadius: 8,
            border: `2px solid ${colors.line}`,
            display: 'flex',
            alignItems: 'center',
            paddingLeft: 18,
            fontSize: 20,
            fontWeight: 800
          }}
        >
          camera tests
        </div>
        <div
          style={{
            height: 54,
            borderRadius: 8,
            border: `2px solid ${sort ? colors.teal : colors.line}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 18,
            fontWeight: 850,
            background: sort ? colors.softTeal : '#ffffff'
          }}
        >
          Sort: newest
        </div>
        <Button primary>Search</Button>
      </div>
      <div style={{ marginTop: 14, color: colors.muted, fontSize: 19 }}>
        Search complete from saved index. No YouTube search.list request was made.
      </div>
      <VideoTable mode={sort ? 'sort' : 'search'} />
    </div>
  </div>
);

const NoSearchListScreen: React.FC = () => (
  <div>
    <Header />
    <div style={{ padding: '0 32px', display: 'grid', gridTemplateColumns: '1fr 420px', gap: 24 }}>
      <div style={{ padding: 26, borderRadius: 12, border: `2px solid ${colors.line}`, background: colors.paper }}>
        <div style={{ color: colors.red, fontSize: 17, fontWeight: 950 }}>QUOTA-FRIENDLY DESIGN</div>
        <h2 style={{ margin: '12px 0', fontSize: 42, lineHeight: 1.05 }}>Search uses the saved ChannelCue index.</h2>
        <p style={{ color: colors.muted, fontSize: 22, lineHeight: 1.35 }}>
          YouTube API calls happen when the user connects or manually refreshes. Normal searching and sorting happens locally
          against saved metadata.
        </p>
      </div>
      <div style={{ display: 'grid', gap: 12 }}>
        {['search.list avoided for normal search', 'Saved index remains available after quota errors', 'Refresh is user-triggered'].map(
          item => (
            <div
              key={item}
              style={{
                padding: 18,
                borderRadius: 10,
                background: colors.softTeal,
                border: '2px solid #b8dcd8',
                fontSize: 21,
                fontWeight: 850
              }}
            >
              {item}
            </div>
          )
        )}
      </div>
    </div>
  </div>
);

const ChannelTable: React.FC<{ highlight: string }> = ({ highlight }) => (
  <div style={{ marginTop: 24, borderRadius: 12, border: `2px solid ${colors.line}`, background: colors.paper }}>
    <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', padding: 16, color: colors.muted, fontSize: 16, fontWeight: 900 }}>
      <div>Subscribed channel</div>
      <div>Subscribers</div>
      <div>Videos</div>
    </div>
    {sampleChannels.map(([title, subs, videos], index) => (
      <div
        key={title}
        style={{
          display: 'grid',
          gridTemplateColumns: '1.4fr 1fr 1fr',
          padding: 16,
          borderTop: `2px solid ${colors.line}`,
          alignItems: 'center',
          background: index === 0 && highlight !== 'subscriptions.list' ? colors.softTeal : '#ffffff'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 20, fontWeight: 900 }}>
          <span
            style={{
              width: 42,
              height: 42,
              borderRadius: 9,
              background: index % 3 === 0 ? colors.teal : index % 3 === 1 ? colors.red : colors.gold
            }}
          />
          {title}
        </div>
        <div style={{ fontSize: 18 }}>{subs}</div>
        <div style={{ fontSize: 18 }}>{videos}</div>
      </div>
    ))}
  </div>
);

const EndpointPanel: React.FC<{ active: string }> = ({ active }) => (
  <div style={{ display: 'grid', gap: 12 }}>
    {endpoints.map(endpoint => {
      const isActive = endpoint.name === active;
      return (
        <div
          key={endpoint.name}
          style={{
            padding: 18,
            borderRadius: 10,
            background: isActive ? colors.softTeal : colors.paper,
            border: `2px solid ${isActive ? '#91cbc4' : colors.line}`
          }}
        >
          <div style={{ color: isActive ? colors.teal : colors.ink, fontSize: 22, fontWeight: 950 }}>{endpoint.name}</div>
          <div style={{ color: colors.muted, marginTop: 7, fontSize: 17 }}>{endpoint.cost}</div>
          <div style={{ marginTop: 10, fontSize: 17 }}>{endpoint.data}</div>
        </div>
      );
    })}
  </div>
);

const VideoTable: React.FC<{ mode: string }> = ({ mode }) => (
  <div style={{ marginTop: 22, borderRadius: 12, border: `2px solid ${colors.line}`, background: colors.paper }}>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr 0.7fr 0.7fr', padding: 16, color: colors.muted, fontSize: 16, fontWeight: 900 }}>
      <div>Channel</div>
      <div>Recent video metadata</div>
      <div>Published</div>
      <div>Views</div>
    </div>
    {sampleVideos.map(([channel, title, date, views], index) => (
      <div
        key={title}
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1.5fr 0.7fr 0.7fr',
          padding: 16,
          borderTop: `2px solid ${colors.line}`,
          alignItems: 'center',
          background:
            (mode === 'search' && index === 0) || (mode === 'sort' && index < 2) ? colors.softTeal : '#ffffff'
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 850 }}>{channel}</div>
        <div style={{ fontSize: 19, fontWeight: 900 }}>{title}</div>
        <div style={{ color: colors.muted, fontSize: 17 }}>{date}</div>
        <div style={{ color: colors.muted, fontSize: 17 }}>{views}</div>
      </div>
    ))}
  </div>
);

const Sidebar: React.FC<{ frame: number }> = ({ frame }) => {
  const active = activeScene(frame);
  return (
    <div
      style={{
        position: 'absolute',
        right: 70,
        top: 105,
        width: 420,
        height: 790,
        borderRadius: 18,
        border: `2px solid ${colors.line}`,
        background: colors.paper,
        padding: 28,
        boxShadow: '0 28px 72px rgba(27,35,33,0.12)'
      }}
    >
      <div style={{ color: colors.red, fontSize: 20, fontWeight: 950 }}>YouTube API quota review</div>
      <h2 style={{ margin: '14px 0 22px', fontSize: 36, lineHeight: 1.04 }}>Private index workflow</h2>
      <div style={{ display: 'grid', gap: 10 }}>
        {scenes.map((scene, index) => (
          <div
            key={scene.label}
            style={{
              padding: '13px 14px',
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
      left: 70,
      right: 70,
      bottom: 46,
      minHeight: 86,
      padding: '20px 30px',
      borderRadius: 16,
      background: 'rgba(27,35,33,0.92)',
      color: '#ffffff',
      fontSize: 26,
      lineHeight: 1.25,
      boxShadow: '0 18px 48px rgba(27,35,33,0.2)'
    }}
  >
    {captionForFrame(frame)}
  </div>
);

const Main: React.FC<{ frame: number }> = ({ frame }) => {
  const active = activeScene(frame);
  const sceneFrame = frame - scenes[active].from;
  const opacity = interpolate(sceneFrame, [0, 16], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <div style={{ opacity }}>
      {active === 0 && <SignedInScreen />}
      {active === 1 && <ChannelsScreen frame={frame} />}
      {active === 2 && <MetadataScreen endpoint="channels.list" />}
      {active === 3 && <MetadataScreen endpoint="playlistItems.list" />}
      {active === 4 && <MetadataScreen endpoint="videos.list" />}
      {active === 5 && <IndexScreen />}
      {active === 6 && <SearchScreen />}
      {active === 7 && <SearchScreen sort />}
      {active === 8 && <NoSearchListScreen />}
    </div>
  );
};

export const ChannelCueQuotaScreencast: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ background: colors.bg, fontFamily: 'Inter, Arial, sans-serif', color: colors.ink }}>
      <Audio src={staticFile('assets/channelcue-quota-screencast.wav')} volume={0.95} />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(circle at 15% 18%, rgba(19,122,127,0.14), transparent 34%), radial-gradient(circle at 78% 78%, rgba(197,138,29,0.14), transparent 36%)'
        }}
      />
      <div style={{ position: 'absolute', left: 70, top: 42, color: colors.muted, fontSize: 22, fontWeight: 800 }}>
        ChannelCue YouTube Data API quota workflow screencast
      </div>
      <div style={{ position: 'absolute', right: 70, top: 42, color: colors.muted, fontSize: 22, fontWeight: 800 }}>
        {Math.floor(frame / fps)}s / {Math.floor(1860 / fps)}s
      </div>
      <Browser>
        <Main frame={frame} />
      </Browser>
      <Sidebar frame={frame} />
      <Caption frame={frame} />
    </AbsoluteFill>
  );
};
