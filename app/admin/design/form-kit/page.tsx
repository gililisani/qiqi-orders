'use client';

import AdminLayout from '../../../components/AdminLayout';
import Button from '../../../components/ui/Button';
import Card from '../../../components/ui/Card';
import FormField from '../../../components/ui/FormField';

export default function FormKitPage() {
  return (
    <AdminLayout>
      <div className="p-6 space-y-8">
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

        <Card header={<h2 className="font-semibold">Page Shell Example</h2>}>
          <p className="text-sm text-gray-600">Use this block style for inner pages without tables.</p>
        </Card>
      </div>
    </AdminLayout>
  );
}
