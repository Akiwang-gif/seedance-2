import { Inter, Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';
import { SessionProvider } from './components/SessionProvider';

const inter = Inter({ subsets: ['latin'], display: 'swap' });
const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-heading',
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.seedance-2.info';

export const metadata = {
  title: 'Seedance Video · Image to Video | Seedance-2',
  description:
    'Seedance-2: Create AI videos from images. Seedance AI image-to-video generator. Free to try | seedance-2.info',
  keywords:
    'seedance video, seedance-2, seedance ai, AI video generator, image to video, seedance-2.info',
  robots: { index: true, follow: true },
  openGraph: {
    type: 'website',
    title: 'Seedance Video · Seedance-2 AI Image to Video',
    description: 'Image to video. Seedance AI—create in seconds.',
    url: `${SITE_URL}/`,
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Seedance Video · Seedance-2',
    description: 'Image to video. Seedance AI.',
  },
  alternates: { canonical: `${SITE_URL}/` },
};

const webAppJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'Seedance-2',
  alternateName: ['Seedance Video', 'Seedance AI'],
  url: `${SITE_URL}/`,
  applicationCategory: 'MultimediaApplication',
  description: 'Image to video. Seedance AI video creation platform.',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
};

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    { '@type': 'Question', name: 'What is Seedance-2?', acceptedAnswer: { '@type': 'Answer', text: 'Seedance-2 is an AI video tool at seedance-2.info. It offers image-to-video so you can turn still images into short clips quickly for fun or content without complex software.' } },
    { '@type': 'Question', name: 'Can I use my own image?', acceptedAnswer: { '@type': 'Answer', text: 'Yes. Upload an image and describe the motion or scene. Supported formats are PNG, JPG, and WEBP.' } },
    { '@type': 'Question', name: 'How long does generation take?', acceptedAnswer: { '@type': 'Answer', text: 'Usually 1–2 minutes per video. Duration and resolution can affect this.' } },
    { '@type': 'Question', name: 'Is Seedance-2 free?', acceptedAnswer: { '@type': 'Answer', text: 'You can try Seedance-2 and create videos with the options on the site. Some features or higher quality may require sign-in or credits.' } },
    { '@type': 'Question', name: 'What is Seedance Video?', acceptedAnswer: { '@type': 'Answer', text: 'Seedance Video means videos created with Seedance AI tools, including Seedance-2. It refers to using this site to generate AI videos from your images.' } },
  ],
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${inter.className} ${plusJakarta.variable}`}>
        <SessionProvider>{children}</SessionProvider>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(webAppJsonLd) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      </body>
    </html>
  );
}
