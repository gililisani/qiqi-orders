'use client';

/**
 * AssetDetailModal — full asset preview + metadata + download actions.
 * Shared by admin and client surfaces (props gate admin-only affordances:
 * edit, delete, video URL editing).
 */
import { useEffect, useState } from 'react';
import {
  X,
  Image as ImageIcon,
  Eye,
  Download,
  Trash2,
  Pencil,
  Plus,
  Loader2,
} from 'lucide-react';
import { AssetRecord, VimeoDownloadFormat } from './types';
import { formatBytes, getFriendlyFileType, getStaticDocumentThumbnail, resolveSignedAssetUrl } from './utils';

import { Dialog, DialogContent } from '../qq/dialog';
import { Button } from '../qq/button';
import { Badge } from '../qq/badge';
import { Input } from '../qq/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../qq/select';
import { Separator } from '../qq/separator';

interface AssetDetailModalProps {
  asset: AssetRecord;
  accessToken: string | null;
  onClose: () => void;
  onDownload?: (asset: AssetRecord, format?: string) => Promise<void>;
  downloadingFormats?: Set<string>;
  isAdmin?: boolean;
  onEdit?: (asset: AssetRecord) => void;
  onDelete?: (assetId: string) => void;
  isEditingVideoUrls?: boolean;
  editingDownloadUrls?: VimeoDownloadFormat[];
  onToggleEditVideoUrls?: () => void;
  onUpdateVideoUrls?: (formats: VimeoDownloadFormat[]) => Promise<void>;
  onVideoUrlChange?: (index: number, field: 'resolution' | 'url', value: string) => void;
  onAddVideoFormat?: () => void;
  onRemoveVideoFormat?: (index: number) => void;
  savingUrls?: boolean;
  resolutionOptions?: string[];
  renderAssetTypePill?: (type: string) => JSX.Element | null;
}

const DEFAULT_RESOLUTION_OPTIONS = ['4K', '2K', '1080p', '720p', '540p', '480p', '360p', '240p', 'Other'];

