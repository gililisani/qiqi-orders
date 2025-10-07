'use client';

import AdminLayout from '../../../components/AdminLayout';
import Button from '../../../components/ui/Button';
import Card from '../../../components/ui/Card';
import FormField from '../../../components/ui/FormField';
import TopNavbar from '../../../components/ui/TopNavbar';
import { 
  CheckCircleIcon, 
  XCircleIcon, 
  CurrencyDollarIcon,
  NoSymbolIcon,
  GiftIcon,
  HandRaisedIcon,
  BriefcaseIcon,
  BanknotesIcon
} from '@heroicons/react/24/solid';

export default function FormKitPage() {
  return (
    <AdminLayout>
      <TopNavbar />
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

        {/* Labels: Order Statuses - OLD DESIGN */}
        <Card header={<h2 className="font-semibold">OLD DESIGN: Order Status Labels</h2>}>
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center rounded px-2 py-1 text-[10px] font-bold tracking-wide uppercase bg-gray-200 text-gray-800">Open</span>
            <span className="inline-flex items-center rounded px-2 py-1 text-[10px] font-bold tracking-wide uppercase bg-blue-100 text-blue-800">In Process</span>
            <span className="inline-flex items-center rounded px-2 py-1 text-[10px] font-bold tracking-wide uppercase bg-orange-100 text-orange-800">Ready</span>
            <span className="inline-flex items-center rounded px-2 py-1 text-[10px] font-bold tracking-wide uppercase bg-green-100 text-green-800">Done</span>
            <span className="inline-flex items-center rounded px-2 py-1 text-[10px] font-bold tracking-wide uppercase bg-red-100 text-red-800">Cancelled</span>
          </div>
        </Card>

        {/* NEW DESIGN: Professional Order Status Labels - Option 1 (Subtle & Modern) */}
        <Card header={<h2 className="font-semibold">NEW DESIGN - Option 1: Subtle & Professional</h2>}>
          <div className="space-y-3">
            <p className="text-sm text-gray-600 mb-3">Softer colors, better contrast, more readable</p>
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">Open</span>
              <span className="inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">In Process</span>
              <span className="inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">Ready</span>
              <span className="inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">Done</span>
              <span className="inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium bg-red-50 text-red-700 border border-red-200">Cancelled</span>
            </div>
          </div>
        </Card>

        {/* NEW DESIGN: Professional Order Status Labels - Option 2 (Bold & Clean) */}
        <Card header={<h2 className="font-semibold">NEW DESIGN - Option 2: Bold & Clean</h2>}>
          <div className="space-y-3">
            <p className="text-sm text-gray-600 mb-3">Stronger colors, clear distinction, modern feel</p>
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-semibold bg-slate-200 text-slate-800">Open</span>
              <span className="inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-semibold bg-blue-500 text-white">In Process</span>
              <span className="inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-semibold bg-amber-500 text-white">Ready</span>
              <span className="inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-semibold bg-emerald-500 text-white">Done</span>
              <span className="inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-semibold bg-red-500 text-white">Cancelled</span>
            </div>
          </div>
        </Card>

        {/* NEW DESIGN: Professional Order Status Labels - Option 3 (Minimal & Elegant) */}
        <Card header={<h2 className="font-semibold">NEW DESIGN - Option 3: Minimal & Elegant</h2>}>
          <div className="space-y-3">
            <p className="text-sm text-gray-600 mb-3">Borderless, clean typography, professional look</p>
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium bg-slate-100 text-slate-700">Open</span>
              <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium bg-blue-100 text-blue-700">In Process</span>
              <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium bg-amber-100 text-amber-700">Ready</span>
              <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium bg-emerald-100 text-emerald-700">Done</span>
              <span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium bg-red-100 text-red-700">Cancelled</span>
            </div>
          </div>
        </Card>

        {/* NEW DESIGN: Professional Order Status Labels - Option 4 (Badge Style) */}
        <Card header={<h2 className="font-semibold">NEW DESIGN - Option 4: Badge Style with Dot</h2>}>
          <div className="space-y-3">
            <p className="text-sm text-gray-600 mb-3">Status indicator dot + text, very clear</p>
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium bg-slate-50 text-slate-700 border border-slate-200">
                <span className="h-1.5 w-1.5 rounded-full bg-slate-500"></span>
                Open
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-500"></span>
                In Process
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
                Ready
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                Done
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium bg-red-50 text-red-700 border border-red-200">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500"></span>
                Cancelled
              </span>
            </div>
          </div>
        </Card>

        {/* NEW DESIGN: Professional Order Status Labels - Option 5 (Modern Glow Effect) */}
        <Card header={<h2 className="font-semibold">NEW DESIGN - Option 5: Modern Glow Effect (Tailwind UI Style)</h2>}>
          <div className="space-y-3">
            <p className="text-sm text-gray-600 mb-3">Exact Tailwind UI style - lime green & pink red, perfect opacity levels</p>
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-x-1.5 rounded-md px-1.5 py-0.5 text-sm/5 font-medium sm:text-xs/5 forced-colors:outline bg-gray-400/20 text-gray-700">
                Open
              </span>
              <span className="inline-flex items-center gap-x-1.5 rounded-md px-1.5 py-0.5 text-sm/5 font-medium sm:text-xs/5 forced-colors:outline bg-blue-400/20 text-blue-700">
                In Process
              </span>
              <span className="inline-flex items-center gap-x-1.5 rounded-md px-1.5 py-0.5 text-sm/5 font-medium sm:text-xs/5 forced-colors:outline bg-orange-400/20 text-orange-700">
                Ready
              </span>
              <span className="inline-flex items-center gap-x-1.5 rounded-md px-1.5 py-0.5 text-sm/5 font-medium sm:text-xs/5 forced-colors:outline bg-lime-400/20 text-lime-700">
                Done
              </span>
              <span className="inline-flex items-center gap-x-1.5 rounded-md px-1.5 py-0.5 text-sm/5 font-medium sm:text-xs/5 forced-colors:outline bg-pink-400/15 text-pink-700">
                Cancelled
              </span>
            </div>
          </div>
        </Card>

        {/* NEW DESIGN: Professional Order Status Labels - Option 6 (Glow + Dot) */}
        <Card header={<h2 className="font-semibold">NEW DESIGN - Option 6: Tailwind UI Style + Status Dot</h2>}>
          <div className="space-y-3">
            <p className="text-sm text-gray-600 mb-3">Tailwind UI glow effect with indicator dot for extra clarity</p>
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-x-1.5 rounded-md px-1.5 py-0.5 text-xs font-medium bg-gray-400/20 text-gray-700 hover:bg-gray-400/30">
                <svg className="h-1.5 w-1.5 fill-gray-500" viewBox="0 0 6 6" aria-hidden="true"><circle cx="3" cy="3" r="3" /></svg>
                Open
              </span>
              <span className="inline-flex items-center gap-x-1.5 rounded-md px-1.5 py-0.5 text-xs font-medium bg-blue-400/20 text-blue-700 hover:bg-blue-400/30">
                <svg className="h-1.5 w-1.5 fill-blue-500" viewBox="0 0 6 6" aria-hidden="true"><circle cx="3" cy="3" r="3" /></svg>
                In Process
              </span>
              <span className="inline-flex items-center gap-x-1.5 rounded-md px-1.5 py-0.5 text-xs font-medium bg-orange-400/20 text-orange-700 hover:bg-orange-400/30">
                <svg className="h-1.5 w-1.5 fill-orange-500" viewBox="0 0 6 6" aria-hidden="true"><circle cx="3" cy="3" r="3" /></svg>
                Ready
              </span>
              <span className="inline-flex items-center gap-x-1.5 rounded-md px-1.5 py-0.5 text-xs font-medium bg-lime-400/20 text-lime-700 hover:bg-lime-400/30">
                <svg className="h-1.5 w-1.5 fill-lime-500" viewBox="0 0 6 6" aria-hidden="true"><circle cx="3" cy="3" r="3" /></svg>
                Done
              </span>
              <span className="inline-flex items-center gap-x-1.5 rounded-md px-1.5 py-0.5 text-xs font-medium bg-pink-400/15 text-pink-700 hover:bg-pink-400/25">
                <svg className="h-1.5 w-1.5 fill-pink-500" viewBox="0 0 6 6" aria-hidden="true"><circle cx="3" cy="3" r="3" /></svg>
                Cancelled
              </span>
            </div>
          </div>
        </Card>

        {/* OLD DESIGN: Product Status Labels (Text-based) */}
        <Card header={<h2 className="font-semibold">OLD DESIGN: Product Status Labels (Text-based)</h2>}>
          <div className="space-y-4">
            {/* Enable/Disable Status */}
            <div>
              <p className="text-sm text-gray-600 mb-2 font-medium">Enable/Disable:</p>
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center rounded px-2 py-1 text-xs font-medium bg-green-100 text-green-800">Enabled</span>
                <span className="inline-flex items-center rounded px-2 py-1 text-xs font-medium bg-red-100 text-red-800">Disabled</span>
              </div>
            </div>

            {/* Support Funds Status */}
            <div>
              <p className="text-sm text-gray-600 mb-2 font-medium">Support Funds:</p>
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center rounded px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800">Support Funds</span>
                <span className="inline-flex items-center rounded px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800">No Support Funds</span>
              </div>
            </div>

            {/* Credit Earning Status */}
            <div>
              <p className="text-sm text-gray-600 mb-2 font-medium">Credit Earning:</p>
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center rounded px-2 py-1 text-xs font-medium bg-green-100 text-green-800">Earns Credit</span>
                <span className="inline-flex items-center rounded px-2 py-1 text-xs font-medium bg-orange-100 text-orange-800">No Credit</span>
              </div>
            </div>

            {/* Stacked Status Example (as used in Products table) */}
            <div>
              <p className="text-sm text-gray-600 mb-2 font-medium">Stacked Status (Product Table):</p>
              <div className="flex flex-col gap-1 max-w-fit">
                <span className="inline-flex items-center rounded px-2 py-1 text-xs font-medium bg-green-100 text-green-800">Enabled</span>
                <span className="inline-flex items-center rounded px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800">Support Funds</span>
                <span className="inline-flex items-center rounded px-2 py-1 text-xs font-medium bg-green-100 text-green-800">Earns Credit</span>
              </div>
            </div>
          </div>
        </Card>

        {/* NEW DESIGN: Icon-based Product Status - Option 1 (Icons Only) */}
        <Card header={<h2 className="font-semibold">NEW DESIGN - Option 1: Icons Only (Minimal)</h2>}>
          <div className="space-y-4">
            {/* Enable/Disable - CheckCircle / XCircle */}
            <div>
              <p className="text-sm text-gray-600 mb-2 font-medium">Enable/Disable (CheckCircle / XCircle):</p>
              <div className="flex flex-wrap items-center gap-4">
                <CheckCircleIcon className="h-5 w-5 text-green-600" title="Enabled" />
                <XCircleIcon className="h-5 w-5 text-red-500" title="Disabled" />
                <XCircleIcon className="h-5 w-5 text-gray-400" title="Disabled (Gray)" />
              </div>
            </div>

            {/* Credit Earning - CurrencyDollar / Strikethrough */}
            <div>
              <p className="text-sm text-gray-600 mb-2 font-medium">Credit Earning (CurrencyDollar / NoSymbol):</p>
              <div className="flex flex-wrap items-center gap-4">
                <CurrencyDollarIcon className="h-5 w-5 text-green-600" title="Earns Credit" />
                <div className="relative h-5 w-5" title="No Credit">
                  <CurrencyDollarIcon className="h-5 w-5 text-gray-400" />
                  <NoSymbolIcon className="h-5 w-5 text-red-500 absolute inset-0" />
                </div>
                <BanknotesIcon className="h-5 w-5 text-green-600" title="Earns Credit (Alt)" />
                <BanknotesIcon className="h-5 w-5 text-gray-400" title="No Credit (Alt)" />
              </div>
            </div>

            {/* Support Funds - Gift / HandRaised / Briefcase */}
            <div>
              <p className="text-sm text-gray-600 mb-2 font-medium">Support Funds (Gift / HandRaised / Briefcase):</p>
              <div className="flex flex-wrap items-center gap-4">
                <GiftIcon className="h-5 w-5 text-blue-600" title="Support Funds - Gift" />
                <GiftIcon className="h-5 w-5 text-gray-400" title="No Support Funds - Gift" />
                <HandRaisedIcon className="h-5 w-5 text-blue-600" title="Support Funds - Hand" />
                <HandRaisedIcon className="h-5 w-5 text-gray-400" title="No Support Funds - Hand" />
                <BriefcaseIcon className="h-5 w-5 text-blue-600" title="Support Funds - Briefcase" />
                <BriefcaseIcon className="h-5 w-5 text-gray-400" title="No Support Funds - Briefcase" />
              </div>
            </div>

            {/* All Together - Horizontal */}
            <div>
              <p className="text-sm text-gray-600 mb-2 font-medium">Example: All Icons Together (Product Row):</p>
              <div className="flex items-center gap-3 border border-gray-200 rounded p-3 bg-gray-50 max-w-fit">
                <span className="text-sm font-medium text-gray-900">Product Name</span>
                <div className="flex items-center gap-2 ml-4">
                  <CheckCircleIcon className="h-5 w-5 text-green-600" title="Enabled" />
                  <CurrencyDollarIcon className="h-5 w-5 text-green-600" title="Earns Credit" />
                  <GiftIcon className="h-5 w-5 text-blue-600" title="Support Funds" />
                </div>
              </div>
              <div className="flex items-center gap-3 border border-gray-200 rounded p-3 bg-gray-50 max-w-fit mt-2">
                <span className="text-sm font-medium text-gray-900">Product Name</span>
                <div className="flex items-center gap-2 ml-4">
                  <XCircleIcon className="h-5 w-5 text-gray-400" title="Disabled" />
                  <CurrencyDollarIcon className="h-5 w-5 text-gray-400" title="No Credit" />
                  <GiftIcon className="h-5 w-5 text-gray-400" title="No Support Funds" />
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* NEW DESIGN: Icon + Text - Option 2 */}
        <Card header={<h2 className="font-semibold">NEW DESIGN - Option 2: Icons + Text (Clear)</h2>}>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-gray-600 mb-2 font-medium">Enable/Disable:</p>
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                  <CheckCircleIcon className="h-4 w-4" />
                  Enabled
                </span>
                <span className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium bg-gray-50 text-gray-600 border border-gray-200">
                  <XCircleIcon className="h-4 w-4" />
                  Disabled
                </span>
              </div>
            </div>

            <div>
              <p className="text-sm text-gray-600 mb-2 font-medium">Credit Earning:</p>
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                  <CurrencyDollarIcon className="h-4 w-4" />
                  Earns Credit
                </span>
                <span className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium bg-gray-50 text-gray-600 border border-gray-200">
                  <CurrencyDollarIcon className="h-4 w-4" />
                  No Credit
                </span>
              </div>
            </div>

            <div>
              <p className="text-sm text-gray-600 mb-2 font-medium">Support Funds:</p>
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                  <GiftIcon className="h-4 w-4" />
                  Support Funds
                </span>
                <span className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium bg-gray-50 text-gray-600 border border-gray-200">
                  <GiftIcon className="h-4 w-4" />
                  No Support
                </span>
              </div>
            </div>

            {/* Horizontal Example */}
            <div>
              <p className="text-sm text-gray-600 mb-2 font-medium">Example: Horizontal Layout:</p>
              <div className="flex items-center gap-2 border border-gray-200 rounded p-3 bg-gray-50 max-w-fit">
                <span className="text-sm font-medium text-gray-900">Product Name</span>
                <div className="flex items-center gap-2 ml-2">
                  <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                    <CheckCircleIcon className="h-3.5 w-3.5" />
                    Enabled
                  </span>
                  <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                    <CurrencyDollarIcon className="h-3.5 w-3.5" />
                    Credit
                  </span>
                  <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                    <GiftIcon className="h-3.5 w-3.5" />
                    Support
                  </span>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* NEW DESIGN: Simple Dots - Option 3 */}
        <Card header={<h2 className="font-semibold">NEW DESIGN - Option 3: Simple Dots (Ultra Minimal)</h2>}>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-gray-600 mb-2 font-medium">Status Dots with Tooltip:</p>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5" title="Enabled">
                  <div className="h-2.5 w-2.5 rounded-full bg-green-500"></div>
                  <span className="text-xs text-gray-600">Enabled</span>
                </div>
                <div className="flex items-center gap-1.5" title="Disabled">
                  <div className="h-2.5 w-2.5 rounded-full bg-gray-400"></div>
                  <span className="text-xs text-gray-600">Disabled</span>
                </div>
              </div>
            </div>

            <div>
              <p className="text-sm text-gray-600 mb-2 font-medium">Example: Product Row with Dots:</p>
              <div className="flex items-center gap-3 border border-gray-200 rounded p-3 bg-gray-50 max-w-fit">
                <span className="text-sm font-medium text-gray-900">Product Name</span>
                <div className="flex items-center gap-2 ml-4">
                  <div className="h-2.5 w-2.5 rounded-full bg-green-500" title="Enabled"></div>
                  <div className="h-2.5 w-2.5 rounded-full bg-green-500" title="Earns Credit"></div>
                  <div className="h-2.5 w-2.5 rounded-full bg-blue-500" title="Support Funds"></div>
                </div>
              </div>
              <div className="flex items-center gap-3 border border-gray-200 rounded p-3 bg-gray-50 max-w-fit mt-2">
                <span className="text-sm font-medium text-gray-900">Product Name</span>
                <div className="flex items-center gap-2 ml-4">
                  <div className="h-2.5 w-2.5 rounded-full bg-gray-400" title="Disabled"></div>
                  <div className="h-2.5 w-2.5 rounded-full bg-gray-400" title="No Credit"></div>
                  <div className="h-2.5 w-2.5 rounded-full bg-gray-400" title="No Support Funds"></div>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* NEW DESIGN: Icon Badges - Option 4 */}
        <Card header={<h2 className="font-semibold">NEW DESIGN - Option 4: Icon Badges (Rounded Background)</h2>}>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-gray-600 mb-2 font-medium">Icon with Colored Background:</p>
              <div className="flex flex-wrap items-center gap-3">
                <div className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-green-100" title="Enabled">
                  <CheckCircleIcon className="h-5 w-5 text-green-600" />
                </div>
                <div className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-gray-100" title="Disabled">
                  <XCircleIcon className="h-5 w-5 text-gray-500" />
                </div>
                <div className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-green-100" title="Earns Credit">
                  <CurrencyDollarIcon className="h-5 w-5 text-green-600" />
                </div>
                <div className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-gray-100" title="No Credit">
                  <CurrencyDollarIcon className="h-5 w-5 text-gray-500" />
                </div>
                <div className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-blue-100" title="Support Funds">
                  <GiftIcon className="h-5 w-5 text-blue-600" />
                </div>
                <div className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-gray-100" title="No Support">
                  <GiftIcon className="h-5 w-5 text-gray-500" />
                </div>
              </div>
            </div>

            <div>
              <p className="text-sm text-gray-600 mb-2 font-medium">Example: Product Row:</p>
              <div className="flex items-center gap-3 border border-gray-200 rounded p-3 bg-gray-50 max-w-fit">
                <span className="text-sm font-medium text-gray-900">Product Name</span>
                <div className="flex items-center gap-2 ml-4">
                  <div className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-green-100">
                    <CheckCircleIcon className="h-4 w-4 text-green-600" />
                  </div>
                  <div className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-green-100">
                    <CurrencyDollarIcon className="h-4 w-4 text-green-600" />
                  </div>
                  <div className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-blue-100">
                    <GiftIcon className="h-4 w-4 text-blue-600" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* LIVE EXAMPLE: Products Table with Option 4 Icons */}
        <Card header={
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">LIVE EXAMPLE: Products Table with Option 4 (Icon Badges)</h2>
            <div className="text-xs text-gray-500">Compare with current design</div>
          </div>
        }>
          <div className="overflow-x-auto">
            <table className="w-full border border-[#e5e5e5] rounded-lg overflow-hidden">
              <thead>
                <tr className="border-b border-[#e5e5e5] bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Image</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Item</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">SKU</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Americas</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">International</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-600 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white">
                {/* Product 1 - Enabled with all features */}
                <tr className="hover:bg-gray-50 border-b border-[#e5e5e5] cursor-pointer transition-colors" onClick={() => window.location.href='#'}>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="h-12 w-12 bg-gradient-to-br from-blue-400 to-blue-600 rounded object-cover border border-[#e5e5e5] flex items-center justify-center text-white text-xs font-bold">IMG</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400 font-mono text-xs">01</span>
                      <span className="font-medium">Premium Widget Pro</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">SKU-001</td>
                  <td className="px-4 py-3 text-sm text-gray-900">$49.99</td>
                  <td className="px-4 py-3 text-sm text-gray-900">$54.99</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center justify-center gap-2">
                      <div className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-green-100" title="Enabled">
                        <CheckCircleIcon className="h-4 w-4 text-green-600" />
                      </div>
                      <div className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-green-100" title="Earns Credit">
                        <CurrencyDollarIcon className="h-4 w-4 text-green-600" />
                      </div>
                      <div className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-blue-100" title="Support Funds">
                        <GiftIcon className="h-4 w-4 text-blue-600" />
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm" onClick={(e) => e.stopPropagation()}>
                    <a className="text-blue-600 hover:text-blue-800 font-medium" href="#">Edit</a>
                  </td>
                </tr>

                {/* Product 2 - Enabled, Credit only */}
                <tr className="hover:bg-gray-50 border-b border-[#e5e5e5] cursor-pointer transition-colors" onClick={() => window.location.href='#'}>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="h-12 w-12 bg-gradient-to-br from-purple-400 to-purple-600 rounded object-cover border border-[#e5e5e5] flex items-center justify-center text-white text-xs font-bold">IMG</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400 font-mono text-xs">02</span>
                      <span className="font-medium">Standard Widget</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">SKU-002</td>
                  <td className="px-4 py-3 text-sm text-gray-900">$29.99</td>
                  <td className="px-4 py-3 text-sm text-gray-900">$34.99</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center justify-center gap-2">
                      <div className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-green-100" title="Enabled">
                        <CheckCircleIcon className="h-4 w-4 text-green-600" />
                      </div>
                      <div className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-green-100" title="Earns Credit">
                        <CurrencyDollarIcon className="h-4 w-4 text-green-600" />
                      </div>
                      <div className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-gray-100" title="No Support Funds">
                        <GiftIcon className="h-4 w-4 text-gray-400" />
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm" onClick={(e) => e.stopPropagation()}>
                    <a className="text-blue-600 hover:text-blue-800 font-medium" href="#">Edit</a>
                  </td>
                </tr>

                {/* Product 3 - Disabled */}
                <tr className="hover:bg-gray-50 border-b border-[#e5e5e5] opacity-60 cursor-pointer transition-colors" onClick={() => window.location.href='#'}>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="h-12 w-12 bg-gray-300 rounded object-cover border border-[#e5e5e5] flex items-center justify-center text-gray-500 text-xs font-bold">IMG</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400 font-mono text-xs">03</span>
                      <span className="font-medium">Discontinued Widget</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">SKU-003</td>
                  <td className="px-4 py-3 text-sm text-gray-900">$19.99</td>
                  <td className="px-4 py-3 text-sm text-gray-900">$24.99</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center justify-center gap-2">
                      <div className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-gray-100" title="Disabled">
                        <XCircleIcon className="h-4 w-4 text-gray-500" />
                      </div>
                      <div className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-gray-100" title="No Credit">
                        <CurrencyDollarIcon className="h-4 w-4 text-gray-400" />
                      </div>
                      <div className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-gray-100" title="No Support Funds">
                        <GiftIcon className="h-4 w-4 text-gray-400" />
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm" onClick={(e) => e.stopPropagation()}>
                    <a className="text-blue-600 hover:text-blue-800 font-medium" href="#">Edit</a>
                  </td>
                </tr>

                {/* Product 4 - Enabled, Support Funds only */}
                <tr className="hover:bg-gray-50 border-b border-[#e5e5e5] cursor-pointer transition-colors" onClick={() => window.location.href='#'}>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="h-12 w-12 bg-gradient-to-br from-green-400 to-green-600 rounded object-cover border border-[#e5e5e5] flex items-center justify-center text-white text-xs font-bold">IMG</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400 font-mono text-xs">04</span>
                      <span className="font-medium">Promotional Widget</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">SKU-004</td>
                  <td className="px-4 py-3 text-sm text-gray-900">$9.99</td>
                  <td className="px-4 py-3 text-sm text-gray-900">$14.99</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center justify-center gap-2">
                      <div className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-green-100" title="Enabled">
                        <CheckCircleIcon className="h-4 w-4 text-green-600" />
                      </div>
                      <div className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-gray-100" title="No Credit">
                        <CurrencyDollarIcon className="h-4 w-4 text-gray-400" />
                      </div>
                      <div className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-blue-100" title="Support Funds">
                        <GiftIcon className="h-4 w-4 text-blue-600" />
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm" onClick={(e) => e.stopPropagation()}>
                    <a className="text-blue-600 hover:text-blue-800 font-medium" href="#">Edit</a>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          
          {/* Legend */}
          <div className="mt-4 pt-4 border-t border-[#e5e5e5]">
            <p className="text-sm font-medium text-gray-700 mb-3">Icon Legend:</p>
            <div className="flex flex-wrap gap-4 text-xs text-gray-600">
              <div className="flex items-center gap-2">
                <div className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-green-100">
                  <CheckCircleIcon className="h-3.5 w-3.5 text-green-600" />
                </div>
                <span>Enabled</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-gray-100">
                  <XCircleIcon className="h-3.5 w-3.5 text-gray-500" />
                </div>
                <span>Disabled</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-green-100">
                  <CurrencyDollarIcon className="h-3.5 w-3.5 text-green-600" />
                </div>
                <span>Earns Credit</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-gray-100">
                  <CurrencyDollarIcon className="h-3.5 w-3.5 text-gray-400" />
                </div>
                <span>No Credit</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-blue-100">
                  <GiftIcon className="h-3.5 w-3.5 text-blue-600" />
                </div>
                <span>Support Funds</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-gray-100">
                  <GiftIcon className="h-3.5 w-3.5 text-gray-400" />
                </div>
                <span>No Support Funds</span>
              </div>
            </div>
          </div>
        </Card>

        {/* Table design */}
        <Card header={<h2 className="font-semibold">Table</h2>}>
          <div className="overflow-x-auto">
            <table className="min-w-full border border-[#e5e5e5] rounded-lg overflow-hidden">
              <thead>
                <tr className="border-b border-[#e5e5e5]">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr className="hover:bg-gray-50 border-b border-[#e5e5e5]">
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">Acme Corp</td>
                  <td className="px-4 py-3 whitespace-nowrap"><span className="inline-flex items-center rounded px-2 py-1 text-xs font-medium bg-green-100 text-green-800">Enabled</span></td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm">
                    <div className="flex gap-3">
                      <a className="text-blue-600 hover:text-blue-800" href="#">Edit</a>
                      <a className="text-gray-700 hover:text-gray-900" href="#">View</a>
                      <a className="text-red-600 hover:text-red-800" href="#">Delete</a>
                    </div>
                  </td>
                </tr>
                <tr className="hover:bg-gray-50 border-b border-[#e5e5e5]">
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">Globex</td>
                  <td className="px-4 py-3 whitespace-nowrap"><span className="inline-flex items-center rounded px-2 py-1 text-xs font-medium bg-gray-200 text-gray-800">Disabled</span></td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm">
                    <div className="flex gap-3">
                      <a className="text-blue-600 hover:text-blue-800" href="#">Edit</a>
                      <a className="text-gray-700 hover:text-gray-900" href="#">View</a>
                      <a className="text-red-600 hover:text-red-800" href="#">Delete</a>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          {/* Pagination inside the same block */}
          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-gray-600">Showing 1-2 of 2</p>
            <nav className="inline-flex items-center gap-1" aria-label="Pagination">
              <a href="#" className="px-3 py-1.5 text-sm text-gray-700 border border-[#e5e5e5] rounded hover:bg-gray-50">Prev</a>
              <a href="#" className="px-3 py-1.5 text-sm text-white bg-black border border-black rounded">1</a>
              <a href="#" className="px-3 py-1.5 text-sm text-gray-700 border border-[#e5e5e5] rounded hover:bg-gray-50">2</a>
              <a href="#" className="px-3 py-1.5 text-sm text-gray-700 border border-[#e5e5e5] rounded hover:bg-gray-50">3</a>
              <span className="px-2 text-gray-500">…</span>
              <a href="#" className="px-3 py-1.5 text-sm text-gray-700 border border-[#e5e5e5] rounded hover:bg-gray-50">Next</a>
            </nav>
          </div>
        </Card>

        {/* Error message */}
        <Card header={<h2 className="font-semibold">Error Message</h2>}>
          <div className="border border-red-300 bg-red-50 text-red-800 rounded-md px-4 py-3 text-sm">
            Something went wrong while saving. Please check the highlighted fields and try again.
          </div>
        </Card>
      </div>
    </AdminLayout>
  );
}
