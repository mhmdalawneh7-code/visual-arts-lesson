import type {Metadata} from 'next';import './globals.css';
export const metadata:Metadata={title:'تحدّي | مساحة التعلّم الممتع',description:'أنشئ مسابقة عربية، شارك رمز الدخول، وانطلق مع طلابك.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="ar" dir="rtl"><body>{children}</body></html>}
