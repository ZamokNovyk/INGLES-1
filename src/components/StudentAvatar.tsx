import React from 'react';
import { getAvatarUrl } from '../utils';

interface StudentAvatarProps {
  id: string;
  name: string;
  genre: 'women' | 'men';
  perfilPhotoUrl?: string;
  className?: string;
}

export const StudentAvatar: React.FC<StudentAvatarProps> = ({ id, name, genre, perfilPhotoUrl, className = "w-28 h-28" }) => {
  let displayPhotoUrl = perfilPhotoUrl;
  
  if (displayPhotoUrl && displayPhotoUrl.includes('dicebear.com')) {
    displayPhotoUrl = getAvatarUrl(name, genre);
  }

  if (displayPhotoUrl) {
    return (
      <div className={`relative flex items-center justify-center rounded-full bg-linear-to-tr from-pink-500/5 to-violet-500/5 border border-white/10 overflow-hidden ${className}`}>
        <img 
          src={displayPhotoUrl} 
          alt={name} 
          className="w-full h-full object-cover select-none"
          referrerPolicy="no-referrer"
        />
      </div>
    );
  }

  // Generate stable pseudo-random attributes based on name / ID string hashCode
  const getHashCode = (str: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return Math.abs(hash);
  };

  const hash = getHashCode(name + id);
  
  // Custom design palettes
  const skins = ['#FFD1A9', '#FCD0A1', '#E0A96D', '#FFDBAC', '#F1C27D', '#EED4A9'];
  const femaleHairColors = ['#2E8B57', '#C71585', '#FF4500', '#1E90FF', '#4B0082', '#000000', '#FFD700'];
  const maleHairColors = ['#8B4513', '#2F4F4F', '#4A3B32', '#1A1A1A', '#FF4500', '#4682B4'];
  const bgGradients = [
    'from-pink-500/10 to-violet-500/10',
    'from-cyan-500/10 to-purple-500/10',
    'from-yellow-500/10 to-pink-500/10',
    'from-emerald-500/10 to-teal-500/10'
  ];

  const skin = skins[hash % skins.length];
  const FemaleHair = femaleHairColors[hash % femaleHairColors.length];
  const MaleHair = maleHairColors[hash % maleHairColors.length];
  const bg = bgGradients[hash % bgGradients.length];

  // Draw some cartoon faces dynamically using SVG
  return (
    <div className={`relative flex items-center justify-center rounded-full bg-linear-to-tr ${bg} border border-white/10 overflow-hidden ${className}`}>
      {genre === 'women' ? (
        // FEMALE CARTOON AVATAR DESIGN
        <svg viewBox="0 0 100 100" className="w-[85%] h-[85%] select-none">
          {/* Base Head */}
          <circle cx="50" cy="55" r="22" fill={skin} />
          
          {/* Hair (Behind) */}
          {hash % 3 === 0 && <path d="M22,55 Q15,80 30,85 Q50,75 70,85 Q85,80 78,55 Z" fill={FemaleHair} />}
          
          {/* Eyes */}
          <circle cx="43" cy="53" r="3" fill="#1e1b4b" />
          <circle cx="57" cy="53" r="3" fill="#1e1b4b" />
          <circle cx="44.5" cy="51.5" r="1" fill="#ffffff" />
          <circle cx="58.5" cy="51.5" r="1" fill="#ffffff" />
          
          {/* Eyebrows */}
          <path d="M38,47 Q43,44 47,48" stroke="#1e1b4b" strokeWidth="2" fill="none" strokeLinecap="round" />
          <path d="M53,48 Q57,44 62,47" stroke="#1e1b4b" strokeWidth="2" fill="none" strokeLinecap="round" />
          
          {/* Blush / Cheeks */}
          <circle cx="39" cy="59" r="2.5" fill="#ff4d4d" fillOpacity="0.4" />
          <circle cx="61" cy="59" r="2.5" fill="#ff4d4d" fillOpacity="0.4" />

          {/* Nose */}
          <path d="M50,52 Q48,56 50,57" stroke="#1e1b4b" strokeWidth="1.5" fill="none" strokeLinecap="round" />

          {/* Mouth (various expression types) */}
          {hash % 2 === 0 ? (
            // Excited / Open
            <path d="M44,62 Q50,68 56,62 Z" fill="#b91c1c" stroke="#1e1b4b" strokeWidth="1.5" />
          ) : (
            // Cute smile
            <path d="M45,63 Q50,67 55,63" stroke="#1e1b4b" strokeWidth="2" fill="none" strokeLinecap="round" />
          )}

          {/* Hair (Front / Bangs) */}
          {hash % 2 === 0 ? (
            // Bob style bangs
            <path d="M25,50 Q50,22 75,50 Q75,40 68,36 Q50,30 32,36 Q25,40 25,50 Z" fill={FemaleHair} />
          ) : (
            // Side swept / frame
            <path d="M25,50 Q50,23 75,50 Q72,32 50,32 Q28,32 25,50 Z" fill={FemaleHair} />
          )}

          {/* Optional accessory: Flower or ribbon */}
          {hash % 3 === 1 ? (
            // Flower in hair
            <g transform="translate(68, 38) scale(0.8)">
              <circle cx="0" cy="0" r="4" fill="#ffffff" />
              <circle cx="-5" cy="0" r="3.5" fill="#fbcfe8" />
              <circle cx="5" cy="0" r="3.5" fill="#fbcfe8" />
              <circle cx="0" cy="-5" r="3.5" fill="#fbcfe8" />
              <circle cx="0" cy="5" r="3.5" fill="#fbcfe8" />
              <circle cx="0" cy="0" r="2.2" fill="#e11d48" />
            </g>
          ) : hash % 3 === 2 ? (
            // Little crown / headband
            <path d="M35,34 Q50,28 65,34" stroke="#eab308" strokeWidth="3" fill="none" strokeLinecap="round" />
          ) : null}
        </svg>
      ) : (
        // MALE CARTOON AVATAR DESIGN
        <svg viewBox="0 0 100 100" className="w-[85%] h-[85%] select-none">
          {/* Base Head */}
          <rect x="31" y="38" width="38" height="38" rx="8" fill={skin} />
          
          {/* Neck */}
          <path d="M44,70 L44,80 L56,80 L56,70 Z" fill={skin} />

          {/* Hair (Behind/Beard styles) */}
          {hash % 2 === 0 && (
            // Cute shadow stubble / beard
            <path d="M31,52 Q31,76 50,76 Q69,76 69,52 L65,52 Q65,70 50,70 Q35,70 35,52 Z" fill={MaleHair} opacity="0.3" />
          )}

          {/* Eyes */}
          <circle cx="43" cy="52" r="3" fill="#1e1b4b" />
          <circle cx="57" cy="52" r="3" fill="#1e1b4b" />
          <circle cx="44.5" cy="50.5" r="1" fill="#ffffff" />
          <circle cx="58.5" cy="50.5" r="1" fill="#ffffff" />
          
          {/* Eyebrows */}
          <rect x="37" y="44" width="10" height="2.5" rx="1" fill="#1e1b4b" />
          <rect x="53" y="44" width="10" height="2.5" rx="1" fill="#1e1b4b" />

          {/* Glasses Option */}
          {hash % 3 === 0 && (
            <g stroke="#bc13fe" strokeWidth="2.5" fill="none">
              <circle cx="43" cy="52" r="7.5" />
              <circle cx="57" cy="52" r="7.5" />
              <line x1="50.5" y1="52" x2="49.5" y2="52" />
              <line x1="31" y1="50" x2="35.5" y2="52" />
              <line x1="69" y1="50" x2="64.5" y2="52" />
            </g>
          )}

          {/* Nose */}
          <path d="M50,51 L50,56 L52,56" stroke="#1e1b4b" strokeWidth="1.8" fill="none" strokeLinecap="round" />

          {/* Mouth */}
          {hash % 3 === 1 ? (
            // Big open smile
            <path d="M43,62 Q50,68 57,62" stroke="#1e1b4b" strokeWidth="2" fill="none" strokeLinecap="round" />
          ) : hash % 3 === 2 ? (
            // Simple Line / smirk
            <path d="M45,63 L55,61" stroke="#1e1b4b" strokeWidth="2" fill="none" strokeLinecap="round" />
          ) : (
            // Cool O mouth
            <circle cx="50" cy="62" r="3.5" fill="#b91c1c" stroke="#1e1b4b" strokeWidth="1.5" />
          )}

          {/* Hair (Front / Male Style) */}
          {hash % 3 === 0 ? (
            // Spiky Anime Hair
            <path d="M26,38 Q33,18 43,26 Q50,15 57,26 Q67,18 74,38 L70,34 Q50,22 30,34 Z" fill={MaleHair} />
          ) : hash % 3 === 1 ? (
            // Classy combover
            <path d="M28,38 Q30,22 55,22 Q72,22 72,34 Q62,30 50,30 Q35,30 28,38 Z" fill={MaleHair} />
          ) : (
            // High top flat / afro style
            <path d="M28,38 L28,26 Q50,20 72,26 L72,38 Q50,36 28,38 Z" fill={MaleHair} />
          )}
        </svg>
      )}
    </div>
  );
};
