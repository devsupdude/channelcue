import React from 'react';
import { Composition } from 'remotion';
import { ChannelCueLaunch } from './channelcue-launch';

export const Root: React.FC = () => {
  return (
    <Composition
      id="ChannelCueLaunch"
      component={ChannelCueLaunch}
      durationInFrames={540}
      fps={30}
      width={1920}
      height={1080}
    />
  );
};
