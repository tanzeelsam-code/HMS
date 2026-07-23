import React from 'react';

interface BrandMarkProps {
  className?: string;
}

export const BrandMark: React.FC<BrandMarkProps> = ({ className = 'h-10 w-10' }) => (
  <svg
    className={className}
    viewBox="0 0 64 64"
    role="img"
    aria-label="Nexus HOS logo"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <defs>
      {/* Dark Luxury Slate-Indigo Background Gradient */}
      <linearGradient id="nexusBgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#0D1527" />
        <stop offset="50%" stopColor="#080D1A" />
        <stop offset="100%" stopColor="#03060D" />
      </linearGradient>

      {/* Warm Premium Gold Gradient */}
      <linearGradient id="nexusGoldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#FDE68A" />
        <stop offset="35%" stopColor="#F59E0B" />
        <stop offset="100%" stopColor="#B45309" />
      </linearGradient>

      {/* Gold Radiant Highlight */}
      <linearGradient id="nexusGoldLight" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#FFFBEB" />
        <stop offset="50%" stopColor="#FCD34D" />
        <stop offset="100%" stopColor="#F59E0B" />
      </linearGradient>

      {/* Tech Cyan/Teal OS Core Accent */}
      <linearGradient id="nexusCyanGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#38BDF8" />
        <stop offset="100%" stopColor="#0D9488" />
      </linearGradient>

      {/* Glowing Outer Border */}
      <linearGradient id="nexusBorderGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.6" />
        <stop offset="50%" stopColor="#38BDF8" stopOpacity="0.3" />
        <stop offset="100%" stopColor="#D97706" stopOpacity="0.5" />
      </linearGradient>

      {/* Soft Glow Effect */}
      <filter id="nexusGlow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="1.5" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
    </defs>

    {/* Outer Container Squircle */}
    <rect
      x="2"
      y="2"
      width="60"
      height="60"
      rx="16"
      fill="url(#nexusBgGrad)"
    />
    <rect
      x="2"
      y="2"
      width="60"
      height="60"
      rx="16"
      stroke="url(#nexusBorderGrad)"
      strokeWidth="1.5"
    />

    {/* Subtle Architectural Horizon Lines */}
    <line x1="12" y1="47" x2="52" y2="47" stroke="#1E293B" strokeWidth="1" strokeDasharray="3 2" />

    {/* Monogram Pillar Left (N Stem) */}
    <path
      d="M 17 44 V 22 C 17 18.7 19.7 16 23 16 C 25.2 16 27 17.8 27 20 V 44 H 22 C 19.2 44 17 41.8 17 39 Z"
      fill="url(#nexusGoldGrad)"
    />

    {/* Monogram Pillar Right (H Stem) */}
    <path
      d="M 37 20 C 37 17.8 38.8 16 41 16 C 44.3 16 47 18.7 47 22 V 44 H 42 C 39.2 44 37 41.8 37 39 V 20 Z"
      fill="url(#nexusGoldGrad)"
    />

    {/* Dynamic Monogram Diagonal (Nexus Beam) */}
    <path
      d="M 21.5 19.5 L 42.5 40.5"
      stroke="url(#nexusGoldLight)"
      strokeWidth="4"
      strokeLinecap="round"
    />

    {/* HOS OS Kernel Horizontal Bridge */}
    <path
      d="M 27 32 H 37"
      stroke="url(#nexusCyanGrad)"
      strokeWidth="3"
      strokeLinecap="round"
    />

    {/* Central Core Node (Nexus OS Kernel Dot) */}
    <circle
      cx="32"
      cy="32"
      r="4"
      fill="#0A0F1D"
      stroke="url(#nexusCyanGrad)"
      strokeWidth="2"
      filter="url(#nexusGlow)"
    />
    <circle
      cx="32"
      cy="32"
      r="1.5"
      fill="#38BDF8"
    />

    {/* Top Crown Arch (Hotel Distinction) */}
    <path
      d="M 25 13.5 C 28.5 11.5 35.5 11.5 39 13.5"
      stroke="url(#nexusGoldLight)"
      strokeWidth="1.75"
      strokeLinecap="round"
      fill="none"
    />
  </svg>
);
