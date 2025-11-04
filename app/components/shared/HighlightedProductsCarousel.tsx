'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../../lib/supabaseClient';

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
  const [currentIndex, setCurrentIndex] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetchHighlightedProducts();
  }, []);

  useEffect(() => {
    // Auto-scroll every 5 seconds
    if (highlightedProducts.length > 1) {
      intervalRef.current = setInterval(() => {
        setCurrentIndex((prev) => (prev + 1) % highlightedProducts.length);
      }, 5000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [highlightedProducts]);

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

  const goToPrevious = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    setCurrentIndex((prev) => 
      prev === 0 ? highlightedProducts.length - 1 : prev - 1
    );
    // Restart auto-scroll after manual navigation
    intervalRef.current = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % highlightedProducts.length);
    }, 5000);
  };

  const goToNext = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    setCurrentIndex((prev) => (prev + 1) % highlightedProducts.length);
    // Restart auto-scroll after manual navigation
    intervalRef.current = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % highlightedProducts.length);
    }, 5000);
  };

  const goToSlide = (index: number) => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    setCurrentIndex(index);
    // Restart auto-scroll after manual navigation
    intervalRef.current = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % highlightedProducts.length);
    }, 5000);
  };

  if (loading) {
    return null;
  }

  if (highlightedProducts.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      {/* Title */}
      <h2 className="text-xl font-semibold text-gray-900">
        Feature Products
      </h2>

      {/* Carousel */}
      <div className="relative w-full rounded-xl overflow-hidden bg-white h-64 md:h-80">
        {/* Previous Arrow */}
        {highlightedProducts.length > 1 && (
          <button
            onClick={goToPrevious}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-10 bg-white/90 hover:bg-white rounded-full p-2 shadow-lg transition-all"
            aria-label="Previous product"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="h-6 w-6 text-gray-900"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"
              />
            </svg>
          </button>
        )}

        {/* Next Arrow */}
        {highlightedProducts.length > 1 && (
          <button
            onClick={goToNext}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-10 bg-white/90 hover:bg-white rounded-full p-2 shadow-lg transition-all"
            aria-label="Next product"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="h-6 w-6 text-gray-900"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
              />
            </svg>
          </button>
        )}

        {/* Slide Content */}
        <div className="relative h-full w-full overflow-hidden">
          <div 
            className="flex transition-transform duration-500 ease-in-out h-full"
            style={{ transform: `translateX(-${currentIndex * 100}%)` }}
          >
            {highlightedProducts.map((hp, index) => {
              const productImageUrl = hp.product?.picture_url;
              const productTitle = hp.product?.item_name || 'Product';
              const productIsNew = hp.is_new;
              
              return (
                <div key={hp.id} className="min-w-full h-full relative flex-shrink-0">
                  {productImageUrl ? (
                    <img
                      src={productImageUrl}
                      alt={productTitle}
                      className="h-full w-full object-contain bg-white"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gray-100 text-gray-700">
                      {productTitle}
                    </div>
                  )}

                  {/* NEW Badge */}
                  {productIsNew && (
                    <div className="absolute top-4 right-4 bg-red-600 text-white px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide shadow-lg z-10">
                      NEW
                    </div>
                  )}

                  {/* Product Name Overlay */}
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 via-black/50 to-transparent p-4">
                    <p className="text-white font-medium text-lg">{productTitle}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Navigation Dots */}
        {highlightedProducts.length > 1 && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-10">
            {highlightedProducts.map((_, index) => (
              <button
                key={index}
                onClick={() => goToSlide(index)}
                className={`h-2 rounded-full transition-all ${
                  index === currentIndex
                    ? 'w-8 bg-white'
                    : 'w-2 bg-white/50 hover:bg-white/75'
                }`}
                aria-label={`Go to slide ${index + 1}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
