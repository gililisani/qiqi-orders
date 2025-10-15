# SLI (Shipper's Letter of Instruction) - Data Mapping

## Flow
1. **Trigger**: Admin clicks "Create SLI" when order status = "In Process"
2. **Popup Form**: Admin fills 4 fields (Forwarding Agent details, Date of Export, In-Bond Code, Instructions)
3. **System Auto-fills**: System populates order/company/product data
4. **Generate**: PDF created with signature
5. **Edit**: Admin can edit SLI after creation

---

## Data Categories

### 🔹 **HARD CODED** (Never changes)
- **Box 1**: USPPI Name = `Qiqi INC`
- **Box 2**: USPPI Address = `4625 West Nevso Drive, Suite 2, Las Vegas, NV 89103, United States`
- **Box 3**: Freight Location Co Name = `PACKABLE / Webb Enterprises`
- **Box 4**: Freight Location Address = `1516 Motor Parkway, Islandia. New York. 11749., United States`
- **Box 7**: USPPI EIN = `86-2244756`
- **Box 14**: State of Origin = `NY`
- **Box 42**: USPPI Email = `aaron@qiqiglobal.com`
- **Box 43**: USPPI Phone = `00972-54-6248884`
- **Box 44**: Printed Name = `Aaron Lisani`
- **Box 46**: Title = `CPO`

### 🟡 **ADMIN INPUT** (Popup form - 4 fields)
1. **Box 5**: Forwarding Agent - Line 1
2. **Box 5**: Forwarding Agent - Line 2
3. **Box 5**: Forwarding Agent - Line 3
4. **Box 5**: Forwarding Agent - Line 4
5. **Box 6**: Date of Export
6. **Box 17**: In-Bond Code
7. **Box 26**: Instructions to Forwarder

### 🟢 **SYSTEM DATA** (From Order/Company/Products)
- **Box 9**: USPPI Reference # = `{order.order_number}` or `{order.po_number}`
- **Box 11**: Ultimate Consignee Name & Address = `{company.company_name}`, `{company.ship_to_street_line_1}`, `{company.ship_to_street_line_2}`, `{company.ship_to_city}, {company.ship_to_state}, {company.ship_to_country}, {company.ship_to_postal_code}`
- **Box 15**: Country of Ultimate Destination = `{company.ship_to_country}`
- **Box 27-36**: Products Table = Dynamic rows from `order_items`:
  - **Col 27 (D/F)**: `{product.df_code}` or blank
  - **Col 28 (Schedule B/HTS)**: `{product.hs_code}` + `{product.product_name}`
  - **Col 28 (QTY/UOM)**: `{order_item.quantity}` + `{product.unit_of_measure}`
  - **Col 30 (DDTC Quantity)**: Blank (manual)
  - **Col 31 (Weight in Kilos)**: `{order_item.quantity * product.weight_per_unit}` (if weight available)
  - **Col 32 (ECCN)**: `{product.eccn_code}` or blank
  - **Col 33 (S M E)**: Blank (manual)
  - **Col 34 (License Info)**: Blank (manual)
  - **Col 35 (Value USD)**: `{order_item.subtotal}` (price × quantity)
  - **Col 36 (License Value)**: Blank (manual)
- **Box 47**: Date = `{date_sli_created}` or current date

### ⚪ **CHECKBOXES** (Default unchecked, can be edited)
- **Box 8**: Related Party Indicator (Related / Non-Related)
- **Box 10**: Routed Export Transaction (Yes / No)
- **Box 12**: Ultimate Consignee Type (Government Entity / Direct Consumer / Other/Unknown / Re-Seller)
- **Box 16**: Hazardous Material (Yes / No)
- **Box 20**: TIB / Carnet (Yes / No)
- **Box 21**: Shipper Requests Insurance (Yes / No)
- **Box 23**: Shipper Must Check (Prepaid / Collect)
- **Box 39**: Non-licensable Schedule B
- **Box 40**: USPPI authorizes forwarder
- **Box 48**: Validate Electronic Signature

### 🔲 **ALWAYS BLANK** (Manual fill or left empty)
- **Box 13**: Intermediate Consignee Name & Address
- **Box 18**: Entry Number
- **Box 19**: FTZ Identifier
- **Box 22**: Declared Value for Cartage
- **Box 24**: C.O.D Amount
- **Box 25**: Deliver To (if checked)
- **Box 37**: DDTC Applicant Registration Number
- **Box 38**: Eligible Party Certification
- **Box 45**: Signature (image uploaded by admin or digital signature)

---

## Database Requirements

### New Table: `slis`
```sql
CREATE TABLE slis (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES admins(id),
  
  -- Admin Input Fields (from popup)
  forwarding_agent_line1 TEXT,
  forwarding_agent_line2 TEXT,
  forwarding_agent_line3 TEXT,
  forwarding_agent_line4 TEXT,
  date_of_export DATE,
  in_bond_code TEXT,
  instructions_to_forwarder TEXT,
  
  -- Checkbox States (JSON for flexibility)
  checkbox_states JSONB DEFAULT '{}',
  
  -- Signature
  signature_image_url TEXT,
  signature_date DATE,
  
  -- PDF Storage
  pdf_url TEXT
);
```

### Product Table Updates (if needed)
Check if products table has:
- `hs_code` (Schedule B / HTS code)
- `df_code` (D/F code)
- `eccn_code` (Export Control Classification Number)
- `unit_of_measure` (UOM)
- `weight_per_unit` (for calculating shipping weight)

---

## Implementation Plan

### Phase 1: Database & API
1. Create `slis` table with migration
2. Create API route: `POST /api/orders/[id]/sli/create`
3. Create API route: `PUT /api/orders/[id]/sli/update`
4. Create API route: `GET /api/orders/[id]/sli`
5. Create API route: `POST /api/orders/[id]/sli/generate-pdf`

### Phase 2: UI Components
1. Create `CreateSLIModal.tsx` (popup form with 4 admin fields)
2. Create `EditSLIModal.tsx` (edit existing SLI data)
3. Add "Create SLI" button to `OrderDetailsView.tsx` (admin only, status = "In Process")
4. Add "Download SLI PDF" button (if SLI exists)
5. Add "Edit SLI" button (if SLI exists)

### Phase 3: PDF Generation
1. Create `lib/sliGenerator.ts` - populate HTML template with data
2. Use `puppeteer` or `html2pdf` to convert HTML to PDF
3. Store PDF in Supabase Storage
4. Return download URL

### Phase 4: Signature Handling
1. Add signature upload option in SLI form
2. Store signature image in Supabase Storage
3. Embed signature in PDF generation

---

## Questions to Answer Before Building

1. **Product Data**: Do products already have `hs_code`, `df_code`, `eccn_code`, `weight_per_unit` in the database?
2. **USPPI Reference**: Should Box 9 use `order_number`, `po_number`, or `so_number`?
3. **Signature**: Should signature be:
   - Uploaded image file?
   - Digital signature (typed name in caps per Box 48)?
   - Both options?
4. **Checkbox Defaults**: Should any checkboxes have default values? (e.g., "Non-Related" = Yes by default)
5. **Edit Capability**: Can admin edit:
   - Only the 4 popup fields?
   - Also checkboxes?
   - Also system-generated data (products, addresses)?


