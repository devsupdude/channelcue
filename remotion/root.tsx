import React from 'react';
import { Composition } from 'remotion';
import { ChannelCueApiScreencast } from './channelcue-api-screencast';
import { ChannelCueLaunch } from './channelcue-launch';
import { ChannelCueQuotaScreencast } from './channelcue-quota-screencast';

export const Root: React.FC = () => {
  return (
    <>
      <Composition
        id="ChannelCueLaunch"
        component={ChannelCueLaunch}
        durationInFrames={540}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="ChannelCueApiScreencast"
        component={ChannelCueApiScreencast}
        durationInFrames={2940}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="ChannelCueQuotaScreencast"
        component={ChannelCueQuotaScreencast}
        durationInFrames={1860}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
