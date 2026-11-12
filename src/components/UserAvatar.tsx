import React, { useState } from 'react';

interface UserAvatarProps {
  name: string;
  avatarUrl?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | number;
  className?: string;
}

const BG_COLORS = [
  'bg-emerald-600',
  'bg-indigo-600',
  'bg-sky-600',
  'bg-amber-600',
  'bg-rose-600',
  'bg-teal-600',
  'bg-violet-600',
  'bg-blue-600'
];

export const UserAvatar: React.FC<UserAvatarProps> = ({
  name,
  avatarUrl,
  size = 'md',
  className = ''
}) => {
  const [imageError, setImageError] = useState(false);

  // Compute initials
  const cleanName = (name || 'User').trim();
  const parts = cleanName.split(/\s+/).filter(Boolean);
  const initials = parts.length >= 2
    ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
    : cleanName.slice(0, 2).toUpperCase();

  // Deterministic background color
  let hash = 0;
  for (let i = 0; i < cleanName.length; i++) {
    hash = (hash << 5) - hash + cleanName.charCodeAt(i);
    hash |= 0;
  }
  const colorClass = BG_COLORS[Math.abs(hash) % BG_COLORS.length];

  // Sizing
  let dimensionClass = 'w-8 h-8 text-xs';
  if (size === 'xs') dimensionClass = 'w-6 h-6 text-[10px]';
  else if (size === 'sm') dimensionClass = 'w-7 h-7 text-[11px]';
  else if (size === 'md') dimensionClass = 'w-8 h-8 text-xs';
  else if (size === 'lg') dimensionClass = 'w-10 h-10 text-sm font-bold';

  const isNumericSize = typeof size === 'number';
  const customStyle = isNumericSize ? { width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.38)}px` } : undefined;

  const validUrl = avatarUrl && (avatarUrl.startsWith('https://') || avatarUrl.startsWith('data:image/'));

  if (validUrl && !imageError) {
    return (
      <img
        src={avatarUrl}
        alt={cleanName}
        onError={() => setImageError(true)}
        style={customStyle}
        className={`${!isNumericSize ? dimensionClass : ''} rounded-full object-cover shrink-0 border border-slate-700/60 ${className}`}
      />
    );
  }

  return (
    <div
      style={customStyle}
      title={cleanName}
      className={`${!isNumericSize ? dimensionClass : ''} ${colorClass} text-white font-semibold flex items-center justify-center rounded-full shrink-0 select-none shadow-sm ${className}`}
    >
      <span>{initials}</span>
    </div>
  );
};

