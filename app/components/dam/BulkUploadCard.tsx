'use client';

import { useState } from 'react';
import { Trash2, ChevronDown, ChevronUp, Image as ImageIcon, FileText, Film, Music } from 'lucide-react';
import { LocaleOption } from './types';
import { Card } from '../qq/card';
import { Input } from '../qq/input';
import { Label } from '../qq/label';
import { Button } from '../qq/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../qq/select';

const NONE_VALUE = '__none__';

interface BulkFile {
  tempId: string;
  file: File;
  inferredAssetType: string;
  inferredAssetTypeId: string | null;
  title: string;
  description: string;
  assetType: string;
  assetTypeId: string | null;
  assetSubtypeId: string | null;
  productLine: string;
  productName: string;
  sku: string;
  selectedTagSlugs: string[];
  selectedLocaleCodes: string[];
  primaryLocale: string | null;
  useTitleAsFilename: boolean;
  campaignId: string | null;
  status?: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
  previewUrl?: string | null; // Thumbnail preview URL (object URL for images, data URL for PDFs)
  overrides?: {
    assetTypeId?: boolean;
    assetSubtypeId?: boolean;
    productLine?: boolean;
    locales?: boolean;
    tags?: boolean;
    campaignId?: boolean;
    sku?: boolean;
  };
}

interface BulkUploadCardProps {
  file: BulkFile;
  onFieldChange: (tempId: string, field: keyof BulkFile, value: any) => void;
  onFieldsChange?: (tempId: string, updates: Partial<BulkFile>) => void;
  onRemove: (tempId: string) => void;
  assetTypes: Array<{ id: string; name: string; slug: string }>;
  assetSubtypes: Array<{ id: string; name: string; slug: string; asset_type_id: string }>;
  products: Array<{ id: number; item_name: string; sku: string }>;
  productLines: Array<{ code: string; name: string }>;
  locales: LocaleOption[];
  allLocales?: LocaleOption[]; // All locales including inactive (for showing current values)
  tags: Array<{ id: string; slug: string; label: string }> | Array<{ slug: string; label: string }>;
  campaigns: Array<{ id: string; name: string }>;
  globalDefaults: {
    assetSubtypeId: string | null;
    productLine: string;
    selectedTagSlugs: string[];
    selectedLocaleCodes: string[];
    campaignId: string | null;
  };
  getEffectiveValue: (file: BulkFile, field: 'assetSubtypeId' | 'productLine' | 'selectedTagSlugs' | 'selectedLocaleCodes' | 'campaignId') => any;
  isUploading: boolean;
  accessToken?: string | null;
  onTagsChange?: (tags: Array<{ id: string; slug: string; label: string }>) => void;
}

