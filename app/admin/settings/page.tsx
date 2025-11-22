'use client';

import Link from 'next/link';

export default function SettingsPage() {
  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-gray-900">Settings / Taxonomy</h2>
        <p className="text-sm text-gray-500 mt-1">Manage taxonomy settings for your Digital Asset Manager.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link
          href="/admin/settings/product-lines"
          className="group relative bg-white rounded-md border border-gray-200 overflow-hidden shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer p-6"
        >
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Product Lines</h3>
          <p className="text-sm text-gray-500">Manage product line options (ProCtrl, SelfCtrl, Both, None)</p>
        </Link>

        <Link
          href="/admin/settings/locales"
          className="group relative bg-white rounded-md border border-gray-200 overflow-hidden shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer p-6"
        >
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Locales</h3>
          <p className="text-sm text-gray-500">Manage language/locale options for assets</p>
        </Link>

        <Link
          href="/admin/settings/asset-types"
          className="group relative bg-white rounded-md border border-gray-200 overflow-hidden shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer p-6"
        >
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Asset Types</h3>
          <p className="text-sm text-gray-500">Manage main asset type categories (Image, Video, Document, etc.)</p>
        </Link>

        <Link
          href="/admin/settings/asset-subtypes"
          className="group relative bg-white rounded-md border border-gray-200 overflow-hidden shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer p-6"
        >
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Asset Sub-Types</h3>
          <p className="text-sm text-gray-500">Manage asset sub-type categories within each asset type</p>
        </Link>

        <Link
          href="/admin/settings/tags"
          className="group relative bg-white rounded-md border border-gray-200 overflow-hidden shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer p-6"
        >
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Tags</h3>
          <p className="text-sm text-gray-500">Manage tags for categorizing and searching assets</p>
        </Link>
      </div>
    </div>
  );
}

