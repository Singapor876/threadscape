import './globals.css';

export const metadata = {
  title: 'Threadscape · 分支式 AI 知识探索',
  description: '把每一次追问沉淀为可回溯、可生长的知识树。',
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
