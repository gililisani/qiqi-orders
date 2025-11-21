'use client';

import { useState, useEffect, useRef, memo } from 'react';
import { PhotoIcon, EyeIcon, ArrowDownTrayIcon, TrashIcon, CheckIcon } from '@heroicons/react/24/outline';
import { AssetRecord } from './types';
import { formatBytes, ensureTokenUrl, getFileTypeBadge, getStaticDocumentThumbnail } from './utils';

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

  // Thumbnails are generated at 400px max, so display them smaller to avoid upscaling
  // Compact: 160px height, ~240px width (downscaled from 400px)
  // Comfortable: 200px height, ~300px width (downscaled from 400px)
  const thumbnailHeight = isCompact ? '160px' : viewMode === 'comfortable' ? '200px' : '200px';
  const maxWidth = isCompact ? '240px' : '300px'; // Ensure we never exceed thumbnail native size

  // Lazy loading state
  const [isInView, setIsInView] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const imgRef = useRef<HTMLDivElement>(null);

  // Intersection Observer for lazy loading
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
      { rootMargin: '50px' } // Start loading 50px before entering viewport
    );

    observer.observe(imgRef.current);

    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <div
      className="group relative bg-white rounded-md border border-gray-200 overflow-hidden shadow-sm hover:shadow-md transition-all cursor-pointer"
      style={{ maxWidth }}
      onMouseEnter={() => onMouseEnter(asset.id)}
      onMouseLeave={onMouseLeave}
      onClick={() => onClick(asset)}
    >
      {/* Selection Checkbox (Admin only) */}
      {isAdmin && onToggleSelection && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelection(asset.id);
          }}
          className={`absolute top-1.5 left-1.5 z-20 flex h-5 w-5 items-center justify-center rounded border-2 shadow-sm transition ${
            isSelected 
              ? 'border-blue-600 bg-blue-600' 
              : 'border-gray-300 bg-white hover:border-gray-400'
          }`}
          aria-label={isSelected ? 'Deselect asset' : 'Select asset'}
        >
          {isSelected && <CheckIcon className="h-4 w-4 text-white font-bold" strokeWidth={3} />}
        </button>
      )}

      {/* Thumbnail */}
      <div ref={imgRef} className="relative flex items-center justify-center overflow-hidden bg-gray-50" style={{ height: thumbnailHeight }}>
        {asset.asset_type === 'video' && asset.vimeo_video_id ? (
          <img
            src={isInView ? `https://vumbnail.com/${asset.vimeo_video_id}.jpg` : ''}
            alt={asset.title}
            className="object-contain max-w-full max-h-full"
            onLoad={() => setImageLoaded(true)}
            onError={(e) => {
              (e.target as HTMLImageElement).src = `https://i.vimeocdn.com/video/${asset.vimeo_video_id}_640.jpg`;
            }}
          />
        ) : (() => {
          // Check for static Word/Excel thumbnails first
          const staticThumbnail = getStaticDocumentThumbnail(asset.current_version?.mime_type);
          if (staticThumbnail) {
            return (
              <img
                src={staticThumbnail}
                alt={asset.title}
                className="object-contain max-w-full max-h-full"
                onLoad={() => setImageLoaded(true)}
              />
            );
          }
          // Fall back to regular preview path
          return accessToken && asset.current_version?.previewPath ? (
            <>
              {isInView && (
                <img
                  src={ensureTokenUrl(asset.current_version.previewPath, accessToken)}
                  alt={asset.title}
                  className="object-contain max-w-full max-h-full"
                  onLoad={() => setImageLoaded(true)}
                  onError={() => setImageLoaded(false)}
                />
              )}
              {!imageLoaded && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-200">
                  <div className="w-full h-full bg-gray-200 animate-pulse flex items-center justify-center">
                    <PhotoIcon className="h-8 w-8 text-gray-400" />
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex h-full w-full items-center justify-center text-gray-400">
              <PhotoIcon className="h-12 w-12" />
            </div>
          );
        })()}

        {/* File Type/Resolution Badge */}
        {asset.current_version && (
          <span className="absolute bottom-1.5 right-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
            {getFileTypeBadge(asset)}
          </span>
        )}

        {/* Hover Overlay with Actions */}
        {isHovered && (
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/30 to-transparent flex items-center justify-center gap-1.5 transition-opacity duration-200">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClick(asset);
              }}
              className="rounded-md bg-white/95 p-1 hover:bg-white transition shadow-sm"
              title="View"
            >
              <EyeIcon className="h-3.5 w-3.5 text-gray-900" />
            </button>
            {asset.current_version?.downloadPath && onDownload && (
              <button
                type="button"
                disabled={isDownloading}
                onClick={async (e) => {
                  e.stopPropagation();
                  await onDownload(asset);
                }}
                className="rounded-md bg-white/95 p-1 hover:bg-white transition shadow-sm disabled:opacity-50 disabled:cursor-wait"
                title={isDownloading ? "Preparing..." : "Download"}
              >
                {isDownloading ? (
                  <svg className="animate-spin h-3.5 w-3.5 text-gray-900" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : (
                  <ArrowDownTrayIcon className="h-3.5 w-3.5 text-gray-900" />
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
                className="rounded-md bg-white/95 p-1 hover:bg-white transition shadow-sm"
                title="Delete"
              >
                <TrashIcon className="h-3.5 w-3.5 text-red-600" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Card Footer */}
      <div className="p-2 space-y-1">
        <h4 className="text-xs font-semibold text-gray-900 truncate leading-tight">{asset.title}</h4>
        <div className="flex items-center gap-1.5 flex-wrap">
          {renderAssetTypePill && renderAssetTypePill(asset.asset_type, 'sm')}
          {asset.asset_subtype_id ? (() => {
            const subtype = assetSubtypes.find(s => s.id === asset.asset_subtype_id);
            return subtype ? (
              <span className="text-[10px] text-gray-600 truncate">{subtype.name}</span>
            ) : null;
          })() : asset.locales.length > 0 && (
            <span className="text-[10px] text-gray-500">{asset.locales[0].code}</span>
          )}
        </div>
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison function for memoization
  // Only re-render if these props change
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

