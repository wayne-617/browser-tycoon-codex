import {
  ArrowPathRoundedSquareIcon,
  ArrowTrendingUpIcon,
  BoltIcon,
  Squares2X2Icon,
} from "@heroicons/react/24/outline";
import { CTAButton } from "./CTAButton";
import { ChromeIcon } from "./Icons";
import { UnifiedProductPreview } from "./UnifiedProductPreview";
import { CHROME_WEB_STORE_URL } from "../lib/links";

const features = [
  { title: "Upgrade Domains", copy: "Turn everyday sites into powerful income engines and push every domain further.", icon: ArrowTrendingUpIcon },
  { title: "Earn While Browsing", copy: "Keep surfing normally while your active and background domains generate revenue.", icon: BoltIcon },
  { title: "Unlock Slots", copy: "Expand your browser empire with more domain slots and smarter combinations.", icon: Squares2X2Icon },
  { title: "Prestige & Rebuild", copy: "Reset at the right moment, earn Cache Credits, and return stronger than before.", icon: ArrowPathRoundedSquareIcon },
];

export function LandingSections() {
  return (
    <>
      <section id="preview" className="content-section preview-section scroll-mt-16">
        <div className="boundary-preview mx-auto max-w-[1280px]">
          <UnifiedProductPreview />
        </div>
      </section>

      <section id="features" className="content-section features-section scroll-mt-16">
        <div className="section-heading mx-auto max-w-3xl text-center">
          <p className="eyebrow">BUILD YOUR LOOP</p>
          <h2>From blank tab to <span>tech empire</span></h2>
          <p>Simple systems layer together into a satisfying idle game that lives alongside the web.</p>
        </div>
        <div className="feature-grid mx-auto mt-12 grid max-w-[1160px] gap-5 md:grid-cols-2 lg:grid-cols-4">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <article className="feature-card" key={feature.title}>
                <div className="feature-icon"><Icon /></div>
                <h3>{feature.title}</h3>
                <p>{feature.copy}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section id="final-cta" className="final-cta content-section scroll-mt-16">
        <div className="final-cta-panel mx-auto flex max-w-[920px] flex-col items-center text-center">
          <p className="eyebrow">READY TO TAKE OVER?</p>
          <h2>The web is waiting.</h2>
          <p>Install Browser Tycoon and start building your empire today.</p>
          <div className="mt-8 w-full max-w-[330px]">
            <CTAButton tone="cyan" href={CHROME_WEB_STORE_URL} icon={<ChromeIcon />}>ADD TO CHROME</CTAButton>
          </div>
          <span className="cta-caption">Free to play. No signup required.</span>
        </div>
      </section>
    </>
  );
}
