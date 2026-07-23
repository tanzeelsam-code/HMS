import React from 'react';

interface BrandMarkProps {
  className?: string;
}

export const BrandMark: React.FC<BrandMarkProps> = ({ className = 'h-10 w-10' }) => (
  <svg
    className={className}
    viewBox="0 0 64 64"
    role="img"
    aria-label="NexusHOS logo"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <rect x="3" y="3" width="58" height="58" rx="18" fill="#080D16" />
    <path d="M15 50V24C15 18.4772 19.4772 14 25 14H49V40C49 45.5228 44.5228 50 39 50H15Z" fill="#101A2B" />
    <path d="M16 49V24.8C16 19.388 20.388 15 25.8 15H48V39.2C48 44.612 43.612 49 38.2 49H16Z" stroke="#F7C96B" strokeOpacity="0.45" strokeWidth="2" />

    <path d="M21 40V23" stroke="#F7C96B" strokeWidth="4.2" strokeLinecap="round" />
    <path d="M31 40V23" stroke="#F7C96B" strokeWidth="4.2" strokeLinecap="round" />
    <path d="M21 31.5H31" stroke="#F7C96B" strokeWidth="4.2" strokeLinecap="round" />

    <circle cx="39.5" cy="31.5" r="8.25" stroke="#65E0C7" strokeWidth="4.2" />
    <circle cx="39.5" cy="31.5" r="2.2" fill="#65E0C7" />

    <path
      d="M50 24.2C47.9 21.5 44.7 20 40.6 20C35.6 20 32.5 22.3 32.5 25.9C32.5 29.4 35.2 31.1 39.5 31.6C44.6 32.2 47.8 33.8 47.8 37.5C47.8 41.1 44.5 43.6 39.2 43.6C34.9 43.6 31.6 42 29.7 39.2"
      stroke="#F8FAFC"
      strokeWidth="3.2"
      strokeLinecap="round"
    />
    <path d="M19 47H45" stroke="#65E0C7" strokeWidth="2.6" strokeLinecap="round" strokeOpacity="0.8" />
  </svg>
);
