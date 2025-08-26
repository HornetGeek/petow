interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  type?: 'spinner' | 'dots' | 'pulse';
  color?: string;
  text?: string;
  fullScreen?: boolean;
}

export default function LoadingSpinner({ 
  size = 'md', 
  type = 'spinner', 
  color = 'var(--primary)',
  text,
  fullScreen = false 
}: LoadingSpinnerProps) {
  const sizeMap = {
    sm: '20px',
    md: '32px',
    lg: '48px'
  };

  const containerClass = fullScreen ? 'loading-container-fullscreen' : 'loading-container-inline';

  const renderSpinner = () => {
    switch (type) {
      case 'dots':
        return (
          <div className="loading-dots">
            <span style={{ backgroundColor: color }}></span>
            <span style={{ backgroundColor: color }}></span>
            <span style={{ backgroundColor: color }}></span>
          </div>
        );
      case 'pulse':
        return (
          <div 
            className="loading-pulse" 
            style={{ 
              width: sizeMap[size], 
              height: sizeMap[size],
              backgroundColor: color 
            }}
          />
        );
      default:
        return (
          <div 
            className="loading-spinner" 
            style={{ 
              width: sizeMap[size], 
              height: sizeMap[size],
              borderTopColor: color 
            }}
          />
        );
    }
  };

  return (
    <div className={containerClass}>
      <div className="loading-content">
        {renderSpinner()}
        {text && <span className="loading-text">{text}</span>}
      </div>
      
      <style jsx>{`
        .loading-container-fullscreen {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background: rgba(248, 250, 252, 0.8);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
        }

        .loading-container-inline {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2rem;
        }

        .loading-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1rem;
          background: white;
          padding: 2rem;
          border-radius: var(--card-radius);
          box-shadow: var(--shadow-lg);
        }

        .loading-container-inline .loading-content {
          background: transparent;
          padding: 0;
          box-shadow: none;
        }

        .loading-spinner {
          border: 3px solid transparent;
          border-top: 3px solid var(--primary);
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        .loading-dots {
          display: flex;
          gap: 6px;
          align-items: center;
        }

        .loading-dots span {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          animation: loading-dots 1.4s ease-in-out infinite both;
        }

        .loading-dots span:nth-child(1) { animation-delay: -0.32s; }
        .loading-dots span:nth-child(2) { animation-delay: -0.16s; }

        .loading-pulse {
          border-radius: 50%;
          animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }

        .loading-text {
          color: var(--muted);
          font-size: 1rem;
          font-weight: 500;
          text-align: center;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        @keyframes loading-dots {
          0%, 80%, 100% {
            transform: scale(0);
          }
          40% {
            transform: scale(1);
          }
        }

        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }
      `}</style>
    </div>
  );
} 