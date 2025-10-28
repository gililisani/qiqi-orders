'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
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
          product:Products(
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
          <div className="h-48 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (highlightedProducts.length === 0) {
    return null; // Don't show anything if no highlighted products
  }

  const currentProduct = highlightedProducts[currentIndex];

  return (
    <div className="bg-white rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Featured Products</h2>
        {highlightedProducts.length > 1 && (
          <div className="flex items-center space-x-2">
            <button
              onClick={goToPrevious}
              className="p-2 text-gray-400 hover:text-gray-600 transition"
            >
              <ChevronLeftIcon className="h-5 w-5" />
            </button>
            <button
              onClick={goToNext}
              className="p-2 text-gray-400 hover:text-gray-600 transition"
            >
              <ChevronRightIcon className="h-5 w-5" />
            </button>
          </div>
        )}
      </div>

      <div className="relative">
        <div className="overflow-hidden rounded-lg">
          <div className="flex transition-transform duration-500 ease-in-out">
            <div className="w-full flex-shrink-0">
              <div className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-lg p-6">
                <div className="flex items-center space-x-6">
                  {currentProduct.product.picture_url && (
                    <div className="flex-shrink-0">
                      <img
                        src={currentProduct.product.picture_url}
                        alt={currentProduct.product.item_name}
                        className="w-32 h-32 object-cover rounded-lg shadow-md"
                      />
                    </div>
                  )}
                  
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <h3 className="text-xl font-semibold text-gray-900">
                        {currentProduct.product.item_name}
                      </h3>
                      {currentProduct.is_new && (
                        <span className="bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full">
                          NEW
                        </span>
                      )}
                    </div>
                    
                    <p className="text-gray-600 mb-4">
                      {currentProduct.product.category?.name || 'Featured Product'}
                    </p>
                    
                    <Link
                      href="/client/orders/new"
                      className="inline-flex items-center px-4 py-2 bg-black text-white rounded-md hover:opacity-90 transition"
                    >
                      Order Now
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Dots indicator */}
        {highlightedProducts.length > 1 && (
          <div className="flex justify-center mt-4 space-x-2">
            {highlightedProducts.map((_, index) => (
              <button
                key={index}
                onClick={() => goToSlide(index)}
                className={`w-2 h-2 rounded-full transition ${
                  index === currentIndex ? 'bg-black' : 'bg-gray-300'
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
