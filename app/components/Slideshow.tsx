'use client';

import { useState } from 'react'; // Import the useState hook
import Image from 'next/image';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi, // Import the type for the carousel's API
} from "@/components/ui/carousel";
import { Button } from '@/components/ui/button'; // We'll use our standard button for the arrows

interface SlideshowProps {
  images: {
    src: string;
    alt: string;
    name: string;
  }[];
  editable?: boolean;
  onReplace?: (index: number) => void;
}

export default function Slideshow({ images, editable = false, onReplace }: SlideshowProps) {
  // State to hold the carousel's API for programmatic control
  const [api, setApi] = useState<CarouselApi>();

  return (
    // We wrap everything in a flex container to position our custom controls
    <div className="flex flex-col items-center w-full space-y-4">
      <Carousel
        setApi={setApi} // This connects the carousel's controls to our 'api' state
        className="w-full max-w-6xl"
        opts={{
          align: "start",
          loop: true,
          duration: 30,
          dragFree: true,
        }}
      >
        <CarouselContent className="-ml-8">
          {images.map((image, index) => (
            <CarouselItem key={index} className="pl-8 basis-full sm:basis-1/2 md:basis-1/3 lg:basis-1/4">
              <div className="flex flex-col items-center justify-center space-y-4 select-none">
                <div className="relative w-64 h-64 overflow-hidden rounded-full shadow-lg group">
                    <Image
                      src={image.src}
                      alt={image.alt}
                      layout="fill"
                      objectFit="cover"
                      className="transition-transform duration-300 group-hover:scale-105"
                    />
                    {editable && (
                      <div className="absolute inset-0 rounded-full bg-black/35 flex items-center justify-center">
                        <button
                          type="button"
                          onClick={() => onReplace && onReplace(index)}
                          className="z-10 flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white rounded-full px-4 py-2 text-sm font-medium shadow-lg"
                          aria-label="Change photo"
                          title="Change photo"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4Z"/></svg>
                          Change photo
                        </button>
                      </div>
                    )}
                </div>
                <p className="font-semibold text-lg text-gray-700">{image.name}</p>
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
        {/* We no longer render the default side arrows */}
      </Carousel>

      {/* These are our new, custom arrow buttons, placed below the carousel */}
      <div className="flex items-center justify-center gap-4">
        <Button
          variant="outline"
          size="icon"
          onClick={() => api?.scrollPrev()} // Use the API to scroll
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={() => api?.scrollNext()} // Use the API to scroll
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
        </Button>
      </div>
    </div>
  );
}