type CylinderIllustrationProps = {
  className?: string;
};

export function CylinderIllustration({ className }: CylinderIllustrationProps) {
  return (
    <svg className={className} viewBox="0 0 640 360" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="barrel" x1="0" x2="1" y1="0" y2="0">
          <stop stopColor="#24303A" />
          <stop offset="0.45" stopColor="#55707D" />
          <stop offset="0.65" stopColor="#283742" />
          <stop offset="1" stopColor="#151E25" />
        </linearGradient>
        <linearGradient id="rod" x1="0" x2="1" y1="0" y2="0">
          <stop stopColor="#A9BBC2" />
          <stop offset="0.5" stopColor="#F0F5F5" />
          <stop offset="1" stopColor="#71858D" />
        </linearGradient>
      </defs>
      <path
        d="M86 115h70l23-27h211l24 27h66v130h-66l-24 27H179l-23-27H86z"
        fill="url(#barrel)"
        stroke="#8BA2A9"
        strokeWidth="2"
      />
      <path d="M413 148h154v64H413z" fill="url(#rod)" stroke="#B7C8CD" strokeWidth="2" />
      <path d="M566 160h42v40h-42z" fill="#96A9AE" stroke="#D5E0E2" strokeWidth="2" />
      <path
        d="M152 130h24v100h-24zM392 130h24v100h-24z"
        fill="#111B22"
        stroke="#90A9AF"
        strokeWidth="2"
      />
      <path d="M191 111h184v138H191z" fill="#314550" stroke="#8BA2A9" strokeWidth="2" />
      <path d="M203 126h160" stroke="#89A4AC" strokeWidth="2" opacity=".6" />
      <circle cx="121" cy="180" r="18" fill="#162129" stroke="#9BB2B8" strokeWidth="7" />
      <circle cx="458" cy="180" r="10" fill="#D1010C" />
      <path d="M241 150h78M241 210h53" stroke="#6D8991" strokeWidth="4" strokeLinecap="round" />
      <path d="M92 288h456" stroke="#D1010C" strokeWidth="2" strokeDasharray="8 10" opacity=".75" />
      <path d="M92 276v24M548 276v24" stroke="#D1010C" strokeWidth="2" />
    </svg>
  );
}
