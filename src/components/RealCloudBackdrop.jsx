import React from 'react';

export default function RealCloudBackdrop({ tableNoAlpha, cloudWebmUrl, cloudWebpUrl }) {
  const fill = { width: '100%', height: '100%', objectFit: 'contain', filter: 'drop-shadow(0 20px 45px rgba(0, 0, 0, 0.85))' };
  return (
    <div
      style={{
        position: 'absolute', inset: '-16% -12%', width: '124%', height: '132%', zIndex: -1,
        pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}
    >
      {!tableNoAlpha ? (
        <video autoPlay muted loop playsInline webkit-playsinline="true" preload="auto" src={cloudWebmUrl} style={fill} />
      ) : (
        <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <img src={cloudWebpUrl} alt="" style={fill} />
          <div
            style={{
              position: 'absolute', width: '48%', aspectRatio: '1 / 1', borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(162, 136, 207, 0.98) 0%, rgba(124, 96, 176, 0.96) 48%, rgba(88, 62, 140, 0.78) 72%, rgba(60, 38, 105, 0) 100%)',
              filter: 'blur(12px)', boxShadow: 'inset 0 0 40px rgba(255, 225, 160, 0.35)'
            }}
          />
        </div>
      )}
    </div>
  );
}
