import { Hero } from "@/components/Hero";
import { LandingSections } from "@/components/LandingSections";
import { Navbar } from "@/components/Navbar";

export default function Home() {
  return (
    <main className="site-shell min-h-screen overflow-x-hidden text-white">
      <Navbar />
      <Hero />
      <LandingSections />
    </main>
  );
}
