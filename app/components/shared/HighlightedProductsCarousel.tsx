'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { Carousel } from '@material-tailwind/react';
import Link from 'next/link';

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
    return (
      <div className="bg-white rounded-lg p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="h-96 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (highlightedProducts.length === 0) {
    return null; // Don't show anything if no highlighted products
  }

  return (
    <div className="bg-white rounded-lg p-6">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Featured Products</h2>
      </div>

      <Carousel 
        className="rounded-xl h-96"
        autoplay={highlightedProducts.length > 1}
        loop={true}
        autoplayDelay={5000}
      >
        {highlightedProducts.map((highlightedProduct) => (
          <div 
            key={highlightedProduct.id} 
            className="relative h-full w-full"
          >
            {/* Background Image */}
            {highlightedProduct.product?.picture_url ? (
              <img
                src={highlightedProduct.product.picture_url}
                alt={highlightedProduct.product?.item_name || 'Product'}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="h-full w-full bg-gradient-to-br from-gray-100 to-gray-200"></div>
            )}
            
            {/* Overlay */}
            <div className="absolute inset-0 bg-black bg-opacity-40"></div>
            
            {/* Content */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center text-white px-8">
                <div className="flex items-center justify-center space-x-3 mb-4">
                  <h3 className="text-3xl md:text-4xl font-bold">
                    {highlightedProduct.product?.item_name || 'Featured Product'}
                  </h3>
                  {highlightedProduct.is_new && (
                    <span className="bg-red-500 text-white text-sm font-bold px-3 py-1 rounded-full">
                      NEW
                    </span>
                  )}
                </div>
                
                <p className="text-lg md:text-xl mb-6 opacity-90">
                  {highlightedProduct.product?.category?.name || 'Premium Quality'}
                </p>
                
                <Link
                  href="/client/orders/new"
                  className="inline-flex items-center px-6 py-3 bg-white text-black rounded-lg hover:bg-gray-100 transition font-semibold text-lg"
                >
                  Order Now
                </Link>
              </div>
            </div>
          </div>
        ))}
      </Carousel>
    </div>
  );
}
