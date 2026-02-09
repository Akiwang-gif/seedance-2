import { Inter, Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], display: 'swap' });
const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-heading',
});

export const metadata = {
  title: 'Seedance Video · Text to Video & Image to Video | Seedance-2',
  description:
    'Seedance-2: Create AI videos from text and images. Seedance AI video generator—text to video, image to video, video effects. Free to try | seedance-2.info',
  keywords:
    'seedance video, seedance-2, seedance ai, AI video generator, text to video, image to video, video effects, seedance-2.info',
  openGraph: {
    type: 'website',
    title: 'Seedance Video · Seedance-2 AI Video Creator',
    description: 'Text to video, image to video, video effects. Seedance AI—create in seconds.',
    url: 'https://seedance-2.info/',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Seedance Video · Seedance-2',
    description: 'Text to video, image to video, video effects. Seedance AI.',
  },
  alternates: { canonical: 'https://seedance-2.info/' },
};

const webAppJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'Seedance-2',
  alternateName: ['Seedance Video', 'Seedance AI'],
  url: 'https://seedance-2.info/',
  applicationCategory: 'MultimediaApplication',
  description: 'Text to video, image to video, video effects. Seedance AI video creation platform.',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
};

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    { '@type': 'Question', name: 'What is Seedance-2?', acceptedAnswer: { '@type': 'Answer', text: 'Seedance-2 is an AI video tool at seedance-2.info. It offers text-to-video, image-to-video, and video effects so you can create short clips quickly for fun or content without complex software.' } },
    { '@type': 'Question', name: 'How do I create a video from text?', acceptedAnswer: { '@type': 'Answer', text: 'Click Text to Video on the home page, type a short description, choose duration and style, then click Generate video. Your Seedance Video will be ready in about 1–2 minutes.' } },
    { '@type': 'Question', name: 'Can I use my own image or video?', acceptedAnswer: { '@type': 'Answer', text: 'Yes. For image-to-video you upload an image and set motion options. For video effects you upload a video and apply filters, speed changes, or music.' } },
    { '@type': 'Question', name: 'How long does generation take?', acceptedAnswer: { '@type': 'Answer', text: 'Usually 1–2 minutes per video. Duration and resolution can affect this.' } },
    { '@type': 'Question', name: 'Is Seedance-2 free?', acceptedAnswer: { '@type': 'Answer', text: 'You can try Seedance-2 and create videos with the options on the site. Some features or higher quality may require sign-in or credits.' } },
    { '@type': 'Question', name: 'What is Seedance Video?', acceptedAnswer: { '@type': 'Answer', text: 'Seedance Video means videos created with Seedance AI tools, including Seedance-2. It refers to using this site to generate or edit AI videos.' } },
  ],
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${inter.className} ${plusJakarta.variable}`}>
        {children}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(webAppJsonLd) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      </body>
    </html>
  );
}
