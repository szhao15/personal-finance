import { Footer, PeaceOfMind, Pricing, Reviews } from './components/Bottom'
import { SpendingSection, WealthSection } from './components/Features'
import { AnnouncementBar, Hero, Mission, Nav, Platforms } from './components/Top'

export default function App() {
  return (
    <>
      <AnnouncementBar />
      <Nav />
      <Hero />
      <Mission />
      <Platforms />
      <SpendingSection />
      <WealthSection />
      <Pricing />
      <Reviews />
      <PeaceOfMind />
      <Footer />
    </>
  )
}
