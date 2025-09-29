-- Complete Order System Database Schema
-- This script creates the order_history and order_documents tables

-- ===========================================
-- ORDER HISTORY TABLE (Audit Logging)
-- ===========================================
CREATE TABLE IF NOT EXISTS order_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    action_type TEXT NOT NULL, -- 'status_change', 'document_uploaded', 'packing_slip_created', 'order_created', 'order_updated'
    status_from TEXT, -- Previous status (for status changes)
    status_to TEXT, -- New status (for status changes)
    document_type TEXT, -- 'invoice', 'sales_order', 'packing_slip' (for document uploads)
    document_filename TEXT, -- Original filename (for document uploads)
    notes TEXT, -- Additional notes or description
    changed_by_id UUID REFERENCES auth.users(id), -- Who made the change
    changed_by_name TEXT, -- Human readable name
    changed_by_role TEXT, -- 'admin', 'client', 'system'
    metadata JSONB, -- Additional structured data (file size, file type, etc.)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_order_history_order_id ON order_history(order_id);
CREATE INDEX IF NOT EXISTS idx_order_history_created_at ON order_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_history_action_type ON order_history(action_type);

-- ===========================================
-- ORDER DOCUMENTS TABLE (File Management)
-- ===========================================
CREATE TABLE IF NOT EXISTS order_documents (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    document_type TEXT NOT NULL, -- 'invoice', 'sales_order', 'other'
    filename TEXT NOT NULL, -- Original filename
    file_path TEXT NOT NULL, -- Storage path (Supabase Storage)
    file_size BIGINT NOT NULL, -- File size in bytes
    mime_type TEXT NOT NULL, -- File MIME type
    uploaded_by_id UUID NOT NULL REFERENCES auth.users(id),
    uploaded_by_name TEXT NOT NULL,
    uploaded_by_role TEXT NOT NULL, -- 'admin', 'client'
    description TEXT, -- Optional description
    is_public BOOLEAN DEFAULT true, -- Whether clients can see this document
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_order_documents_order_id ON order_documents(order_id);
CREATE INDEX IF NOT EXISTS idx_order_documents_type ON order_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_order_documents_public ON order_documents(is_public);

-- ===========================================
-- ROW LEVEL SECURITY POLICIES
-- ===========================================

-- Enable RLS
ALTER TABLE order_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_documents ENABLE ROW LEVEL SECURITY;

-- Order History Policies
CREATE POLICY "Admins can view all order history" ON order_history
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid())
    );

CREATE POLICY "Clients can view their own order history" ON order_history
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM orders 
            JOIN clients ON orders.user_id = clients.id
            WHERE orders.id = order_history.order_id 
            AND clients.id = auth.uid()
        )
    );

CREATE POLICY "Admins can insert order history" ON order_history
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid())
    );

-- Order Documents Policies
CREATE POLICY "Admins can view all order documents" ON order_documents
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid())
    );

CREATE POLICY "Clients can view public documents for their orders" ON order_documents
    FOR SELECT USING (
        is_public = true AND EXISTS (
            SELECT 1 FROM orders 
            JOIN clients ON orders.user_id = clients.id
            WHERE orders.id = order_documents.order_id 
            AND clients.id = auth.uid()
        )
    );

CREATE POLICY "Admins can insert order documents" ON order_documents
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid())
    );

CREATE POLICY "Admins can update order documents" ON order_documents
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid())
    );

CREATE POLICY "Admins can delete order documents" ON order_documents
    FOR DELETE USING (
        EXISTS (SELECT 1 FROM admins WHERE admins.id = auth.uid())
    );

-- ===========================================
-- HELPER FUNCTIONS
-- ===========================================

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to auto-update updated_at
CREATE TRIGGER update_order_documents_updated_at 
    BEFORE UPDATE ON order_documents 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ===========================================
-- COMMENTS FOR DOCUMENTATION
-- ===========================================
COMMENT ON TABLE order_history IS 'Audit log for all order-related activities';
COMMENT ON TABLE order_documents IS 'File storage metadata for order-related documents';

COMMENT ON COLUMN order_history.action_type IS 'Type of action: status_change, document_uploaded, packing_slip_created, order_created, order_updated';
COMMENT ON COLUMN order_history.document_type IS 'Type of document when action_type is document_uploaded';
COMMENT ON COLUMN order_history.metadata IS 'Additional structured data as JSON';

COMMENT ON COLUMN order_documents.document_type IS 'Document category: invoice, sales_order, other';
COMMENT ON COLUMN order_documents.is_public IS 'Whether clients can view this document';
COMMENT ON COLUMN order_documents.file_path IS 'Path in Supabase Storage bucket';

-- ===========================================
-- INITIAL DATA SETUP (Optional)
-- ===========================================

-- You can add any initial setup data here if needed

-- ===========================================
-- VERIFICATION QUERIES
-- ===========================================

-- Verify tables were created
SELECT 'Tables created successfully:' as info;
SELECT table_name, table_type 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('order_history', 'order_documents');

-- Verify RLS is enabled
SELECT 'RLS status:' as info;
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE tablename IN ('order_history', 'order_documents');

-- Verify policies were created
SELECT 'Policies created:' as info;
SELECT schemaname, tablename, policyname 
FROM pg_policies 
WHERE tablename IN ('order_history', 'order_documents');
