import React from 'react';
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig
} from 'remotion';

const channels = [
  'Design Notes',
  'AI Frontiers',
  'Camera Lab',
  'Climate Desk',
  'Founder Talks',
  'History Hour',
  'Code Review'
];

const topics = ['AI hardware', 'foldables', 'climate', 'camera tests'];

const colors = {
  bg: '#f5f3ee',
  ink: '#1b2321',
  muted: '#65706b',
  red: '#c9342f',
  teal: '#137a7f',
  gold: '#c58a1d',
  paper: '#fffdf8',
  line: '#dfe6e1'
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  color: colors.ink,
  fontFamily: 'Inter, Arial, sans-serif',
  fontSize: 112,
  fontWeight: 900,
  letterSpacing: 0,
  lineHeight: 0.94
};

const smallCaps: React.CSSProperties = {
  color: colors.red,
  fontFamily: 'Inter, Arial, sans-serif',
  fontSize: 28,
  fontWeight: 900,
  letterSpacing: 0,
  textTransform: 'uppercase'
};

const Card: React.FC<{
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ children, style }) => (
  <div
    style={{
      border: `3px solid ${colors.line}`,
      borderRadius: 16,
      background: colors.paper,
      boxShadow: '0 32px 90px rgba(27, 35, 33, 0.14)',
      ...style
    }}
  >
    {children}
  </div>
);

export const ChannelCueLaunch: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const heroIn = spring({ frame, fps, config: { damping: 18, stiffness: 80 } });
  const feedShift = interpolate(frame, [70, 170], [0, -920], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  });
  const focusOpacity = interpolate(frame, [128, 168], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  });
  const searchIn = spring({ frame: frame - 210, fps, config: { damping: 18 } });
  const finalIn = spring({ frame: frame - 390, fps, config: { damping: 16 } });

  return (
    <AbsoluteFill style={{ background: colors.bg, overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(circle at 18% 18%, rgba(19,122,127,0.16), transparent 34%), radial-gradient(circle at 86% 74%, rgba(197,138,29,0.18), transparent 34%)'
        }}
      />

      <div
        style={{
          position: 'absolute',
          left: 105,
          top: 88,
          width: 700,
          opacity: heroIn,
          transform: `translateY(${interpolate(heroIn, [0, 1], [42, 0])}px)`
        }}
      >
        <div style={smallCaps}>ChannelCue</div>
        <h1 style={titleStyle}>Your subscriptions, without the scroll.</h1>
        <p
          style={{
            marginTop: 28,
            color: colors.muted,
            fontFamily: 'Inter, Arial, sans-serif',
            fontSize: 38,
            lineHeight: 1.18
          }}
        >
          Search recent uploads, skim summaries, and get back to your day.
        </p>
      </div>

      <div
        style={{
          position: 'absolute',
          right: 95,
          top: 70,
          width: 790,
          height: 850,
          transform: `translateY(${feedShift}px)`
        }}
      >
        {channels.concat(channels).map((channel, index) => {
          const y = index * 118;
          const wiggle = Math.sin((frame + index * 9) / 18) * 8;
          return (
            <Card
              key={`${channel}-${index}`}
              style={{
                position: 'absolute',
                left: index % 2 ? 42 : 0,
                top: y + wiggle,
                width: 705,
                padding: '26px 30px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
                <div
                  style={{
                    width: 74,
                    height: 74,
                    borderRadius: 14,
                    background: index % 3 === 0 ? colors.red : index % 3 === 1 ? colors.teal : colors.gold
                  }}
                />
                <div>
                  <div
                    style={{
                      color: colors.ink,
                      fontFamily: 'Inter, Arial, sans-serif',
                      fontSize: 34,
                      fontWeight: 850
                    }}
                  >
                    {channel}
                  </div>
                  <div
                    style={{
                      marginTop: 8,
                      color: colors.muted,
                      fontFamily: 'Inter, Arial, sans-serif',
                      fontSize: 23
                    }}
                  >
                    New upload, comments, more recommended videos...
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <Card
        style={{
          position: 'absolute',
          right: 130,
          top: 245,
          width: 720,
          padding: 34,
          opacity: focusOpacity,
          transform: `scale(${interpolate(focusOpacity, [0, 1], [0.92, 1])})`
        }}
      >
        <div style={{ ...smallCaps, color: colors.teal }}>A calmer way in</div>
        <div
          style={{
            marginTop: 18,
            color: colors.ink,
            fontFamily: 'Inter, Arial, sans-serif',
            fontSize: 50,
            fontWeight: 900,
            lineHeight: 1.02
          }}
        >
          No homepage. No rabbit holes. Just the channels you chose.
        </div>
      </Card>

      <div
        style={{
          position: 'absolute',
          left: 105,
          bottom: 100,
          width: 760,
          opacity: searchIn,
          transform: `translateY(${interpolate(searchIn, [0, 1], [50, 0])}px)`
        }}
      >
        <Card style={{ padding: 28 }}>
          <div
            style={{
              border: `3px solid ${colors.line}`,
              borderRadius: 14,
              padding: '20px 24px',
              color: colors.ink,
              fontFamily: 'Inter, Arial, sans-serif',
              fontSize: 34,
              fontWeight: 850,
              background: '#ffffff'
            }}
          >
            Search: {topics[Math.floor(frame / 34) % topics.length]}
          </div>
          <div style={{ display: 'grid', gap: 14, marginTop: 22 }}>
            {['Latest video', 'Channel brief', 'Why it matters'].map((label, index) => (
              <div
                key={label}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '120px 1fr',
                  gap: 18,
                  alignItems: 'center',
                  opacity: interpolate(frame - 245 - index * 12, [0, 20], [0, 1], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp'
                  })
                }}
              >
                <div
                  style={{
                    height: 66,
                    borderRadius: 12,
                    background: index === 0 ? colors.red : index === 1 ? colors.teal : colors.gold
                  }}
                />
                <div
                  style={{
                    color: colors.muted,
                    fontFamily: 'Inter, Arial, sans-serif',
                    fontSize: 29,
                    fontWeight: 750
                  }}
                >
                  {label} from a subscribed channel
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `rgba(245,243,238,${interpolate(frame, [382, 420], [0, 0.92], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp'
          })})`
        }}
      />

      <div
        style={{
          position: 'absolute',
          left: 130,
          right: 130,
          top: 225,
          textAlign: 'center',
          opacity: finalIn,
          transform: `translateY(${interpolate(finalIn, [0, 1], [36, 0])}px)`
        }}
      >
        <div style={smallCaps}>ChannelCue Pro</div>
        <h2
          style={{
            ...titleStyle,
            margin: '20px auto 0',
            maxWidth: 1320,
            fontSize: 126
          }}
        >
          Keep up without getting carried away.
        </h2>
        <p
          style={{
            margin: '32px auto 0',
            maxWidth: 920,
            color: colors.muted,
            fontFamily: 'Inter, Arial, sans-serif',
            fontSize: 40,
            lineHeight: 1.22
          }}
        >
          7 days free. Then $36 per year with every update included.
        </p>
        <div
          style={{
            display: 'inline-flex',
            marginTop: 44,
            padding: '24px 38px',
            borderRadius: 16,
            background: colors.red,
            color: '#fff',
            fontFamily: 'Inter, Arial, sans-serif',
            fontSize: 36,
            fontWeight: 900
          }}
        >
          Start your calmer YouTube ritual
        </div>
      </div>
    </AbsoluteFill>
  );
};
