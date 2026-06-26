import type { ReactNode } from "react";

type CTAButtonProps = {
  children: ReactNode;
  tone: "magenta" | "cyan";
  href?: string;
  icon?: ReactNode;
  suffix?: ReactNode;
};

export function CTAButton({ children, tone, href = "#preview", icon, suffix }: CTAButtonProps) {
  const isExternal = href.startsWith("http");

  return (
    <a
      href={href}
      className={`neon-button neon-button--${tone}`}
      target={isExternal ? "_blank" : undefined}
      rel={isExternal ? "noreferrer" : undefined}
    >
      {icon}
      <span>{children}</span>
      {suffix}
    </a>
  );
}
