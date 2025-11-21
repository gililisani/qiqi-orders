'use client';

import Link from 'next/link';

export default function SettingsPage() {
  return (
    <div className="mt-8 mb-4 space-y-6">
      <h2 className="text-2xl font-semibold text-gray-900">Settings / Taxonomy</h2>
      <p className="text-gray-600">Manage taxonomy settings for your Digital Asset Manager.</p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
        <Link
          href="/admin/settings/product-lines"
          className="block p-6 bg-white border border-gray-200 rounded-lg hover:shadow-md transition-shadow"
        >
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Product Lines</h3>
          <p className="text-sm text-gray-600">Manage product line options (ProCtrl, SelfCtrl, Both, None)</p>
        </Link>

        <Link
          href="/admin/settings/locales"
          className="block p-6 bg-white border border-gray-200 rounded-lg hover:shadow-md transition-shadow"
        >
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Locales</h3>
          <p className="text-sm text-gray-600">Manage language/locale options for assets</p>
        </Link>

        <Link
          href="/admin/settings/asset-types"
          className="block p-6 bg-white border border-gray-200 rounded-lg hover:shadow-md transition-shadow"
        >
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Asset Types</h3>
          <p className="text-sm text-gray-600">Manage main asset type categories (Image, Video, Document, etc.)</p>
        </Link>

        <Link
          href="/admin/settings/asset-subtypes"
          className="block p-6 bg-white border border-gray-200 rounded-lg hover:shadow-md transition-shadow"
        >
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Asset Sub-Types</h3>
          <p className="text-sm text-gray-600">Manage asset sub-type categories within each asset type</p>
        </Link>

        <Link
          href="/admin/settings/tags"
          className="block p-6 bg-white border border-gray-200 rounded-lg hover:shadow-md transition-shadow"
        >
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Tags</h3>
          <p className="text-sm text-gray-600">Manage tags for categorizing and searching assets</p>
        </Link>
      </div>
    </div>
  );
}

