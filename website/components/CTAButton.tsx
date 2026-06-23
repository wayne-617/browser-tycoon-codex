import type { ReactNode } from "react";

type CTAButtonProps = {
  children: ReactNode;
  tone: "magenta" | "cyan";
  icon?: ReactNode;
  suffix?: ReactNode;
};

export function CTAButton({ children, tone, icon, suffix }: CTAButtonProps) {
  return (
    <a href="#preview" className={`neon-button neon-button--${tone}`}>
      {icon}
      <span>{children}</span>
      {suffix}
    </a>
  );
}
