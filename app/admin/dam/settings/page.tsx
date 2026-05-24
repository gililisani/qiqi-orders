'use client';

import Link from 'next/link';
import { Globe, Boxes, FolderTree, Tag as TagIcon, Package } from 'lucide-react';

import { PageHeader } from '../../../components/qq/page-header';
import { Card } from '../../../components/qq/card';

interface Section {
  href: string;
  title: string;
  description: string;
  icon: React.ReactNode;
}

const SECTIONS: Section[] = [
  {
    href: '/admin/dam/settings/product-lines',
    title: 'Product lines',
    description: 'Product line options (ProCtrl, SelfCtrl, Both, None).',
    icon: <Package className="h-5 w-5" />,
  },
  {
    href: '/admin/dam/settings/locales',
    title: 'Locales',
    description: 'Language and locale options for assets.',
    icon: <Globe className="h-5 w-5" />,
  },
  {
    href: '/admin/dam/settings/asset-types',
    title: 'Asset types',
    description: 'Main asset categories (Image, Video, Document, etc.).',
    icon: <Boxes className="h-5 w-5" />,
  },
  {
    href: '/admin/dam/settings/asset-subtypes',
    title: 'Asset sub-types',
    description: 'Sub-categories within each asset type.',
    icon: <FolderTree className="h-5 w-5" />,
  },
  {
    href: '/admin/dam/settings/tags',
    title: 'Tags',
    description: 'Tags for categorizing and searching assets.',
    icon: <TagIcon className="h-5 w-5" />,
  },
];

export default function SettingsPage() {
  return (
    <div className="px-6 py-8 space-y-4">
      <PageHeader title="DAM settings" description="Manage taxonomy and tagging." />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {SECTIONS.map((s) => (
          <Link key={s.href} href={s.href} className="block">
            <Card className="p-5 hover:border-foreground/30 hover:shadow-sm transition-all h-full">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-md bg-muted/60 flex items-center justify-center text-foreground shrink-0">
                  {s.icon}
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold">{s.title}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{s.description}</p>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
