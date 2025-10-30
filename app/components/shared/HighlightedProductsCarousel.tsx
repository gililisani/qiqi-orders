'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { Carousel } from '@material-tailwind/react';

interface Product {
  id: number;
  item_name: string;
  picture_url?: string;
  category?: {
    name: string;
  };
}

interface HighlightedProduct {
  id: string;
  product_id: number;
  is_new: boolean;
  display_order: number;
  product: Product;
}

export default function HighlightedProductsCarousel() {
  const [highlightedProducts, setHighlightedProducts] = useState<HighlightedProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHighlightedProducts();
  }, []);

  const fetchHighlightedProducts = async () => {
    try {
      const { data, error } = await supabase
        .from('highlighted_products')
        .select(`
          *,
          product:"Products"(
            id,
            item_name,
            picture_url,
            category:categories(name)
          )
        `)
        .order('display_order', { ascending: true });

      if (error) throw error;
      setHighlightedProducts(data || []);
    } catch (err) {
      console.error('Error fetching highlighted products:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return null;
  }

  if (highlightedProducts.length === 0) {
    return null; // Don't show anything if no highlighted products
  }

  // Use all highlighted products; if an item has no image, show a fallback slide
  const slides = highlightedProducts;
  if (slides.length === 0) return null;

  return (
    <Carousel
      className="rounded-xl h-64 md:h-80"
      placeholder={undefined}
      onPointerEnterCapture={undefined}
      onPointerLeaveCapture={undefined}
      loop
    >
      {slides.map((hp) => {
        const imageUrl = hp.product?.picture_url;
        const title = hp.product?.item_name || 'Product';
        return imageUrl ? (
          <img
            key={hp.id}
            src={imageUrl}
            alt={title}
            className="h-full w-full object-contain bg-white"
          />
        ) : (
          <div
            key={hp.id}
            className="flex h-full w-full items-center justify-center bg-gray-100 text-gray-700"
          >
            {title}
          </div>
        );
      })}
    </Carousel>
  );
}
