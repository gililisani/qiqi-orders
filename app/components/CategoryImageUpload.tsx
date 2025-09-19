'use client';

import { useState, useRef } from 'react';
import { supabase } from '../../lib/supabaseClient';

interface CategoryImageUploadProps {
  onImageUploaded: (url: string) => void;
  currentImageUrl?: string;
  className?: string;
}

export default function CategoryImageUpload({ onImageUploaded, currentImageUrl, className = '' }: CategoryImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentImageUrl || null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resizeImage = (file: File): Promise<File> => {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();

      img.onload = () => {
        // Calculate proportional dimensions
        const maxWidth = 300;
        const maxHeight = 150;
        
        let { width, height } = img;
        
        // Calculate scaling factor to fit within max dimensions
        const scaleX = maxWidth / width;
        const scaleY = maxHeight / height;
        const scale = Math.min(scaleX, scaleY); // Use the smaller scale to ensure it fits
        
        // Calculate new dimensions
        const newWidth = Math.round(width * scale);
        const newHeight = Math.round(height * scale);
        
        // Set canvas size to new proportional dimensions
        canvas.width = newWidth;
        canvas.height = newHeight;

        // Draw and resize the image proportionally
        ctx?.drawImage(img, 0, 0, newWidth, newHeight);

        // Convert canvas to blob
        canvas.toBlob((blob) => {
          if (blob) {
            // Create new file with resized image
            const resizedFile = new File([blob], file.name, {
              type: 'image/jpeg',
              lastModified: Date.now(),
            });
            resolve(resizedFile);
          } else {
            resolve(file); // Fallback to original if resizing fails
          }
        }, 'image/jpeg', 0.9); // 90% quality
      };

      img.onerror = () => {
        resolve(file); // Fallback to original if image load fails
      };

      // Load the image
      const reader = new FileReader();
      reader.onload = (e) => {
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    });
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type (including SVG)
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
    if (!validTypes.includes(file.type)) {
      alert('Please select a valid image file (JPEG, PNG, GIF, WebP, or SVG).');
      return;
    }

    setUploading(true);

    try {
      console.log('Starting upload for file:', file.name, 'Type:', file.type, 'Size:', file.size);
      
      let fileToUpload = file;
      let fileExt = file.name.split('.').pop()?.toLowerCase() || 'jpg';

      // Handle SVG files (no resizing needed)
      if (file.type === 'image/svg+xml') {
        console.log('Processing SVG file as-is');
        // For SVG files, upload as-is without resizing
        fileToUpload = file;
        fileExt = 'svg';
      } else {
        console.log('Processing raster image with resizing');
        // For raster images, resize proportionally
        fileToUpload = await resizeImage(file);
        fileExt = 'jpg'; // Always use JPG after resizing
        console.log('Image resized, new size:', fileToUpload.size);
      }
      
      // Create unique filename
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
      const filePath = `category-images/${fileName}`;
      
      console.log('Uploading to path:', filePath, 'File size:', fileToUpload.size);

      // Upload file to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('category-images')
        .upload(filePath, fileToUpload);

      if (uploadError) {
        throw uploadError;
      }

      // Get public URL
      const { data } = supabase.storage
        .from('category-images')
        .getPublicUrl(filePath);

      const publicUrl = data.publicUrl;
      
      setPreviewUrl(publicUrl);
      onImageUploaded(publicUrl);
    } catch (error) {
      console.error('Error uploading category image:', error);
      
      // Provide more specific error messages
      if (error instanceof Error) {
        if (error.message.includes('storage')) {
          alert('Storage error: Please check if the category-images bucket exists in Supabase.');
        } else if (error.message.includes('permission')) {
          alert('Permission error: Please ensure you have admin access.');
        } else if (error.message.includes('size')) {
          alert('File too large: Please select an image smaller than 5MB.');
        } else {
          alert(`Upload failed: ${error.message}`);
        }
      } else {
        alert('Failed to upload image. Please try again.');
      }
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveImage = async () => {
    if (previewUrl && previewUrl.includes('category-images')) {
      // Extract file path from URL to delete from storage
      try {
        const urlParts = previewUrl.split('/');
        const fileName = urlParts[urlParts.length - 1];
        const filePath = `category-images/${fileName}`;
        
        await supabase.storage
          .from('category-images')
          .remove([filePath]);
      } catch (error) {
        console.error('Error deleting old image:', error);
      }
    }
    
    setPreviewUrl(null);
    onImageUploaded('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className={`space-y-4 ${className}`}>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Category Image
        </label>
        
        {previewUrl ? (
          <div className="space-y-2">
            <div className="relative inline-block">
              <img
                src={previewUrl}
                alt="Category preview"
                className="w-48 h-24 object-cover rounded-lg border border-gray-300"
              />
              <button
                type="button"
                onClick={handleRemoveImage}
                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm hover:bg-red-600"
              >
                ×
              </button>
            </div>
            <p className="text-sm text-gray-600">Optimized for category headers</p>
            <p className="text-xs text-gray-500">Click to change image</p>
          </div>
        ) : (
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
            <svg
              className="mx-auto h-12 w-12 text-gray-400"
              stroke="currentColor"
              fill="none"
              viewBox="0 0 48 48"
            >
              <path
                d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <p className="mt-2 text-sm text-gray-600">
              Click to upload a category image
            </p>
            <p className="text-xs text-gray-500">
              PNG, JPG, GIF, WebP, SVG up to 5MB
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Raster images resized proportionally, SVG uploaded as-is
            </p>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          disabled={uploading}
          className="hidden"
        />
      </div>

      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className="w-full bg-gray-100 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-200 transition disabled:opacity-50"
      >
        {uploading ? 'Uploading...' : previewUrl ? 'Change Image' : 'Select Image'}
      </button>
    </div>
  );
}
