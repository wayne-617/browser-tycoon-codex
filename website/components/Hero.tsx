import Image from "next/image";
import { CTAButton } from "./CTAButton";
import { ChromeIcon } from "./Icons";
import { CHROME_WEB_STORE_URL } from "../lib/links";

export function Hero() {
  return (
    <section id="home" className="hero relative z-10 overflow-hidden px-4 sm:px-7">
      <div className="hero-content mx-auto flex max-w-[1320px] flex-col items-center">
        <div className="logo-wrap relative">
          <Image
            src="/images/browser-tycoon-logo.png"
            alt="Browser Tycoon"
            width={1586}
            height={992}
            priority
            className="hero-logo h-auto w-full"
          />
        </div>
        <div className="hero-copy text-center">
          <h1>Build. Optimize. <span>Dominate.</span></h1>
          <p>Start with a blank browser and build a tech empire.<br />Research, design, and conquer the web.</p>
        </div>
        <div className="cta-row mt-6 flex w-full max-w-[330px] justify-center">
          <CTAButton tone="cyan" href={CHROME_WEB_STORE_URL} icon={<ChromeIcon />}>ADD TO CHROME</CTAButton>
        </div>
        <p className="free-note mt-4"><span>*</span> Free to play. No signup required.</p>
      </div>
    </section>
  );
}
