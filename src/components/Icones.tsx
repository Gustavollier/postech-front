import type { ReactNode } from 'react';

type Props = { className?: string };

const base = 'h-[18px] w-[18px]';

function Svg({ children, className }: Props & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? base}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const IconePainel = (p: Props) => (
  <Svg {...p}>
    <rect x="3" y="3" width="7" height="9" rx="1.5" />
    <rect x="14" y="3" width="7" height="5" rx="1.5" />
    <rect x="14" y="12" width="7" height="9" rx="1.5" />
    <rect x="3" y="16" width="7" height="5" rx="1.5" />
  </Svg>
);
export const IconeOrdem = (p: Props) => (
  <Svg {...p}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6M9 13h6M9 17h4" />
  </Svg>
);
export const IconeCliente = (p: Props) => (
  <Svg {...p}>
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </Svg>
);
export const IconePeca = (p: Props) => (
  <Svg {...p}>
    <path d="M14.7 6.3a4 4 0 0 1 5 5L17 14l-7 7-4-4 7-7z" />
    <path d="m5 19 1.5 1.5" />
  </Svg>
);
export const IconeRede = (p: Props) => (
  <Svg {...p}>
    <rect x="2" y="14" width="20" height="8" rx="2" />
    <path d="M6 18h.01M10 18h.01M12 14V9m-5 0h10a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2z" />
  </Svg>
);
export const IconeSair = (p: Props) => (
  <Svg {...p}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
  </Svg>
);
export const IconeRaio = (p: Props) => (
  <Svg {...p}>
    <path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12z" />
  </Svg>
);
export const IconeEscudo = (p: Props) => (
  <Svg {...p}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path d="m9 12 2 2 4-4" />
  </Svg>
);
export const IconeAtualizar = (p: Props) => (
  <Svg {...p}>
    <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
    <path d="M21 3v5h-5" />
  </Svg>
);
