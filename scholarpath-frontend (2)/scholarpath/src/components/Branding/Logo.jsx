/**
 * ScholarPath AI — Inline SVG Logo
 *
 * A minimalist graduation cap (mortarboard) with a sleek jet plane
 * cutting through an upward-curving orbit trail. Uses a premium
 * Royal Indigo → Teal gradient.
 */
export default function LogoSVG({ size = 36 }) {
  return (
    <div className="flex items-center gap-2">
      <svg
        width={size}
        height={size}
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="ScholarPath AI"
      >
        <defs>
          <linearGradient id="sp-logo-grad" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#2563EB" />
            <stop offset="100%" stopColor="#0D9488" />
          </linearGradient>
        </defs>

        {/* Mortarboard diamond top */}
        <path
          d="M3 19L20 10L37 19L20 28Z"
          fill="url(#sp-logo-grad)"
        />
        {/* Board underside */}
        <path
          d="M8 21.2V27.5C8 29.8 13.4 32 20 32C26.6 32 32 29.8 32 27.5V21.2"
          stroke="url(#sp-logo-grad)"
          strokeWidth="1.8"
          fill="none"
          strokeLinecap="round"
        />
        {/* Tassel */}
        <line x1="33" y1="19.5" x2="33" y2="29" stroke="#0D9488" strokeWidth="1.4" strokeLinecap="round" />
        <circle cx="33" cy="30.5" r="1.5" fill="#0D9488" />

        {/* Orbit trail — dashed curve from cap to plane */}
        <path
          d="M26 23C30 27 33 29 34.5 30C32 32 28 34.5 23 35.5C17 37 11.5 36 8 33.5C5 31 5.5 27 9 24.5C13 21.5 18 21 22 22.5"
          stroke="url(#sp-logo-grad)"
          strokeWidth="1.1"
          strokeDasharray="2.5 2"
          fill="none"
          strokeLinecap="round"
        />

        {/* Paper airplane — sleek delta pointing up-right */}
        <path
          d="M33.5 6L37.5 16L33.5 13.5L29.5 16Z"
          fill="url(#sp-logo-grad)"
        />
        {/* Plane fold line */}
        <line x1="33.5" y1="6" x2="33.5" y2="13.5" stroke="white" strokeWidth="0.6" opacity="0.5" />
      </svg>

      <span className="text-lg font-extrabold tracking-tight text-sp-navy">
        ScholarPath <span className="text-sp-blue font-semibold">AI</span>
      </span>
    </div>
  )
}
