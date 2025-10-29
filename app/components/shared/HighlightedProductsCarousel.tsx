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

  // Only include slides with images, as per the basic Material Tailwind example
  const slides = highlightedProducts.filter(hp => !!hp.product?.picture_url);

  if (slides.length === 0) return null;

  return (
    <Carousel className="rounded-xl" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
      {slides.map((hp) => (
        <img
          key={hp.id}
          src={hp.product!.picture_url as string}
          alt={hp.product?.item_name || 'Product'}
          className="h-full w-full object-cover"
        />
      ))}
    </Carousel>
  );
}
