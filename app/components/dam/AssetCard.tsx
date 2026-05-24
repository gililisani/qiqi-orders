'use client';

/**
 * AssetCard — single asset tile in the DAM grid. Shared by admin and
 * client surfaces (props gate admin-only affordances like selection and
 * delete). Visually: qq Card-style tile with hover-overlay actions.
 */

import { useState, useEffect, useRef, memo } from 'react';
import { Image as ImageIcon, Eye, Download, Trash2, Check, Loader2 } from 'lucide-react';
import { AssetRecord } from './types';
import { getFileTypeBadge, getStaticDocumentThumbnail, resolveSignedAssetUrl } from './utils';

interface AssetCardProps {
  asset: AssetRecord;
  viewMode: 'compact' | 'comfortable' | 'grid' | 'list';
  accessToken: string | null;
  hoveredAssetId: string | null;
  onMouseEnter: (assetId: string) => void;
  onMouseLeave: () => void;
  onClick: (asset: AssetRecord) => void;
  // Admin-only props
  isAdmin?: boolean;
  selectedAssetIds?: Set<string>;
  onToggleSelection?: (assetId: string) => void;
  onDownload?: (asset: AssetRecord) => Promise<void>;
  onDelete?: (assetId: string) => void;
  downloadingFormats?: Set<string>;
  assetSubtypes?: Array<{ id: string; name: string; slug: string; asset_type_id: string }>;
  renderAssetTypePill?: (type: string, size?: 'sm' | 'md') => JSX.Element | null;
}

