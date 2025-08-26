import type { Metadata } from 'next'
import './globals.css'
import { AuthProvider } from '@/contexts/AuthContext'

export const metadata: Metadata = {
  title: 'Peto – Care. Match. Love. - منصة التزاوج الآمن للحيوانات الأليفة',
  description: 'اعثر على الشريك المثالي لحيوانك الأليف مع Peto. منصة موثوقة تضمن التوثيق البيطري الكامل والمطابقة المثالية بناءً على السلالة والصحة والمزاج.',
  keywords: 'حيوانات أليفة, تزاوج حيوانات, قطط, كلاب, طيور, أرانب, تربية حيوانات, رعاية بيطرية',
  authors: [{ name: 'Peto Team' }],
  openGraph: {
    title: 'Peto – Care. Match. Love. - منصة التزاوج الآمن للحيوانات الأليفة',
    description: 'اعثر على الشريك المثالي لحيوانك الأليف مع ضمان التوثيق البيطري والأمان الكامل',
    type: 'website',
    locale: 'ar_SA',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Peto – Care. Match. Love. - منصة التزاوج الآمن للحيوانات الأليفة',
    description: 'اعثر على الشريك المثالي لحيوانك الأليف مع ضمان التوثيق البيطري والأمان الكامل',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#6366F1" />
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />
      </head>
      <body suppressHydrationWarning={true}>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  )
}
