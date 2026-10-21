type P = { className?: string }

function Icon({ children, className }: P & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export const FrameIcon = (p: P) => (
  <Icon {...p}>
    <rect x="7" y="2.75" width="10" height="18.5" rx="1" />
    <path d="M9 5h6v3.5H9zM9 10.25h6v3.5H9zM9 15.5h6V19H9z" />
  </Icon>
)

export const RoomIcon = (p: P) => (
  <Icon {...p}>
    <path d="M4 4.5h16M5.5 4.5v8.5c0 3 2 4.5 6.5 4.5s6.5-1.5 6.5-4.5V4.5" />
    <path d="M4 21.25 6 17.5M20 21.25l-2-3.75" />
  </Icon>
)

export const EffectIcon = (p: P) => (
  <Icon {...p}>
    <circle cx="9.5" cy="12" r="5.75" />
    <circle cx="14.5" cy="12" r="5.75" />
  </Icon>
)

export const TimerIcon = (p: P) => (
  <Icon {...p}>
    <circle cx="12" cy="13" r="8" />
    <path d="M12 13V8.5M10 2.75h4" />
  </Icon>
)

export const MirrorIcon = (p: P) => (
  <Icon {...p}>
    <path d="M12 3v18M8.5 6.5 4 12l4.5 5.5M15.5 6.5 20 12l-4.5 5.5" />
  </Icon>
)

export const SoundIcon = (p: P) => (
  <Icon {...p}>
    <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
    <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />
  </Icon>
)

export const CameraOffIcon = (p: P) => (
  <Icon {...p}>
    <rect x="3" y="6.5" width="13" height="11" rx="2" />
    <path d="m16 10.5 5-3v9l-5-3M3 3.5l18 17" />
  </Icon>
)

export const KioskIcon = (p: P) => (
  <Icon {...p}>
    <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />
  </Icon>
)

export const ShuffleIcon = (p: P) => (
  <Icon {...p}>
    <path d="M3.5 7h3c4.5 0 6.5 10 11 10h3M3.5 17h3c1.6 0 2.8-1.2 3.8-2.8M13.7 9.8C14.7 8.2 15.9 7 17.5 7h3" />
    <path d="m18.5 4.5 2.5 2.5-2.5 2.5M18.5 14.5l2.5 2.5-2.5 2.5" />
  </Icon>
)

export const InviteIcon = (p: P) => (
  <Icon {...p}>
    <circle cx="9" cy="8.5" r="3.5" />
    <path d="M2.75 20c.6-3.4 3.1-5.5 6.25-5.5s5.65 2.1 6.25 5.5M18.5 8v6M15.5 11h6" />
  </Icon>
)