export default function AssetDetailModal({
  asset,
  accessToken,
  onClose,
  onDownload,
  downloadingFormats = new Set(),
  isAdmin = false,
  onEdit,
  onDelete,
  isEditingVideoUrls = false,
  editingDownloadUrls = [],
  onToggleEditVideoUrls,
  onUpdateVideoUrls,
  onVideoUrlChange,
  onAddVideoFormat,
  onRemoveVideoFormat,
  savingUrls = false,
  resolutionOptions = DEFAULT_RESOLUTION_OPTIONS,
  renderAssetTypePill,
}: AssetDetailModalProps) {
  const [resolvedPreviewUrl, setResolvedPreviewUrl] = useState<string>('');
  const previewApiPath =
    asset.current_version?.previewPath || asset.current_version?.downloadPath || null;

  useEffect(() => {
    let active = true;
    (async () => {
      if (!accessToken || !previewApiPath) return;
      const signed = await resolveSignedAssetUrl(previewApiPath, accessToken);
      if (active) setResolvedPreviewUrl(signed);
    })();
    return () => {
      active = false;
    };
  }, [accessToken, previewApiPath]);

  const getValidVideoFormats = (): VimeoDownloadFormat[] => {
    const formats: VimeoDownloadFormat[] = [];
    if (asset.vimeo_download_formats && asset.vimeo_download_formats.length > 0) {
      formats.push(...asset.vimeo_download_formats.filter((f) => f.url && f.url.trim() !== ''));
    } else {
      if (asset.vimeo_download_1080p) formats.push({ resolution: '1080p', url: asset.vimeo_download_1080p });
      if (asset.vimeo_download_720p) formats.push({ resolution: '720p', url: asset.vimeo_download_720p });
      if (asset.vimeo_download_480p) formats.push({ resolution: '480p', url: asset.vimeo_download_480p });
      if (asset.vimeo_download_360p) formats.push({ resolution: '360p', url: asset.vimeo_download_360p });
    }
    return formats;
  };

  const validFormats = getValidVideoFormats();
  const assetDownloadKey = `asset-action-${asset.id}`;
  const isDownloadingAsset = downloadingFormats.has(assetDownloadKey);
  const staticThumbnail = getStaticDocumentThumbnail(asset.current_version?.mime_type);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-6xl max-h-[90vh] p-0 overflow-hidden flex flex-col">
        {/* Close (custom — DialogContent's default close is fine but we want it on the preview side) */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 z-30 inline-flex h-7 w-7 items-center justify-center rounded-md bg-background/90 text-muted-foreground hover:text-foreground hover:bg-background transition shadow-sm"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex flex-col lg:flex-row h-full overflow-hidden">
          {/* Preview */}
          <div className="lg:w-[55%] bg-muted/40 flex items-center justify-center p-6 min-h-[400px]">
            {asset.asset_type === 'video' && asset.vimeo_video_id ? (
              <div className="w-full max-w-3xl">
                <div
                  className="relative w-full rounded-md overflow-hidden shadow-sm"
                  style={{ aspectRatio: '16/9' }}
                >
                  <iframe
                    src={`https://player.vimeo.com/video/${asset.vimeo_video_id}?byline=0&title=0&portrait=0`}
                    allow="autoplay; fullscreen; picture-in-picture"
                    allowFullScreen
                    className="absolute inset-0 w-full h-full border-0"
                    title={asset.title || 'Video'}
                  />
                </div>
              </div>
            ) : staticThumbnail ? (
              <div className="w-full max-w-3xl flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={staticThumbnail}
                  alt={asset.title}
                  className="w-full h-auto max-h-[70vh] object-contain"
                />
              </div>
            ) : previewApiPath && accessToken && resolvedPreviewUrl ? (
              <div className="w-full max-w-3xl">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={resolvedPreviewUrl}
                  alt={asset.title}
                  className="w-full h-auto max-h-[70vh] object-contain"
                />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-muted-foreground">
                <ImageIcon className="h-20 w-20 mb-3" />
                <p className="text-sm">No preview available</p>
              </div>
            )}
          </div>

          {/* Metadata */}
          <div className="lg:w-[45%] bg-background overflow-y-auto p-5 border-l border-border">
            {/* Title */}
            <div className="mb-4 pb-4 border-b border-border">
              <h2 className="text-lg font-semibold text-foreground mb-2 pr-8">
                {asset.title || 'Untitled asset'}
              </h2>
              {renderAssetTypePill && (
                <div className="mb-2">{renderAssetTypePill(asset.asset_type)}</div>
              )}
              {asset.description && (
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {asset.description}
                </p>
              )}
            </div>

            {/* Preview & downloads */}
            <div className="mb-4 pb-4 border-b border-border">
              <div className="flex items-center justify-between mb-2.5">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Preview & downloads
                </h3>
                {isAdmin && asset.asset_type === 'video' && asset.vimeo_video_id && onToggleEditVideoUrls && (
                  <button
                    type="button"
                    onClick={onToggleEditVideoUrls}
                    className="text-xs text-muted-foreground hover:text-foreground underline"
                  >
                    {isEditingVideoUrls ? 'Cancel' : 'Edit URLs'}
                  </button>
                )}
              </div>

              {/* Video download formats */}
              {asset.asset_type === 'video' && asset.vimeo_video_id ? (
                <div className="space-y-3">
                  {isAdmin &&
                  isEditingVideoUrls &&
                  editingDownloadUrls &&
                  onVideoUrlChange &&
                  onAddVideoFormat &&
                  onRemoveVideoFormat &&
                  onUpdateVideoUrls ? (
                    <div className="space-y-3 border border-border rounded-md p-3 bg-muted/40">
                      {editingDownloadUrls.map((format, index) => (
                        <div key={index} className="flex items-end gap-2">
                          <div className="flex-1">
                            <label className="block text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
                              Resolution
                            </label>
                            <Select
                              value={format.resolution}
                              onValueChange={(v) => onVideoUrlChange(index, 'resolution', v)}
                            >
                              <SelectTrigger className="h-8">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {resolutionOptions.map((res) => (
                                  <SelectItem key={res} value={res}>
                                    {res}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex-[2]">
                            <label className="block text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
                              Download URL
                            </label>
                            <Input
                              value={format.url}
                              onChange={(e) => onVideoUrlChange(index, 'url', e.target.value)}
                              placeholder="https://…"
                              className="h-8"
                            />
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => onRemoveVideoFormat(index)}
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            aria-label="Remove format"
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                      <div className="flex flex-col gap-2 pt-1">
                        <Button variant="outline" size="sm" onClick={onAddVideoFormat}>
                          <Plus className="h-3.5 w-3.5" /> Add format
                        </Button>
                        <Button
                          size="sm"
                          loading={savingUrls}
                          onClick={() =>
                            onUpdateVideoUrls(
                              editingDownloadUrls.filter((f) => f.url.trim() !== '')
                            )
                          }
                        >
                          {savingUrls ? 'Saving…' : 'Save URLs'}
                        </Button>
                      </div>
                    </div>
                  ) : validFormats.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {validFormats.map((format) => {
                        const formatKey = `video-${asset.id}-${format.resolution}`;
                        const isDownloading = downloadingFormats.has(formatKey);
                        return (
                          <Button
                            key={format.resolution}
                            variant="outline"
                            size="sm"
                            disabled={isDownloading}
                            onClick={() => onDownload && onDownload(asset, format.resolution)}
                          >
                            {isDownloading ? (
                              <>
                                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Preparing…
                              </>
                            ) : (
                              <>
                                <Download className="h-3.5 w-3.5" /> {format.resolution}
                              </>
                            )}
                          </Button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">
                      {isAdmin
                        ? 'No download URLs configured. Click "Edit URLs" above to add download links.'
                        : 'No download URLs available for this video.'}
                    </p>
                  )}
                </div>
              ) : null}

              {/* Preview button for non-video */}
              {asset.asset_type !== 'video' && asset.current_version?.id && accessToken ? (
                <Button
                  size="sm"
                  className="mt-1"
                  onClick={async (e) => {
                    e.stopPropagation();
                    const apiUrl = `/api/assets/${asset.id}/preview?version=${asset.current_version!.id}&rendition=original`;
                    const signed = await resolveSignedAssetUrl(apiUrl, accessToken);
                    if (!signed) return;
                    window.open(signed, '_blank', 'noopener,noreferrer');
                  }}
                >
                  <Eye className="h-3.5 w-3.5" /> Preview
                </Button>
              ) : null}
            </div>

            {/* Metadata */}
            <div className="mb-4 pb-4 border-b border-border">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Details
              </h3>
              <dl className="space-y-2.5 text-sm">
                {asset.sku && <Field label="SKU" value={<span className="font-mono">{asset.sku}</span>} />}
                {asset.product_line && <Field label="Product line" value={asset.product_line} />}
                {asset.product_name && <Field label="Product" value={asset.product_name} />}
                {asset.campaign && (
                  <Field
                    label="Campaign"
                    value={
                      <a
                        href={`/admin/dam/campaigns/${asset.campaign.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          window.location.href = `/admin/dam/campaigns/${asset.campaign!.id}`;
                        }}
                        className="text-foreground underline hover:no-underline"
                      >
                        {asset.campaign.name}
                      </a>
                    }
                  />
                )}
                <Field label="Created" value={new Date(asset.created_at).toLocaleDateString()} />
                {asset.current_version && (
                  <>
                    <Field
                      label="Size"
                      value={formatBytes(asset.current_version.file_size) || '—'}
                    />
                    <Field
                      label="File type"
                      value={getFriendlyFileType(asset.current_version.mime_type)}
                    />
                    {asset.current_version.width && asset.current_version.height && (
                      <Field
                        label="Dimensions"
                        value={`${asset.current_version.width} × ${asset.current_version.height} px`}
                      />
                    )}
                  </>
                )}
              </dl>
            </div>

            {asset.tags.length > 0 && (
              <TagSection label="Tags">
                {asset.tags.map((tag) => (
                  <Badge key={tag} variant="muted" className="text-[10px]">
                    {tag}
                  </Badge>
                ))}
              </TagSection>
            )}

            {asset.locales.length > 0 && (
              <TagSection label="Locales">
                {asset.locales.map((locale) => (
                  <Badge key={locale.code} variant="accent" className="text-[10px]">
                    {locale.label}
                  </Badge>
                ))}
              </TagSection>
            )}

            {asset.regions.length > 0 && (
              <TagSection label="Regions">
                {asset.regions.map((region) => (
                  <Badge key={region.code} variant="success" className="text-[10px]">
                    {region.label}
                  </Badge>
                ))}
              </TagSection>
            )}

            {/* Action buttons */}
            <div className="pt-2 space-y-2">
              {asset.current_version?.downloadPath && onDownload && (
                <Button
                  disabled={isDownloadingAsset}
                  loading={isDownloadingAsset}
                  onClick={() => onDownload(asset)}
                  className="w-full"
                >
                  <Download className="h-4 w-4" />
                  {isDownloadingAsset ? 'Preparing…' : 'Download asset'}
                </Button>
              )}
              {isAdmin && onEdit && (
                <Button variant="outline" onClick={() => onEdit(asset)} className="w-full">
                  <Pencil className="h-4 w-4" /> Edit asset
                </Button>
              )}
              {isAdmin && onDelete && (
                <Button
                  variant="outline"
                  onClick={() => onDelete(asset.id)}
                  className="w-full text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" /> Delete asset
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ----------------------------------------------------------------------------
// Small helpers
// ----------------------------------------------------------------------------
function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] text-muted-foreground mb-0.5">{label}</dt>
      <dd className="text-foreground">{value}</dd>
    </div>
  );
}

function TagSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4 pb-4 border-b border-border">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
        {label}
      </h3>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}