const AssetCard = memo(function AssetCard({
  asset,
  viewMode,
  accessToken,
  hoveredAssetId,
  onMouseEnter,
  onMouseLeave,
  onClick,
  isAdmin = false,
  selectedAssetIds,
  onToggleSelection,
  onDownload,
  onDelete,
  downloadingFormats = new Set(),
  assetSubtypes = [],
  renderAssetTypePill,
}: AssetCardProps) {
  const isCompact = viewMode === 'compact';
  const isHovered = hoveredAssetId === asset.id;
  const isSelected = selectedAssetIds?.has(asset.id) ?? false;
  const cardDownloadKey = `card-${asset.id}`;
  const isDownloading = downloadingFormats.has(cardDownloadKey);

  const thumbnailHeight = isCompact ? '160px' : '200px';
  const maxWidth = isCompact ? '240px' : '300px';

  const [isInView, setIsInView] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [resolvedThumbUrl, setResolvedThumbUrl] = useState<string>('');
  const imgRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!imgRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true);
            observer.disconnect();
          }
        });
      },
      { rootMargin: '50px' }
    );
    observer.observe(imgRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!isInView || !accessToken) return;
      const path = asset.current_version?.previewPath;
      if (!path) return;
      const signed = await resolveSignedAssetUrl(path, accessToken);
      if (active) setResolvedThumbUrl(signed);
    })();
    return () => {
      active = false;
    };
  }, [isInView, accessToken, asset.current_version?.previewPath]);

  const staticThumbnail = getStaticDocumentThumbnail(asset.current_version?.mime_type);

  return (
    <div
      className="group relative bg-background rounded-md border border-border overflow-hidden hover:border-foreground/30 hover:shadow-sm transition-all cursor-pointer"
      style={{ maxWidth }}
      onMouseEnter={() => onMouseEnter(asset.id)}
      onMouseLeave={onMouseLeave}
      onClick={() => onClick(asset)}
    >
      {/* Selection checkbox (admin only) */}
      {isAdmin && onToggleSelection && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelection(asset.id);
          }}
          className={`absolute top-1.5 left-1.5 z-20 flex h-5 w-5 items-center justify-center rounded border transition ${
            isSelected
              ? 'border-foreground bg-foreground text-background'
              : 'border-border bg-background hover:border-foreground/40'
          }`}
          aria-label={isSelected ? 'Deselect asset' : 'Select asset'}
        >
          {isSelected && <Check className="h-3 w-3" strokeWidth={3} />}
        </button>
      )}

      {/* Thumbnail */}
      <div
        ref={imgRef}
        className="relative flex items-center justify-center overflow-hidden bg-muted/40"
        style={{ height: thumbnailHeight }}
      >
        {asset.asset_type === 'video' && asset.vimeo_video_id ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={isInView ? `https://vumbnail.com/${asset.vimeo_video_id}.jpg` : ''}
            alt={asset.title}
            className="object-contain max-w-full max-h-full"
            onLoad={() => setImageLoaded(true)}
            onError={(e) => {
              (e.target as HTMLImageElement).src = `https://i.vimeocdn.com/video/${asset.vimeo_video_id}_640.jpg`;
            }}
          />
        ) : staticThumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={staticThumbnail}
            alt={asset.title}
            className="object-contain max-w-full max-h-full"
            onLoad={() => setImageLoaded(true)}
          />
        ) : accessToken && asset.current_version?.previewPath ? (
          <>
            {isInView && resolvedThumbUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={resolvedThumbUrl}
                alt={asset.title}
                className="object-contain max-w-full max-h-full"
                onLoad={() => setImageLoaded(true)}
                onError={() => setImageLoaded(false)}
              />
            )}
            {!imageLoaded && (
              <div className="absolute inset-0 flex items-center justify-center bg-muted/40 animate-pulse">
                <ImageIcon className="h-8 w-8 text-muted-foreground" />
              </div>
            )}
          </>
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <ImageIcon className="h-12 w-12" />
          </div>
        )}

        {/* File type / resolution chip */}
        {asset.current_version && (
          <span className="absolute bottom-1.5 right-1.5 rounded-sm bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white tabular-nums">
            {getFileTypeBadge(asset)}
          </span>
        )}

        {/* Hover overlay */}
        {isHovered && (
          <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/25 to-transparent flex items-center justify-center gap-1.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClick(asset);
              }}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-background/95 hover:bg-background shadow-sm transition"
              title="View"
            >
              <Eye className="h-3.5 w-3.5 text-foreground" />
            </button>
            {asset.current_version?.downloadPath && onDownload && (
              <button
                type="button"
                disabled={isDownloading}
                onClick={async (e) => {
                  e.stopPropagation();
                  await onDownload(asset);
                }}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-background/95 hover:bg-background shadow-sm transition disabled:opacity-50 disabled:cursor-wait"
                title={isDownloading ? 'Preparing…' : 'Download'}
              >
                {isDownloading ? (
                  <Loader2 className="h-3.5 w-3.5 text-foreground animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5 text-foreground" />
                )}
              </button>
            )}
            {isAdmin && onDelete && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(asset.id);
                }}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-background/95 hover:bg-background shadow-sm transition"
                title="Delete"
              >
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-2 space-y-1">
        <h4 className="text-xs font-semibold text-foreground truncate leading-tight">
          {asset.title}
        </h4>
        <div className="flex items-center gap-1.5 flex-wrap">
          {renderAssetTypePill && renderAssetTypePill(asset.asset_type, 'sm')}
          {asset.asset_subtype_id ? (() => {
            const subtype = assetSubtypes.find((s) => s.id === asset.asset_subtype_id);
            return subtype ? (
              <span className="text-[10px] text-muted-foreground truncate">{subtype.name}</span>
            ) : null;
          })() : asset.locales.length > 0 && (
            <span className="text-[10px] text-muted-foreground">{asset.locales[0].code}</span>
          )}
        </div>
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  const prevSelected = prevProps.selectedAssetIds?.has(prevProps.asset.id) ?? false;
  const nextSelected = nextProps.selectedAssetIds?.has(nextProps.asset.id) ?? false;
  const prevDownloading = prevProps.downloadingFormats?.has(`card-${prevProps.asset.id}`) ?? false;
  const nextDownloading = nextProps.downloadingFormats?.has(`card-${nextProps.asset.id}`) ?? false;

  return (
    prevProps.asset.id === nextProps.asset.id &&
    prevProps.asset.current_version?.previewPath === nextProps.asset.current_version?.previewPath &&
    prevProps.viewMode === nextProps.viewMode &&
    prevProps.accessToken === nextProps.accessToken &&
    prevProps.hoveredAssetId === nextProps.hoveredAssetId &&
    prevSelected === nextSelected &&
    prevDownloading === nextDownloading &&
    prevProps.asset.title === nextProps.asset.title
  );
});

export default AssetCard;
