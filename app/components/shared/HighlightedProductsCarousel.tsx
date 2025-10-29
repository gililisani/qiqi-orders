'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabaseClient';
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
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHighlightedProducts();
  }, []);

  // Auto-rotate every 5 seconds
  useEffect(() => {
    if (highlightedProducts.length <= 1) return;

    const interval = setInterval(() => {
      setCurrentIndex((prevIndex) => 
        prevIndex === highlightedProducts.length - 1 ? 0 : prevIndex + 1
      );
    }, 5000);

    return () => clearInterval(interval);
  }, [highlightedProducts.length]);

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
    setCurrentIndex(currentIndex === 0 ? highlightedProducts.length - 1 : currentIndex - 1);
  };

  const goToNext = () => {
    setCurrentIndex(currentIndex === highlightedProducts.length - 1 ? 0 : currentIndex + 1);
  };

  const goToSlide = (index: number) => {
    setCurrentIndex(index);
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
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Featured Products</h2>
      </div>

      <div id="default-carousel" className="relative w-full" data-carousel="slide">
        {/* Carousel wrapper */}
        <div className="relative h-56 overflow-hidden rounded-lg md:h-96">
          {highlightedProducts.map((highlightedProduct, index) => (
            <div 
              key={highlightedProduct.id}
              className={`absolute block w-full -translate-x-1/2 -translate-y-1/2 top-1/2 left-1/2 duration-700 ease-in-out ${
                index === currentIndex ? 'opacity-100' : 'opacity-0'
              }`}
              data-carousel-item
            >
              <div className="relative h-full w-full">
                {/* Background Image */}
                {highlightedProduct.product?.picture_url ? (
                  <img 
                    src={highlightedProduct.product.picture_url} 
                    className="absolute inset-0 w-full h-full object-cover" 
                    alt={highlightedProduct.product?.item_name || 'Product'}
                  />
                ) : (
                  <div className="absolute inset-0 w-full h-full bg-gradient-to-br from-gray-100 to-gray-200"></div>
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
            </div>
          ))}
        </div>
        
        {/* Slider indicators */}
        {highlightedProducts.length > 1 && (
          <div className="absolute z-30 flex -translate-x-1/2 bottom-5 left-1/2 space-x-3 rtl:space-x-reverse">
            {highlightedProducts.map((_, index) => (
              <button 
                key={index}
                type="button" 
                className={`w-3 h-3 rounded-full transition ${
                  index === currentIndex 
                    ? 'bg-white' 
                    : 'bg-white/50 hover:bg-white/75'
                }`}
                aria-current={index === currentIndex ? "true" : "false"}
                aria-label={`Slide ${index + 1}`}
                onClick={() => goToSlide(index)}
              />
            ))}
          </div>
        )}
        
        {/* Slider controls */}
        {highlightedProducts.length > 1 && (
          <>
            <button 
              type="button" 
              className="absolute top-0 start-0 z-30 flex items-center justify-center h-full px-4 cursor-pointer group focus:outline-none" 
              onClick={goToPrevious}
            >
              <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-white/30 group-hover:bg-white/50 group-focus:ring-4 group-focus:ring-white group-focus:outline-none">
                <svg className="w-4 h-4 text-white" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 6 10">
                  <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 1 1 5l4 4"/>
                </svg>
                <span className="sr-only">Previous</span>
              </span>
            </button>
            <button 
              type="button" 
              className="absolute top-0 end-0 z-30 flex items-center justify-center h-full px-4 cursor-pointer group focus:outline-none" 
              onClick={goToNext}
            >
              <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-white/30 group-hover:bg-white/50 group-focus:ring-4 group-focus:ring-white group-focus:outline-none">
                <svg className="w-4 h-4 text-white rtl:rotate-180" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 6 10">
                  <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m1 9 4-4-4-4"/>
                </svg>
                <span className="sr-only">Next</span>
              </span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
