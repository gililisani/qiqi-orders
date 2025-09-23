'use client';

import AdminLayout from '../../../components/AdminLayout';
import Button from '../../../components/ui/Button';
import Card from '../../../components/ui/Card';
import FormField from '../../../components/ui/FormField';

export default function FormKitPage() {
  return (
    <AdminLayout>
      <div className="p-6 space-y-8 bg-gray-50 min-h-screen">
        <h1 className="text-2xl font-bold">Form Kit</h1>

        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card header={<h2 className="font-semibold">Buttons</h2>}>
            <div className="flex flex-wrap gap-3">
              <Button variant="primary">Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="danger">Danger</Button>
              <Button loading>Loading</Button>
            </div>
          </Card>

          <Card header={<h2 className="font-semibold">Inputs</h2>}>
            <div className="space-y-4">
              <FormField label="Name" htmlFor="name" required>
                <input id="name" type="text" className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black" />
              </FormField>
              <FormField label="Email" htmlFor="email" hint="We will not share your email.">
                <input id="email" type="email" className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black" />
              </FormField>
              <FormField label="Description" htmlFor="desc">
                <textarea id="desc" rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black" />
              </FormField>
              <FormField label="Select" htmlFor="select">
                <select id="select" className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black">
                  <option>Option A</option>
                  <option>Option B</option>
                </select>
              </FormField>
            </div>
          </Card>
        </section>

        {/* Blocks: exact border/shadow examples */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card header={<h2 className="font-semibold">Block (Default)</h2>}>
            <p className="text-sm text-gray-600">This block uses border-gray-100 and shadow-md to match the Creative Tim billing layout.</p>
          </Card>
          <Card header={<h2 className="font-semibold">Block (With Content)</h2>}>
            <div className="space-y-2 text-sm text-gray-700">
              <p>Use cards for grouped information or form sections.</p>
              <p>Outer container background should be a light gray; inner blocks are white.</p>
            </div>
          </Card>
        </section>

        {/* Links: Edit / View / Delete */}
        <Card header={<h2 className="font-semibold">Links</h2>}>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <a className="text-blue-600 hover:text-blue-800" href="#">Edit</a>
            <a className="text-gray-700 hover:text-gray-900" href="#">View</a>
            <a className="text-red-600 hover:text-red-800" href="#">Delete</a>
          </div>
        </Card>

        {/* Labels: Enabled / Disabled */}
        <Card header={<h2 className="font-semibold">Labels</h2>}>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center rounded px-2 py-1 text-xs font-medium bg-green-100 text-green-800">Enabled</span>
            <span className="inline-flex items-center rounded px-2 py-1 text-xs font-medium bg-gray-200 text-gray-800">Disabled</span>
          </div>
        </Card>
      </div>
    </AdminLayout>
  );
}
