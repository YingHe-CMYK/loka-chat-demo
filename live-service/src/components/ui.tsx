import React from "react";
export function Icon({ name, size = 22 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    home: (
      <>
        <path d="m3 11 9-8 9 8v10h-6v-7H9v7H3z" />
      </>
    ),
    growth: (
      <>
        <path d="M12 21V10M12 14C3 15 3 6 3 6s9-1 9 8ZM12 10C12 2 21 3 21 3s1 8-9 7Z" />
      </>
    ),
    person: (
      <>
        <circle cx="12" cy="7" r="4" />
        <path d="M4 22v-3a8 8 0 0 1 16 0v3" />
      </>
    ),
    arrow: <path d="m9 5 7 7-7 7" />,
    back: <path d="m15 5-7 7 7 7" />,
    check: <path d="m4 12 5 5L20 6" />,
    wallet: (
      <>
        <rect x="3" y="5" width="18" height="15" rx="3" />
        <path d="M3 7V4l15-2v3m-2 7h5" />
      </>
    ),
    link: (
      <>
        <path d="m10 14 4-4M8 16l-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m0 12a4 4 0 0 0 6 0l5-5a4 4 0 0 0-6-6l-1 1" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 6v6l4 3" />
      </>
    ),
    sliders: (
      <>
        <path d="M4 6h16M4 12h16M4 18h16" />
        <circle cx="8" cy="6" r="2" />
        <circle cx="16" cy="12" r="2" />
        <circle cx="10" cy="18" r="2" />
      </>
    ),
    close: <path d="m6 6 12 12M18 6 6 18" />,
    file: (
      <>
        <path d="M5 2h9l5 5v15H5zM14 2v6h5M8 12h8M8 16h8" />
      </>
    ),
    spark: <path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3z" />,
    shield: (
      <>
        <path d="m12 2 9 4v6c0 6-9 10-9 10S3 18 3 12V6z" />
        <path d="m8 12 3 3 5-6" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.spark}
    </svg>
  );
}
export function Character({
  small = false,
  mood = "idle",
}: {
  small?: boolean;
  mood?: string;
}) {
  return (
    <div
      className={`pet-stage ${small ? "pet-small" : ""} mood-${mood}`}
      role="img"
      aria-label="Silver and violet companion with rounded eyes"
    >
      <div className="pet-art" />
    </div>
  );
}
export function Heading({
  tag,
  title,
  children,
}: {
  tag?: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="heading">
      {tag && <small className="eyebrow">{tag}</small>}
      <h1 tabIndex={-1}>{title}</h1>
      {children && <p>{children}</p>}
    </div>
  );
}
export function Button({
  children,
  secondary = false,
  onClick,
  disabled = false,
  type = "button",
}: {
  children: React.ReactNode;
  secondary?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      className={`button ${secondary ? "secondary" : "primary"}`}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
export function Row({
  title,
  subtitle,
  icon = "arrow",
  onClick,
  badge,
}: {
  title: string;
  subtitle?: string;
  icon?: string;
  onClick?: () => void;
  badge?: string;
}) {
  return (
    <button className="menu-row" onClick={onClick}>
      <span className="row-icon">
        <Icon name={icon} />
      </span>
      <span className="row-content">
        <strong>{title}</strong>
        {subtitle && <small>{subtitle}</small>}
      </span>
      {badge && <span className="badge">{badge}</span>}
      <Icon name="arrow" size={17} />
    </button>
  );
}
export function Toggle({
  label,
  note,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  note?: string;
  value: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <label className="toggle-row">
      <span>
        <strong>{label}</strong>
        {note && <small>{note}</small>}
      </span>
      <input
        type="checkbox"
        checked={value}
        onChange={onChange}
        disabled={disabled}
      />
    </label>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <article className="empty">
      <Icon name="spark" size={28} />
      <h2>{title}</h2>
      <p>{children}</p>
    </article>
  );
}
