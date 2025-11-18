// Shared types for DAM (Digital Asset Manager) components

export interface LocaleOption {
  code: string;
  label: string;
  is_default?: boolean;
}

export interface RegionOption {
  code: string;
  label: string;
}

export interface AssetVersion {
  id: string;
  version_number: number;
  storage_path: string;
  thumbnail_path?: string | null;
  mime_type?: string | null;
  file_size?: number | null;
  processing_status: string;
  created_at: string;
  duration_seconds?: number | null;
  width?: number | null;
  height?: number | null;
  downloadPath?: string | null;
  previewPath?: string | null;
  originalFileName?: string | null; // Original uploaded filename from metadata
}

export interface VimeoDownloadFormat {
  resolution: string;
  url: string;
}

export interface AssetRecord {
  id: string;
  title: string;
  description?: string | null;
  asset_type: string; // Legacy enum field
  asset_type_id?: string | null; // New taxonomy Asset Type ID
  asset_subtype_id?: string | null; // New taxonomy Asset Sub-Type ID
  product_line?: string | null;
  product_name?: string | null;
  sku?: string | null;
  vimeo_video_id?: string | null;
  vimeo_download_1080p?: string | null;
  vimeo_download_720p?: string | null;
  vimeo_download_480p?: string | null;
  vimeo_download_360p?: string | null;
  vimeo_download_formats?: VimeoDownloadFormat[] | null;
  use_title_as_filename?: boolean | null;
  created_at: string;
  current_version?: AssetVersion | null;
  tags: string[];
  locales: LocaleOption[];
  regions: RegionOption[];
  campaign?: { id: string; name: string } | null; // Campaign info (optional)
}