export default function BulkUploadCard({
  file,
  onFieldChange,
  onFieldsChange,
  onRemove,
  assetTypes,
  assetSubtypes,
  products,
  productLines,
  locales,
  allLocales,
  tags,
  campaigns,
  globalDefaults,
  getEffectiveValue,
  isUploading,
  accessToken,
  onTagsChange,
}: BulkUploadCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [newTagLabel, setNewTagLabel] = useState('');

  const getFileIcon = () => {
    if (file.assetType === 'image') return <ImageIcon className="h-12 w-12 text-blue-500" />;
    if (file.assetType === 'document' || file.assetType === 'artwork') return <FileText className="h-12 w-12 text-green-500" />;
    if (file.assetType === 'video') return <Film className="h-12 w-12 text-purple-500" />;
    return <FileText className="h-12 w-12 text-gray-500" />;
  };

  const renderThumbnail = () => {
    // Show thumbnail if available (images or PDFs)
    if (file.previewUrl) {
      return (
        <img
          src={file.previewUrl}
          alt={file.file.name}
          className="h-12 w-12 rounded object-cover border border-gray-200"
          onError={(e) => {
            // Fallback to icon if image fails to load
            e.currentTarget.style.display = 'none';
          }}
        />
      );
    }
    // Fallback to icon
    return getFileIcon();
  };

  // Type is always from the file (auto-detected), not from global defaults
  const effectiveAssetTypeId = file.assetTypeId;
  const effectiveAssetSubtypeId = getEffectiveValue(file, 'assetSubtypeId') as string | null;
  const effectiveProductLine = getEffectiveValue(file, 'productLine') as string;
  const effectiveCampaignId = getEffectiveValue(file, 'campaignId') as string | null;
  const effectiveTags = getEffectiveValue(file, 'selectedTagSlugs') as string[];
  const effectiveLocales = getEffectiveValue(file, 'selectedLocaleCodes') as string[];
  // Use effective values (global defaults if not overridden)
  const currentLocales = effectiveLocales;
  const currentTags = effectiveTags;

  const toggleSelection = (list: string[], value: string): string[] => {
    if (list.includes(value)) {
      return list.filter((item) => item !== value);
    }
    return [...list, value];
  };

  const handleLocaleToggle = (code: string) => {
    // Locales are per-file only, no global sync
    const isSelected = currentLocales.includes(code);
    
    if (isSelected) {
      if (currentLocales.length === 1) {
        return; // keep at least one locale
      }
      const nextLocales = currentLocales.filter((item) => item !== code);
      const nextPrimary = file.primaryLocale === code ? nextLocales[0] ?? null : file.primaryLocale;
      // Update selectedLocaleCodes directly (not 'locales')
      const overrides = { ...(file.overrides || {}), locales: true };
      if (onFieldsChange) {
        onFieldsChange(file.tempId, {
          selectedLocaleCodes: nextLocales,
          primaryLocale: nextPrimary,
          overrides: overrides,
        });
      } else {
        onFieldChange(file.tempId, 'selectedLocaleCodes', nextLocales);
        onFieldChange(file.tempId, 'primaryLocale', nextPrimary);
        onFieldChange(file.tempId, 'overrides', overrides);
      }
    } else {
      const newLocales = [...currentLocales, code];
      // Update selectedLocaleCodes directly (not 'locales')
      const overrides = { ...(file.overrides || {}), locales: true };
      if (onFieldsChange) {
        onFieldsChange(file.tempId, {
          selectedLocaleCodes: newLocales,
          primaryLocale: file.primaryLocale || code,
          overrides: overrides,
        });
      } else {
        onFieldChange(file.tempId, 'selectedLocaleCodes', newLocales);
        if (!file.primaryLocale) {
          onFieldChange(file.tempId, 'primaryLocale', code);
        }
        onFieldChange(file.tempId, 'overrides', overrides);
      }
    }
  };

  const handleAddTag = async () => {
    const trimmed = newTagLabel.trim();
    if (!trimmed) return;

    try {
      if (!accessToken) return;
      const response = await fetch('/api/dam/lookups', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        credentials: 'same-origin',
        body: JSON.stringify({ action: 'add-tag', label: trimmed }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to add tag');
      }

      const data = await response.json();
      
      // Add the new tag to this file's selectedTagSlugs
      if (data.slug && !currentTags.includes(data.slug)) {
        handlePerFileOverride('tags', [...currentTags, data.slug]);
      }
      
      // Update the global tags list so it appears in the dropdown
      if (onTagsChange && data.tags) {
        onTagsChange(data.tags);
      }
      setNewTagLabel('');
    } catch (err: any) {
      alert('Failed to add tag: ' + err.message);
    }
  };

  const handlePerFileOverride = (field: 'assetTypeId' | 'assetSubtypeId' | 'productLine' | 'locales' | 'tags' | 'campaignId' | 'sku', value: any) => {
    const overrides = { ...(file.overrides || {}), [field]: true };
    // Map field names to actual BulkFile property names
    const actualField = field === 'locales' ? 'selectedLocaleCodes' : field === 'tags' ? 'selectedTagSlugs' : field;
    // Use atomic update if available, otherwise fall back to separate calls
    if (onFieldsChange) {
      onFieldsChange(file.tempId, {
        [actualField]: value,
        overrides: overrides,
      });
    } else {
      onFieldChange(file.tempId, actualField as keyof BulkFile, value);
      onFieldChange(file.tempId, 'overrides', overrides);
    }
  };

  const rowDisabled = isUploading || file.status === 'uploading';

  return (
    <Card className="hover:shadow transition-shadow">
      {/* Card Header */}
      <div className="flex items-start gap-2 p-2.5 border-b border-border">
        <div className="flex-shrink-0">
          {renderThumbnail()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-base font-semibold text-foreground truncate">{file.file.name}</p>
          <p className="text-xs text-muted-foreground">{(file.file.size / 1024).toFixed(1)} KB</p>
        </div>
        <button
          type="button"
          onClick={() => onRemove(file.tempId)}
          disabled={rowDisabled}
          className="flex-shrink-0 rounded-md p-1 text-muted-foreground hover:text-destructive disabled:opacity-50 transition-colors"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* Status */}
      {file.status === 'uploading' && (
        <div className="px-2.5 py-1 text-xs text-accent bg-accent/10 border-b border-border">Uploading…</div>
      )}
      {file.status === 'success' && (
        <div className="px-2.5 py-1 text-xs text-green-700 bg-green-50 border-b border-border">✓ Uploaded</div>
      )}
      {file.status === 'error' && file.error && (
        <div className="px-2.5 py-1 text-xs text-destructive bg-destructive/10 border-b border-border">✗ {file.error}</div>
      )}

      {/* Main Fields */}
      <div className="p-2.5 space-y-1.5">
        <div>
          <Label className="text-[11px] font-semibold">Title *</Label>
          <Input
            type="text"
            value={file.title}
            onChange={(e) => onFieldChange(file.tempId, 'title', e.target.value)}
            className="mt-1 h-7 text-xs"
            disabled={rowDisabled}
          />
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          <div>
            <Label className="text-[11px] font-semibold">Type *</Label>
            <div className="mt-1">
              <Select
                value={effectiveAssetTypeId || undefined}
                onValueChange={(value) => {
                  const selectedTypeId = value || null;
                  const selectedType = assetTypes.find(t => t.id === selectedTypeId);
                  const slugToEnumMap: Record<string, string> = {
                    'image': 'image',
                    'video': 'video',
                    'document': 'document',
                    'artwork': 'document',
                    'audio': 'audio',
                    'packaging-regulatory': 'document',
                    'campaign': 'document',
                  };
                  const overrides = { ...(file.overrides || {}), assetTypeId: true, assetSubtypeId: true };
                  if (onFieldsChange) {
                    onFieldsChange(file.tempId, {
                      assetTypeId: selectedTypeId,
                      assetType: selectedType ? slugToEnumMap[selectedType.slug] || 'other' : 'other',
                      assetSubtypeId: null,
                      overrides: overrides,
                    });
                  } else {
                    onFieldChange(file.tempId, 'assetTypeId', selectedTypeId);
                    onFieldChange(file.tempId, 'assetType', selectedType ? slugToEnumMap[selectedType.slug] || 'other' : 'other');
                    onFieldChange(file.tempId, 'assetSubtypeId', null);
                    onFieldChange(file.tempId, 'overrides', overrides);
                  }
                }}
                disabled={rowDisabled}
              >
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {assetTypes.map(type => (
                    <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-[11px] font-semibold">Sub-Type *</Label>
            <div className="mt-1">
              <Select
                value={effectiveAssetSubtypeId || undefined}
                onValueChange={(value) => handlePerFileOverride('assetSubtypeId', value || null)}
                disabled={rowDisabled || !effectiveAssetTypeId}
              >
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {assetSubtypes
                    .filter(st => st.asset_type_id === effectiveAssetTypeId)
                    .map(subtype => (
                      <SelectItem key={subtype.id} value={subtype.id}>{subtype.name}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-[11px] font-semibold">Product</Label>
            <div className="mt-1">
              <Select
                value={file.productName || undefined}
                onValueChange={(value) => {
                  const selectedValue = value === NONE_VALUE ? '' : value;
                  const selectedProduct = products.find(p => p.item_name === selectedValue);
                  if (onFieldsChange) {
                    onFieldsChange(file.tempId, {
                      productName: selectedValue,
                      sku: selectedProduct?.sku || '',
                    });
                  } else {
                    onFieldChange(file.tempId, 'productName', selectedValue);
                    onFieldChange(file.tempId, 'sku', selectedProduct?.sku || '');
                  }
                }}
                disabled={rowDisabled}
              >
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE}>None</SelectItem>
                  {products.map(product => (
                    <SelectItem key={product.id} value={product.item_name}>{product.item_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      {/* More Metadata Toggle */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/40 border-t border-border transition-colors"
        disabled={rowDisabled}
      >
        <span>More metadata</span>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )}
      </button>

      {/* Expanded Metadata */}
      {isExpanded && (
        <div className="px-2.5 pb-2.5 pt-1.5 space-y-1.5 border-t border-border bg-muted/30">
          <div>
            <Label className="text-[11px] font-semibold">Description</Label>
            <textarea
              value={file.description}
              onChange={(e) => onFieldChange(file.tempId, 'description', e.target.value)}
              className="mt-1 flex w-full rounded-md border border-input bg-background px-2 py-1 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 resize-none h-16"
              disabled={rowDisabled}
              placeholder="Asset description"
            />
          </div>

          <div>
            <Label className="text-[11px] font-semibold">Product Line</Label>
            <div className="mt-1">
              <Select
                value={effectiveProductLine || undefined}
                onValueChange={(value) =>
                  handlePerFileOverride('productLine', value === NONE_VALUE ? '' : value)
                }
                disabled={rowDisabled}
              >
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE}>None</SelectItem>
                  {productLines.map(pl => (
                    <SelectItem key={pl.code} value={pl.code}>{pl.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-[11px] font-semibold">Campaign</Label>
            <div className="mt-1">
              <Select
                value={effectiveCampaignId || undefined}
                onValueChange={(value) =>
                  handlePerFileOverride('campaignId', value === NONE_VALUE ? null : value)
                }
                disabled={rowDisabled}
              >
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE}>None</SelectItem>
                  {campaigns.map(campaign => (
                    <SelectItem key={campaign.id} value={campaign.id}>{campaign.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-[11px] font-semibold">SKU</Label>
            <Input
              type="text"
              value={file.sku}
              onChange={(e) => handlePerFileOverride('sku', e.target.value)}
              className="mt-1 h-7 text-xs"
              disabled={rowDisabled}
              placeholder="Auto-filled from product"
            />
          </div>

          <div>
            <Label className="text-[11px] font-semibold mb-1 block">Tags</Label>
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1">
                {tags.map((tag) => {
                  const selected = currentTags.includes(tag.slug);
                  return (
                    <button
                      type="button"
                      key={tag.slug}
                      onClick={() => handlePerFileOverride('tags', toggleSelection(currentTags, tag.slug))}
                      disabled={rowDisabled}
                      className={`rounded-md border px-2 py-0.5 text-[10px] font-medium transition-colors ${
                        selected
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-background text-foreground hover:bg-secondary'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      {tag.label}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-1">
                <Input
                  type="text"
                  value={newTagLabel}
                  onChange={(event) => setNewTagLabel(event.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddTag();
                    }
                  }}
                  className="flex-1 h-6 text-[10px] px-2"
                  placeholder="Add new tag"
                  disabled={rowDisabled}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-6 text-[10px] px-2"
                  onClick={handleAddTag}
                  disabled={rowDisabled}
                >
                  Add
                </Button>
              </div>
            </div>
          </div>

          <div>
            <Label className="text-[11px] font-semibold mb-1 block">Locales</Label>
            <div className="space-y-1">
              {(() => {
                // Get active locales
                const activeLocales = locales;
                // Add any currently selected inactive locales
                const selectedInactiveLocales = currentLocales
                  .filter(code => !activeLocales.find(l => l.code === code))
                  .map(code => {
                    const inactive = allLocales?.find(l => l.code === code);
                    return inactive ? { ...inactive, is_inactive: true } : null;
                  })
                  .filter((l): l is LocaleOption & { is_inactive: true } => l !== null);
                const allDisplayLocales = [...activeLocales, ...selectedInactiveLocales];

                return allDisplayLocales.map((locale) => {
                  const selected = currentLocales.includes(locale.code);
                  return (
                    <div key={locale.code} className="flex items-center justify-between rounded-md border border-border bg-background px-2 py-1">
                      <label className="flex items-center gap-1.5 text-[10px] text-foreground">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => handleLocaleToggle(locale.code)}
                          className="h-3.5 w-3.5 rounded border-input text-primary focus:ring-ring"
                          disabled={rowDisabled || (locale as any).is_inactive}
                        />
                        <span>{locale.label}{(locale as any).is_inactive ? ' (inactive)' : ''}</span>
                      </label>
                      {selected && (
                        <label className="flex items-center gap-1 text-[9px] text-muted-foreground">
                          <input
                            type="radio"
                            name={`primary-locale-${file.tempId}`}
                            checked={file.primaryLocale === locale.code}
                            onChange={() => onFieldChange(file.tempId, 'primaryLocale', locale.code)}
                            className="h-2.5 w-2.5 text-primary focus:ring-ring"
                            disabled={rowDisabled}
                          />
                          Primary
                        </label>
                      )}
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

