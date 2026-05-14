interface LoadingScreenProps {
  message?: string;
}

export function LoadingScreen({ message }: LoadingScreenProps) {
  return (
    <div
      style={{
        background: '#0A0A0A',
        width: '100vw',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '24px',
      }}
    >
      <div style={{ position: 'relative', width: '120px', height: '120px' }}>
        <div
          className="animate-spin"
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            border: '3px solid transparent',
            borderTopColor: '#D4AF37',
            borderRightColor: '#D4AF37',
          }}
        />
        <img
          src="/logo3.png"
          alt="APPLevel"
          style={{
            position: 'absolute',
            inset: '12px',
            width: 'calc(100% - 24px)',
            height: 'calc(100% - 24px)',
            objectFit: 'contain',
          }}
        />
      </div>
      {message && (
        <p
          style={{
            color: '#6B7280',
            fontSize: '0.85rem',
            textAlign: 'center',
            maxWidth: '260px',
          }}
        >
          {message}
        </p>
      )}
    </div>
  );
}
