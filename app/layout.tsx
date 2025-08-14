// app/layout.tsx

export const metadata = {
  title: 'Qiqi Orders',
  description: 'Submit and manage your Qiqi distributor orders',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
