import React from 'react';
import Svg, { Circle, Line, Path, Polyline, Rect } from 'react-native-svg';

export type AppIconName =
  | 'home'
  | 'paw'
  | 'heart'
  | 'map'
  | 'user'
  | 'bell'
  | 'chat'
  | 'calendar'
  | 'document'
  | 'image'
  | 'paperclip'
  | 'search'
  | 'sliders'
  | 'location'
  | 'shield-check'
  | 'expand'
  | 'close'
  | 'plus'
  | 'logout'
  | 'envelope'
  | 'house-color'
  | 'edit'
  | 'trash'
  | 'settings'
  | 'check-circle'
  | 'send'
  | 'eye'
  | 'eye-off'
  | 'circle';

export const IconSize = {
  xs: 14,
  sm: 18,
  md: 20,
  lg: 26,
  xl: 40,
} as const;

type AppIconProps = {
  name: AppIconName;
  size?: number;
  color?: string;
  filled?: boolean;
  strokeWidth?: number;
  accessibilityLabel?: string;
  testID?: string;
};

const AppIcon: React.FC<AppIconProps> = ({
  name,
  size = IconSize.md,
  color = '#1c344d',
  filled = false,
  strokeWidth = 1.9,
  accessibilityLabel,
  testID,
}) => {
  const strokeProps = {
    stroke: color,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  const renderIcon = () => {
    switch (name) {
      case 'home':
        return (
          <>
            <Path {...strokeProps} d="M4 10.5 12 4l8 6.5V20H4z" />
            <Path {...strokeProps} d="M9.5 20v-5h5v5" />
          </>
        );
      case 'paw':
        return (
          <>
            <Circle cx="7.2" cy="7.2" r="1.85" fill={color} />
            <Circle cx="11" cy="5.3" r="1.75" fill={color} />
            <Circle cx="15" cy="5.7" r="1.75" fill={color} />
            <Circle cx="17.3" cy="9.2" r="1.85" fill={color} />
            <Path
              d="M12.1 19.2c-2.6 0-5-1.2-5-3.7 0-1.9 1.3-3.7 3.4-4.3.5-.1 1-.2 1.6-.2 3.2 0 5.8 2.1 5.8 4.8 0 2.2-2 3.4-5.8 3.4Z"
              fill={color}
            />
          </>
        );
      case 'heart':
        return (
          <Path
            {...strokeProps}
            d="M12 20s-7-4.5-8.6-8.8C2.1 7.8 4.1 5 7.3 5c2 0 3.4 1 4.7 2.8C13.3 6 14.7 5 16.7 5c3.2 0 5.2 2.8 3.9 6.2C19 15.5 12 20 12 20Z"
            fill={filled ? color : 'none'}
          />
        );
      case 'map':
        return (
          <>
            <Path {...strokeProps} d="M3.5 6.5 8.5 4l7 2.5L20.5 4v13.5l-5 2.5-7-2.5-5 2.5z" />
            <Line {...strokeProps} x1="8.5" y1="4" x2="8.5" y2="17.5" />
            <Line {...strokeProps} x1="15.5" y1="6.5" x2="15.5" y2="20" />
          </>
        );
      case 'user':
        return (
          <>
            <Circle {...strokeProps} cx="12" cy="8" r="3.25" />
            <Path {...strokeProps} d="M5.5 19c1.8-3 4-4.5 6.5-4.5s4.7 1.5 6.5 4.5" />
          </>
        );
      case 'bell':
        return (
          <>
            <Path {...strokeProps} d="M7 10.2a5 5 0 1 1 10 0V14l1.5 2.3H5.5L7 14z" />
            <Path {...strokeProps} d="M10 18.2a2.2 2.2 0 0 0 4 0" />
          </>
        );
      case 'chat':
        return (
          <>
            <Path {...strokeProps} d="M5 6.5h14v9H9.5L6 18v-2.5H5z" />
            <Circle cx="9" cy="11" r="0.9" fill={color} />
            <Circle cx="12" cy="11" r="0.9" fill={color} />
            <Circle cx="15" cy="11" r="0.9" fill={color} />
          </>
        );
      case 'calendar':
        return (
          <>
            <Rect {...strokeProps} x="4.5" y="6.5" width="15" height="13" rx="2.5" />
            <Line {...strokeProps} x1="8" y1="4.5" x2="8" y2="8.5" />
            <Line {...strokeProps} x1="16" y1="4.5" x2="16" y2="8.5" />
            <Line {...strokeProps} x1="4.5" y1="10" x2="19.5" y2="10" />
          </>
        );
      case 'document':
        return (
          <>
            <Path {...strokeProps} d="M7 3.5h7l4 4V20H7z" />
            <Path {...strokeProps} d="M14 3.5V8h4" />
            <Line {...strokeProps} x1="9" y1="12" x2="15" y2="12" />
            <Line {...strokeProps} x1="9" y1="15.5" x2="15" y2="15.5" />
          </>
        );
      case 'image':
        return (
          <>
            <Rect {...strokeProps} x="4.5" y="5.5" width="15" height="13" rx="2.5" />
            <Circle {...strokeProps} cx="9" cy="10" r="1.5" />
            <Path {...strokeProps} d="m7.5 16 3.2-3.3 2.7 2.3 2.1-2.1 2 3.1" />
          </>
        );
      case 'paperclip':
        return (
          <Path
            {...strokeProps}
            d="M9.4 8.4 14 3.8a3.2 3.2 0 0 1 4.6 4.5l-7.8 7.9a4.3 4.3 0 0 1-6.1-6.1l7.2-7.2a2.2 2.2 0 1 1 3.1 3.1L8 13.1"
          />
        );
      case 'search':
        return (
          <>
            <Circle {...strokeProps} cx="10.5" cy="10.5" r="5.5" />
            <Line {...strokeProps} x1="15" y1="15" x2="19.5" y2="19.5" />
          </>
        );
      case 'sliders':
        return (
          <>
            <Line {...strokeProps} x1="5" y1="7" x2="19" y2="7" />
            <Circle cx="9" cy="7" r="1.8" fill={color} />
            <Line {...strokeProps} x1="5" y1="12" x2="19" y2="12" />
            <Circle cx="15" cy="12" r="1.8" fill={color} />
            <Line {...strokeProps} x1="5" y1="17" x2="19" y2="17" />
            <Circle cx="11.5" cy="17" r="1.8" fill={color} />
          </>
        );
      case 'location':
        return (
          <>
            <Path {...strokeProps} d="M12 20c3.8-4.2 5.7-7.2 5.7-9.5A5.7 5.7 0 1 0 6.3 10.5C6.3 12.8 8.2 15.8 12 20Z" />
            <Circle {...strokeProps} cx="12" cy="10.3" r="2.2" />
          </>
        );
      case 'shield-check':
        return (
          <>
            <Path {...strokeProps} d="M12 3.7 18.5 6v5.4c0 4.3-2.4 7-6.5 8.9-4.1-1.9-6.5-4.6-6.5-8.9V6z" />
            <Polyline {...strokeProps} points="9.3,12.2 11.2,14.1 15.2,10.1" />
          </>
        );
      case 'expand':
        return (
          <>
            <Polyline {...strokeProps} points="9,5 5,5 5,9" />
            <Line {...strokeProps} x1="5" y1="5" x2="10" y2="10" />
            <Polyline {...strokeProps} points="15,5 19,5 19,9" />
            <Line {...strokeProps} x1="19" y1="5" x2="14" y2="10" />
            <Polyline {...strokeProps} points="5,15 5,19 9,19" />
            <Line {...strokeProps} x1="5" y1="19" x2="10" y2="14" />
            <Polyline {...strokeProps} points="19,15 19,19 15,19" />
            <Line {...strokeProps} x1="19" y1="19" x2="14" y2="14" />
          </>
        );
      case 'close':
        return (
          <>
            <Line {...strokeProps} x1="6.5" y1="6.5" x2="17.5" y2="17.5" />
            <Line {...strokeProps} x1="17.5" y1="6.5" x2="6.5" y2="17.5" />
          </>
        );
      case 'house-color':
        return (
          <>
            {/* Tree trunk */}
            <Rect x="2" y="17" width="1.6" height="4" fill="#8B6914" />
            {/* Tree foliage */}
            <Circle cx="2.8" cy="14" r="3.2" fill="#4CAF50" />
            {/* House walls */}
            <Rect x="6.5" y="12" width="14" height="9.5" rx="0.5" fill="#FFF3E0" />
            {/* Roof */}
            <Path d="M5 13 L13.5 4.5 L22 13 Z" fill="#E8583A" />
            {/* Chimney */}
            <Rect x="17" y="5.5" width="2" height="4.5" fill="#C0392B" />
            {/* Door */}
            <Path d="M11 21.5 L11 16.5 Q13.5 15 16 16.5 L16 21.5 Z" fill="#8B4513" />
            {/* Window */}
            <Rect x="7.5" y="14" width="3" height="3" rx="0.3" fill="#AEE4F8" />
            <Line x1="7.5" y1="15.5" x2="10.5" y2="15.5" stroke="#90cfe0" strokeWidth="0.4" />
            <Line x1="9" y1="14" x2="9" y2="17" stroke="#90cfe0" strokeWidth="0.4" />
          </>
        );
      case 'plus':
        return (
          <>
            <Line {...strokeProps} x1="12" y1="5" x2="12" y2="19" />
            <Line {...strokeProps} x1="5" y1="12" x2="19" y2="12" />
          </>
        );
      case 'send':
        return (
          <>
            <Path {...strokeProps} d="M22 2L11 13" />
            <Path {...strokeProps} d="M22 2L15 22L11 13L2 9z" />
          </>
        );
      case 'settings':
        return (
          <>
            <Circle {...strokeProps} cx="12" cy="12" r="3" />
            <Path
              {...strokeProps}
              d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
            />
          </>
        );
      case 'check-circle':
        return (
          <>
            <Circle {...strokeProps} cx="12" cy="12" r="9" />
            <Polyline {...strokeProps} points="9,12 11,14 15,10" />
          </>
        );
      case 'edit':
        return (
          <>
            <Path {...strokeProps} d="M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" />
            <Path {...strokeProps} d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </>
        );
      case 'trash':
        return (
          <>
            <Polyline {...strokeProps} points="3,6 5,6 21,6" />
            <Path {...strokeProps} d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <Path {...strokeProps} d="M10 11v6" />
            <Path {...strokeProps} d="M14 11v6" />
            <Path {...strokeProps} d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
          </>
        );
      case 'envelope':
        return (
          <>
            <Rect {...strokeProps} x="3" y="6" width="18" height="13" rx="2" />
            <Path {...strokeProps} d="M3 8l9 6 9-6" />
          </>
        );
      case 'logout':
        return (
          <>
            <Path {...strokeProps} d="M9 7H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h4" />
            <Line {...strokeProps} x1="15" y1="12" x2="21" y2="12" />
            <Polyline {...strokeProps} points="18,9 21,12 18,15" />
          </>
        );
      case 'eye':
        return (
          <>
            <Path {...strokeProps} d="M1.5 12s3.5-7 10.5-7 10.5 7 10.5 7-3.5 7-10.5 7-10.5-7-10.5-7z" />
            <Circle {...strokeProps} cx="12" cy="12" r="3" />
          </>
        );
      case 'eye-off':
        return (
          <>
            <Path {...strokeProps} d="M17.94 17.94A10.07 10.07 0 0 1 12 19.5c-7 0-10.5-7.5-10.5-7.5a16.54 16.54 0 0 1 4.14-5.44" />
            <Path {...strokeProps} d="M9.88 9.88a3 3 0 0 0 4.24 4.24" />
            <Path {...strokeProps} d="M19.36 5.64 4.64 19.36" />
            <Path {...strokeProps} d="M10.73 5.08A10.26 10.26 0 0 1 12 4.5c7 0 10.5 7.5 10.5 7.5a16.57 16.57 0 0 1-2.52 3.85" />
          </>
        );
      case 'circle':
        return (
          <Circle
            {...strokeProps}
            cx="12"
            cy="12"
            r="9"
            fill={filled ? color : 'none'}
          />
        );
      default:
        return null;
    }
  };

  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      {renderIcon()}
    </Svg>
  );
};

export default AppIcon;
